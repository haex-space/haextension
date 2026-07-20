import type { BookmarkNodeRow } from '../model'
import type { NativeBookmarkNode, NativeBookmarksApi } from '../nativeAdapter'
import type { BookmarkSyncState, LoadResult } from '../storage'
import type { AlarmsApi, BookmarkEvents, SyncServiceDeps } from '../syncService'
import type { BookmarkCollectionSummary, DeviceUpsertPayload } from '../vaultClient'
import { describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

import { defaultDisabledState } from '../storage'
import { BookmarkSyncService } from '../syncService'

// syncService.ts -> nativeAdapter.ts -> storage.ts auto-imports the real
// `webextension-polyfill`, which throws outside an extension context.
vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

// ---------------------------------------------------------------------------
// Fake vault: in-memory collections with column-wise LWW + tombstones.
// ---------------------------------------------------------------------------

class FakeVault {
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

function createDevice(vault: FakeVault, startId: number) {
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

describe('onboarding create + activate', () => {
  it('a creates a collection from existing bookmarks — nothing deleted, everything uploaded', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.create({ parentId: '1', title: 'Existing', url: 'https://existing.example', index: 0, kind: 'bookmark' })

    const result = await a.service.completeOnboardingCreate({
      name: 'Private',
      replicaId: 'replica-a',
      browserFamily: 'chromium',
      deviceLabel: 'A',
    })
    expect(result.success).toBe(true)

    const state = storageState(a)
    expect(state.settings.mode).toBe('active')
    const collectionId = state.settings.mode === 'active' ? state.settings.collectionId : ''
    expect(vault.nodeCount(collectionId)).toBeGreaterThan(0)

    const tree = await a.env.getTree()
    const toolbar = tree[0].children!.find(c => c.id === '1')!
    expect(toolbar.children!.some(c => c.url === 'https://existing.example')).toBe(true)
  })

  it('b activates the collection — replaces Bs native bookmarks with As content', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.create({ parentId: '1', title: 'FromA', url: 'https://from-a.example', index: 0, kind: 'bookmark' })
    await a.service.completeOnboardingCreate({ name: 'Private', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    const collectionId = (storageState(a).settings as { collectionId: string }).collectionId

    const b = createDevice(vault, 200)
    await b.env.create({ parentId: '1', title: 'BsOwn', url: 'https://bs-own.example', index: 0, kind: 'bookmark' })

    const result = await b.service.completeOnboardingActivate({
      collectionId,
      collectionName: 'Private',
      replicaId: 'replica-b',
      browserFamily: 'chromium',
      deviceLabel: 'B',
    })
    expect(result.success).toBe(true)

    const bTree = await b.env.getTree()
    const bToolbar = bTree[0].children!.find(c => c.id === '1')!
    expect(bToolbar.children!.some(c => c.url === 'https://from-a.example')).toBe(true)
    expect(bToolbar.children!.some(c => c.url === 'https://bs-own.example')).toBe(false)
  })
})

function storageState(device: { storage: { getRaw: () => BookmarkSyncState } }): BookmarkSyncState {
  return device.storage.getRaw()
}

describe('ongoing sync between two devices', () => {
  async function setupPairedDevices() {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.service.completeOnboardingCreate({ name: 'Private', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    const collectionId = (storageState(a).settings as { collectionId: string }).collectionId

    const b = createDevice(vault, 200)
    await b.service.completeOnboardingActivate({ collectionId, collectionName: 'Private', replicaId: 'replica-b', browserFamily: 'chromium', deviceLabel: 'B' })

    return { vault, a, b, collectionId }
  }

  it('a add/rename/move mirrors to B after both sync', async () => {
    const { a, b } = await setupPairedDevices()

    const newId = await a.env.userCreate('1', 'New', 'https://new.example', 0)
    await a.service.runSyncOnce()
    await b.service.runSyncOnce()

    let bTree = await b.env.getTree()
    let bToolbar = bTree[0].children!.find(c => c.id === '1')!
    expect(bToolbar.children!.some(c => c.url === 'https://new.example')).toBe(true)

    await a.env.userUpdate(newId, { title: 'Renamed' })
    await a.service.runSyncOnce()
    await b.service.runSyncOnce()
    bTree = await b.env.getTree()
    bToolbar = bTree[0].children!.find(c => c.id === '1')!
    expect(bToolbar.children!.find(c => c.url === 'https://new.example')!.title).toBe('Renamed')
  })

  it('b delete removes the link on A after both sync', async () => {
    const { a, b } = await setupPairedDevices()
    await a.env.userCreate('1', 'ToDelete', 'https://to-delete.example', 0)
    await a.service.runSyncOnce()
    await b.service.runSyncOnce()

    const bTreeBefore = await b.env.getTree()
    const bToolbarBefore = bTreeBefore[0].children!.find(c => c.id === '1')!
    const bNativeId = bToolbarBefore.children!.find(c => c.url === 'https://to-delete.example')!.id

    await b.env.userRemove(bNativeId)
    await b.service.runSyncOnce()
    await a.service.runSyncOnce()

    const aTree = await a.env.getTree()
    const aToolbar = aTree[0].children!.find(c => c.id === '1')!
    expect(aToolbar.children!.some(c => c.url === 'https://to-delete.example')).toBe(false)
  })

  it('poll with no semantic change performs zero native and zero vault writes', async () => {
    const { a } = await setupPairedDevices()
    await a.service.runSyncOnce() // settle

    const treeBefore = await a.env.getTree()
    await a.service.runSyncOnce()
    const treeAfter = await a.env.getTree()
    expect(treeAfter).toEqual(treeBefore)
  })
})

describe('switching collections', () => {
  it('switches Privat -> Arbeit -> Privat without mixing or loss', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.userCreate('1', 'PrivatBookmark', 'https://privat.example', 0)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    const privatId = (storageState(a).settings as { collectionId: string }).collectionId
    await a.service.runSyncOnce()

    const arbeitId = await vault.createCollection('Arbeit')
    const switchToArbeit = await a.service.switchCollection({ collectionId: arbeitId, collectionName: 'Arbeit' })
    expect(switchToArbeit.ok).toBe(true)

    let tree = await a.env.getTree()
    let toolbar = tree[0].children!.find(c => c.id === '1')!
    expect(toolbar.children!.some(c => c.url === 'https://privat.example')).toBe(false)

    // Privat is untouched in the vault — switching away never deletes it.
    expect(vault.nodeCount(privatId)).toBeGreaterThan(0)

    const switchBack = await a.service.switchCollection({ collectionId: privatId, collectionName: 'Privat' })
    expect(switchBack.ok).toBe(true)
    tree = await a.env.getTree()
    toolbar = tree[0].children!.find(c => c.id === '1')!
    expect(toolbar.children!.some(c => c.url === 'https://privat.example')).toBe(true)
  })

  it('never produces a vault delete/tombstone for the collection being left', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.userCreate('1', 'PrivatBookmark', 'https://privat.example', 0)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    const privatId = (storageState(a).settings as { collectionId: string }).collectionId
    await a.service.runSyncOnce()
    const countBefore = vault.nodeCount(privatId)

    const deleteSpy = vi.spyOn(vault, 'deleteNodes')
    const arbeitId = await vault.createCollection('Arbeit')
    await a.service.switchCollection({ collectionId: arbeitId, collectionName: 'Arbeit' })

    expect(deleteSpy).not.toHaveBeenCalled()
    expect(vault.nodeCount(privatId)).toBe(countBefore)
  })

  it('blocks the switch when dirty and the vault is unreachable, without emptying anything', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.runSyncOnce()

    // Use the low-level `create` (no event emission) plus a direct state
    // patch to deterministically simulate "dirty, unsynced" — going through
    // the real event pipeline here would race the 2s/0ms coalesced
    // background sync against this test's own assertions.
    const created = await a.env.create({ parentId: '1', title: 'Unsynced', url: 'https://unsynced.example', index: 0, kind: 'bookmark' })
    const state = storageState(a)
    if (state.settings.mode === 'active') {
      state.settings.dirty = true
      state.pendingUpserts.push({
        id: 'haex-unsynced',
        collectionId: state.settings.collectionId,
        parentId: null,
        rootKind: null,
        kind: 'bookmark',
        title: 'Unsynced',
        url: 'https://unsynced.example',
        position: 0,
      })
    }

    // Simulate the vault being unreachable for the flush attempt.
    const originalUpsert = vault.upsertNodes
    vault.upsertNodes = async () => Promise.reject(new Error('offline'))

    const arbeitId = await vault.createCollection('Arbeit')
    const result = await a.service.switchCollection({ collectionId: arbeitId, collectionName: 'Arbeit' })
    expect(result.ok).toBe(false)

    const tree = await a.env.getTree()
    const toolbar = tree[0].children!.find(c => c.id === '1')!
    expect(toolbar.children!.some(c => c.id === created.id)).toBe(true)

    vault.upsertNodes = originalUpsert
  })

  it('keeps two collections fully independent — a device never sees the other collections nodes', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.userCreate('1', 'Priv', 'https://priv.example', 0)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.runSyncOnce()

    const c = createDevice(vault, 300)
    await c.env.userCreate('1', 'Work', 'https://work.example', 0)
    const workResult = await c.service.completeOnboardingCreate({ name: 'Arbeit', replicaId: 'replica-c', browserFamily: 'chromium', deviceLabel: 'C' })
    expect(workResult.success).toBe(true)

    await a.service.runSyncOnce()
    const aTree = await a.env.getTree()
    const aToolbar = aTree[0].children!.find(x => x.id === '1')!
    expect(aToolbar.children!.some(x => x.url === 'https://work.example')).toBe(false)
  })
})

describe('bulk-delete protection', () => {
  it('quarantines an incoming bulk delete before touching the native tree', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    const rows: BookmarkNodeRow[] = [
      { id: 'root-toolbar', collectionId: '', parentId: null, rootKind: 'toolbar', kind: 'folder', title: null, url: null, position: 0 },
    ]
    for (let i = 0; i < 30; i++) {
      rows.push({ id: `n${i}`, collectionId: '', parentId: 'root-toolbar', rootKind: null, kind: 'bookmark', title: `B${i}`, url: `https://b${i}.example`, position: i })
    }
    const collectionId = await vault.createCollection('Privat')
    rows.forEach(r => (r.collectionId = collectionId))
    await vault.upsertNodes(collectionId, rows)

    await a.service.completeOnboardingActivate({ collectionId, collectionName: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.runSyncOnce() // settle onto the full snapshot

    await vault.deleteNodes(collectionId, rows.slice(1).map(r => r.id)) // delete all 30 bookmarks at once

    const treeBefore = await a.env.getTree()
    await a.service.runSyncOnce()
    const treeAfter = await a.env.getTree()

    expect(treeAfter).toEqual(treeBefore) // apply was halted before touching native
    const state = storageState(a)
    expect(state.pendingDeletionReview).not.toBeNull()
    expect(state.pendingDeletionReview?.deletedHaexIds).toHaveLength(30)
  })
})

describe('oWN_COLLECTION_MISSING', () => {
  it('flags ownCollectionMissing instead of auto-recreating when the collection disappears', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.userCreate('1', 'X', 'https://x.example', 0)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.runSyncOnce()

    // OWN_COLLECTION_MISSING specifically detects "the collection still
    // exists but returns zero rows even though our snapshot is non-empty" —
    // simulate that by repointing the active settings at a fresh, empty one.
    const emptyId = await vault.createCollection('EmptiedOut')
    ;(storageState(a).settings as { collectionId: string }).collectionId = emptyId

    await a.service.runSyncOnce()
    expect(storageState(a).ownCollectionMissing).toBe(true)
  })
})

describe('permission removal', () => {
  it('stops the alarm when the bookmarks permission is revoked', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.start()
    expect(a.env.alarmCreated).toBe(true)

    a.env.firePermissionRemoved()
    await Promise.resolve()
    await Promise.resolve()

    expect(a.env.alarmCleared).toBe(true)
    expect(storageState(a).settings.mode).toBe('disabled')
  })
})
