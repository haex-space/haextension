import type { BookmarkNodeRow } from '../model'
import type { NativeBookmarkNode, NativeBookmarksApi } from '../nativeAdapter'
import type { BookmarkSyncState, LoadResult } from '../storage'
import type { AlarmsApi, BookmarkEvents, SyncServiceDeps } from '../syncDeps'
import type { BookmarkCollectionSummary, DeviceUpsertPayload } from '../vaultClient'
import { defaultDisabledState } from '../storage'
import { BookmarkSyncService } from '../syncService'

// ---------------------------------------------------------------------------
// Fake vault: in-memory collections with column-wise LWW + tombstones.
// ---------------------------------------------------------------------------

export class FakeVault {
  private collections = new Map<string, { name: string, nodes: Map<string, BookmarkNodeRow> }>()
  private tombstones = new Set<string>()
  private devices: DeviceUpsertPayload[] = []

  createCollection = async (name: string): Promise<string> => {
    const id = `col-${this.collections.size + 1}-${Math.random().toString(36).slice(2, 8)}`
    this.collections.set(id, { name, nodes: new Map() })
    return id
  }

  listCollections = async (): Promise<BookmarkCollectionSummary[]> => {
    return [...this.collections.entries()].map(([id, c]) => ({
      id,
      name: c.name,
      updatedAt: null,
      bookmarkCount: c.nodes.size,
      deviceLabels: this.devices.filter(d => d.collectionId === id).map(d => d.deviceLabel),
    }))
  }

  listNodes = async (collectionId: string): Promise<BookmarkNodeRow[]> => {
    const collection = this.collections.get(collectionId)
    if (!collection)
      throw new Error('COLLECTION_NOT_FOUND')
    return [...collection.nodes.values()]
  }

  upsertNodes = async (collectionId: string, nodes: BookmarkNodeRow[]): Promise<number> => {
    const collection = this.collections.get(collectionId)
    if (!collection)
      throw new Error('COLLECTION_NOT_FOUND')
    let count = 0
    for (const node of nodes) {
      if (this.tombstones.has(node.id))
        continue // delete-wins: a stale replica can never resurrect a tombstoned row
      collection.nodes.set(node.id, node)
      count++
    }
    return count
  }

  deleteNodes = async (collectionId: string, ids: string[]): Promise<number> => {
    const collection = this.collections.get(collectionId)
    if (!collection)
      throw new Error('COLLECTION_NOT_FOUND')
    let count = 0
    for (const id of ids) {
      if (collection.nodes.delete(id))
        count++
      this.tombstones.add(id)
    }
    return count
  }

  upsertDevice = async (payload: DeviceUpsertPayload): Promise<void> => {
    const idx = this.devices.findIndex(d => d.collectionId === payload.collectionId && d.replicaId === payload.replicaId)
    if (idx >= 0)
      this.devices[idx] = payload
    else this.devices.push(payload)
  }

  deleteCollection = async (collectionId: string): Promise<void> => {
    this.collections.delete(collectionId)
  }

  nodeCount(collectionId: string): number {
    return this.collections.get(collectionId)?.nodes.size ?? 0
  }
}

// ---------------------------------------------------------------------------
// Fake native tree + event emission, mirroring nativeAdapter.test.ts's fake.
// ---------------------------------------------------------------------------

function cloneTree(nodes: NativeBookmarkNode[]): NativeBookmarkNode[] {
  return nodes.map(n => ({ ...n, children: n.children ? cloneTree(n.children) : undefined }))
}

class FakeDeviceEnvironment implements NativeBookmarksApi {
  supportsSeparators = false
  roots: NativeBookmarkNode[]
  private index = new Map<string, { node: NativeBookmarkNode, parent: NativeBookmarkNode | null }>()
  private nextId: number
  private createdListeners: Array<(id: string, node: NativeBookmarkNode) => void> = []
  private changedListeners: Array<(id: string, changes: { title?: string, url?: string }) => void> = []
  private movedListeners: Array<(id: string, info: { parentId: string, index: number }) => void> = []
  private removedListeners: Array<(id: string, info: { parentId: string, node: NativeBookmarkNode }) => void> = []
  private permissionRemovedListeners: Array<(p: { permissions?: string[] }) => void> = []
  public alarmListeners: Array<(alarm: { name: string }) => void> = []
  public alarmCreated = false
  public alarmCleared = false

  constructor(startId: number) {
    this.roots = [
      {
        id: '0',
        title: 'root',
        children: [
          { id: '1', title: 'Bookmarks bar', children: [] },
          { id: '2', title: 'Other bookmarks', children: [] },
          { id: '3', title: 'Mobile bookmarks', children: [] },
        ],
      },
    ]
    this.nextId = startId
    this.reindex()
  }

  private reindex() {
    this.index.clear()
    const visit = (nodes: NativeBookmarkNode[], parent: NativeBookmarkNode | null) => {
      for (const node of nodes) {
        this.index.set(node.id, { node, parent })
        if (node.children)
          visit(node.children, node)
      }
    }
    visit(this.roots, null)
  }

  async getTree() {
    return cloneTree(this.roots)
  }

  async create(details: { parentId: string, title: string, url?: string, index: number, kind: 'folder' | 'bookmark' | 'separator' }) {
    const entry = this.index.get(details.parentId)
    if (!entry)
      throw new Error(`parent ${details.parentId} not found`)
    const node: NativeBookmarkNode = {
      id: String(this.nextId++),
      parentId: details.parentId,
      index: details.index,
      title: details.title,
      url: details.kind === 'bookmark' ? details.url : undefined,
      type: details.kind,
      children: details.kind === 'folder' ? [] : undefined,
    }
    entry.node.children ??= []
    entry.node.children.splice(details.index, 0, node)
    this.reindex()
    return { ...node }
  }

  async update(id: string, changes: { title?: string, url?: string }) {
    const entry = this.index.get(id)
    if (!entry)
      throw new Error('not found')
    if (changes.title !== undefined)
      entry.node.title = changes.title
    if (changes.url !== undefined)
      entry.node.url = changes.url
  }

  async move(id: string, destination: { parentId: string, index: number }) {
    const entry = this.index.get(id)
    if (!entry)
      throw new Error('not found')
    const oldSiblings = entry.parent ? (entry.parent.children ?? []) : this.roots
    const idx = oldSiblings.indexOf(entry.node)
    if (idx >= 0)
      oldSiblings.splice(idx, 1)
    const newParentEntry = this.index.get(destination.parentId)
    const newSiblings = newParentEntry ? (newParentEntry.node.children ??= []) : this.roots
    newSiblings.splice(destination.index, 0, entry.node)
    entry.node.parentId = destination.parentId
    this.reindex()
  }

  async removeTree(id: string) {
    const entry = this.index.get(id)
    if (!entry)
      return
    const siblings = entry.parent ? (entry.parent.children ?? []) : this.roots
    const idx = siblings.indexOf(entry.node)
    if (idx >= 0)
      siblings.splice(idx, 1)
    this.reindex()
  }

  find(id: string) {
    return this.index.get(id)?.node ?? null
  }

  // -- user-driven actions (fire real events, like an actual browser would) --

  async userCreate(parentId: string, title: string, url: string | undefined, index: number, kind: 'folder' | 'bookmark' = url ? 'bookmark' : 'folder') {
    const node = await this.create({ parentId, title, url, index, kind })
    this.createdListeners.forEach(cb => cb(node.id, node))
    return node.id
  }

  async userUpdate(id: string, changes: { title?: string, url?: string }) {
    await this.update(id, changes)
    this.changedListeners.forEach(cb => cb(id, changes))
  }

  async userMove(id: string, destination: { parentId: string, index: number }) {
    await this.move(id, destination)
    this.movedListeners.forEach(cb => cb(id, destination))
  }

  async userRemove(id: string) {
    const entry = this.index.get(id)
    if (!entry)
      return
    const parentId = entry.parent?.id ?? '0'
    const nodeSnapshot = cloneTree([entry.node])[0]
    await this.removeTree(id)
    this.removedListeners.forEach(cb => cb(id, { parentId, node: nodeSnapshot }))
  }

  fireAlarm() {
    this.alarmListeners.forEach(cb => cb({ name: 'haex-pass-bookmark-sync' }))
  }

  firePermissionRemoved() {
    this.permissionRemovedListeners.forEach(cb => cb({ permissions: ['bookmarks'] }))
  }

  events(): BookmarkEvents {
    return {
      onCreated: cb => this.createdListeners.push(cb),
      onChanged: cb => this.changedListeners.push(cb),
      onMoved: cb => this.movedListeners.push(cb),
      onRemoved: cb => this.removedListeners.push(cb),
      onPermissionRemoved: cb => this.permissionRemovedListeners.push(cb),
    }
  }

  alarms(): AlarmsApi {
    return {
      create: () => { this.alarmCreated = true },
      clear: async () => {
        this.alarmCleared = true
        return true
      },
      onAlarm: cb => this.alarmListeners.push(cb),
    }
  }
}

function createInMemoryStorage() {
  let state: BookmarkSyncState = defaultDisabledState()
  return {
    loadState: async (): Promise<LoadResult> => ({ ok: true, state }),
    saveState: async (next: BookmarkSyncState): Promise<void> => { state = next },
    getRaw: () => state,
  }
}

let now = 0
function fakeNow() {
  now += 1
  return `t${now}`
}

export function createDevice(vault: FakeVault, startId: number) {
  const env = new FakeDeviceEnvironment(startId)
  const storage = createInMemoryStorage()
  const deps: SyncServiceDeps = {
    api: env,
    events: env.events(),
    alarms: env.alarms(),
    storage: { loadState: storage.loadState, saveState: storage.saveState },
    // Forwarding thunks (not direct references) so a test can monkey-patch a
    // method on `vault` after devices are already constructed (e.g. to
    // simulate the vault going offline mid-test).
    vault: {
      listCollections: (...args) => vault.listCollections(...args),
      createCollection: (...args) => vault.createCollection(...args),
      listNodes: (...args) => vault.listNodes(...args),
      upsertNodes: (...args) => vault.upsertNodes(...args),
      deleteNodes: (...args) => vault.deleteNodes(...args),
      upsertDevice: (...args) => vault.upsertDevice(...args),
    },
    now: fakeNow,
    coalesceMs: 0,
  }
  const service = new BookmarkSyncService(deps)
  return { env, storage, service }
}

export function storageState(device: { storage: { getRaw: () => BookmarkSyncState } }): BookmarkSyncState {
  return device.storage.getRaw()
}
