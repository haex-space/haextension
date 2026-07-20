// Event/sync state machine: coordinates native bookmark events, the local
// journal/snapshot/binding state, and the active collection against the
// vault. Deliberately "dumb" — it mirrors, it never merges; convergence is
// the vault CRDT's job.
//
// All WebExtension access is injected (`SyncServiceDeps`) so this whole
// module is testable with a fake vault (in-memory collections with
// column-wise LWW + tombstones) and a fake bookmark tree — no `browser`
// global required.

import type { BookmarkCollectionSummary, DeviceUpsertPayload } from './vaultClient'
import type { NativeBookmarkNode, NativeBookmarksApi } from './nativeAdapter'
import type { BookmarkNodeRow, BrowserFamily } from './model'
import type { BookmarkSyncState, LoadResult } from './storage'
import { diffForests, isDiffEmpty, rootKindForNativeId } from './model'
import { activateCollection, applyDiff, nativeKind, recoverJournal, seedCollectionFromNative } from './nativeAdapter'
import { addBinding, buildBindingMaps, bufferDelete, bufferUpsert, removeBindingByHaexId } from './storage'

export const BOOKMARK_SYNC_ALARM_NAME = 'haex-pass-bookmark-sync'
const ALARM_PERIOD_MINUTES = 5
const DEFAULT_COALESCE_MS = 2000

// Bulk-delete protection thresholds (see plan 002, "Laufender Sync").
const BULK_DELETE_MIN_ABSOLUTE = 20
const BULK_DELETE_MIN_RATIO = 0.25
const BULK_DELETE_HARD_ABSOLUTE = 500

export const COLLECTION_NOT_FOUND = 'COLLECTION_NOT_FOUND'
export const OWN_COLLECTION_MISSING = 'OWN_COLLECTION_MISSING'

export interface BookmarkEvents {
  onCreated: (cb: (id: string, node: NativeBookmarkNode) => void) => void
  onChanged: (cb: (id: string, changes: { title?: string, url?: string }) => void) => void
  onMoved: (cb: (id: string, info: { parentId: string, index: number }) => void) => void
  onRemoved: (cb: (id: string, info: { parentId: string, node: NativeBookmarkNode }) => void) => void
  onPermissionRemoved: (cb: (permissions: { permissions?: string[] }) => void) => void
}

export interface AlarmsApi {
  create: (name: string, info: { periodInMinutes: number }) => void
  clear: (name: string) => Promise<boolean>
  onAlarm: (cb: (alarm: { name: string }) => void) => void
}

export interface VaultClientDeps {
  listCollections: () => Promise<BookmarkCollectionSummary[]>
  createCollection: (name: string) => Promise<string>
  listNodes: (collectionId: string) => Promise<BookmarkNodeRow[]>
  upsertNodes: (collectionId: string, nodes: BookmarkNodeRow[]) => Promise<number>
  deleteNodes: (collectionId: string, ids: string[]) => Promise<number>
  upsertDevice: (payload: DeviceUpsertPayload) => Promise<void>
}

export interface StorageDeps {
  loadState: () => Promise<LoadResult>
  saveState: (state: BookmarkSyncState) => Promise<void>
}

export interface SyncServiceDeps {
  api: NativeBookmarksApi
  events: BookmarkEvents
  alarms: AlarmsApi
  storage: StorageDeps
  vault: VaultClientDeps
  now: () => string
  coalesceMs?: number
}

export interface SwitchTarget {
  collectionId: string
  collectionName: string
}

export type SwitchResult
  = | { ok: true }
    | { ok: false, error: 'DIRTY_AND_UNSYNCED' | string }

function findNodeById(roots: NativeBookmarkNode[], id: string): NativeBookmarkNode | null {
  for (const node of roots) {
    if (node.id === id)
      return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found)
        return found
    }
  }
  return null
}

function isBulkDelete(removedCount: number, mappedNodeCountBefore: number): boolean {
  if (removedCount >= BULK_DELETE_HARD_ABSOLUTE)
    return true
  if (mappedNodeCountBefore === 0)
    return false
  const ratio = removedCount / mappedNodeCountBefore
  return removedCount >= BULK_DELETE_MIN_ABSOLUTE && ratio >= BULK_DELETE_MIN_RATIO
}

export class BookmarkSyncService {
  private readonly deps: SyncServiceDeps
  private mutexLocked = false
  private rerunRequested = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private listenersRegistered = false
  private applyGuardActive = false

  constructor(deps: SyncServiceDeps) {
    this.deps = deps
  }

  async start(): Promise<void> {
    const result = await this.deps.storage.loadState()
    if (!result.ok)
      return
    if (result.state.settings.mode === 'active') {
      this.registerListeners()
      this.scheduleSync(0)
    }
  }

  private registerListeners(): void {
    if (this.listenersRegistered)
      return
    this.listenersRegistered = true
    this.deps.events.onCreated((id, node) => { void this.handleCreated(id, node) })
    this.deps.events.onChanged((id, changes) => { void this.handleChanged(id, changes) })
    this.deps.events.onMoved((id, info) => { void this.handleMoved(id, info) })
    this.deps.events.onRemoved((id, info) => { void this.handleRemoved(id, info) })
    this.deps.events.onPermissionRemoved((permissions) => { void this.handlePermissionRemoved(permissions) })
    this.deps.alarms.create(BOOKMARK_SYNC_ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES })
    this.deps.alarms.onAlarm((alarm) => {
      if (alarm.name === BOOKMARK_SYNC_ALARM_NAME)
        this.scheduleSync(0)
    })
  }

  scheduleSync(delayMs: number = this.deps.coalesceMs ?? DEFAULT_COALESCE_MS): void {
    if (this.debounceTimer)
      clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.runSyncOnce()
    }, delayMs)
  }

  /** Runs one sync pass under the shared mutex; concurrent callers just mark "another run needed". */
  async runSyncOnce(): Promise<void> {
    if (this.mutexLocked) {
      this.rerunRequested = true
      return
    }
    this.mutexLocked = true
    try {
      await this.doSyncOnce()
    } finally {
      this.mutexLocked = false
      if (this.rerunRequested) {
        this.rerunRequested = false
        await this.runSyncOnce()
      }
    }
  }

  private async runGuarded<T>(fn: () => Promise<T>): Promise<T> {
    this.applyGuardActive = true
    try {
      return await fn()
    } finally {
      this.applyGuardActive = false
      // Final reconcile: nothing legitimate runs while the guard is up, so
      // anything an event handler buffered during this window was
      // necessarily self-generated — drop it rather than pushing it as a
      // real local edit.
      const result = await this.deps.storage.loadState()
      if (result.ok && (result.state.pendingUpserts.length > 0 || result.state.pendingDeleteIds.length > 0)) {
        await this.deps.storage.saveState({ ...result.state, pendingUpserts: [], pendingDeleteIds: [] })
      }
    }
  }

  private async doSyncOnce(): Promise<void> {
    const result = await this.deps.storage.loadState()
    if (!result.ok)
      return
    let state = result.state
    if (state.settings.mode !== 'active')
      return
    let settings = state.settings
    const { collectionId } = settings

    const journal = {
      appendPending: async (op: BookmarkSyncState['pendingOps'][number]) => {
        state = { ...state, pendingOps: [...state.pendingOps, op] }
        await this.deps.storage.saveState(state)
      },
      resolvePending: async (opId: string) => {
        state = { ...state, pendingOps: state.pendingOps.filter(p => p.opId !== opId) }
        await this.deps.storage.saveState(state)
      },
    }

    // 1. Recover any journal left over from a crash.
    if (state.pendingOps.length > 0) {
      const pendingBefore = state.pendingOps
      const recovered = await recoverJournal(this.deps.api, journal, pendingBefore, state.bindings)
      state = { ...state, bindings: recovered.bindings }
      await this.deps.storage.saveState(state)
    }

    // 2. Push buffered local mutations. A push failure (offline vault) must
    // leave `dirty`/the buffers untouched and be reported, never thrown —
    // callers like switchCollection rely on runSyncOnce() never rejecting.
    try {
      if (state.pendingUpserts.length > 0) {
        await this.deps.vault.upsertNodes(collectionId, state.pendingUpserts)
        state = { ...state, pendingUpserts: [] }
        await this.deps.storage.saveState(state)
      }
      if (state.pendingDeleteIds.length > 0) {
        await this.deps.vault.deleteNodes(collectionId, state.pendingDeleteIds)
        state = { ...state, pendingDeleteIds: [] }
        await this.deps.storage.saveState(state)
      }
    } catch (err) {
      settings = { ...settings, lastError: String(err) }
      state = { ...state, settings }
      await this.deps.storage.saveState(state)
      return
    }

    // 3. Pull the new convergent state.
    let nodes: BookmarkNodeRow[]
    try {
      nodes = await this.deps.vault.listNodes(collectionId)
    } catch (err) {
      settings = { ...settings, lastError: String(err) }
      state = { ...state, settings }
      await this.deps.storage.saveState(state)
      return
    }

    if (nodes.length === 0 && state.snapshot.length > 0) {
      settings = { ...settings, lastError: OWN_COLLECTION_MISSING }
      state = { ...state, ownCollectionMissing: true, settings }
      await this.deps.storage.saveState(state)
      return
    }

    // 4. Diff against the last applied snapshot.
    const diff = diffForests(state.snapshot, nodes)
    if (isDiffEmpty(diff)) {
      settings = { ...settings, dirty: false, lastSyncAt: this.deps.now(), lastError: null }
      state = { ...state, settings }
      await this.deps.storage.saveState(state)
      await this.deps.vault.upsertDevice({
        collectionId,
        replicaId: settings.replicaId,
        deviceLabel: settings.deviceLabel,
        browserFamily: settings.browserFamily,
      })
      return
    }

    // 5. Bulk-delete protection — halt *before* touching the native tree.
    const mappedNodeCountBefore = state.bindings.filter(b => b.bindingType === 'node').length
    if (isBulkDelete(diff.removes.length, mappedNodeCountBefore)) {
      state = {
        ...state,
        pendingDeletionReview: {
          deletedHaexIds: diff.removes.map(r => r.id),
          mappedNodeCountBefore,
          createdAt: this.deps.now(),
        },
      }
      await this.deps.storage.saveState(state)
      return
    }

    // 6. Apply the diff to the native tree, guarded against feedback loops.
    const applied = await this.runGuarded(() => applyDiff(this.deps.api, journal, state.bindings, diff))
    settings = { ...settings, dirty: false, lastSyncAt: this.deps.now(), lastError: null }
    state = { ...state, bindings: applied.bindings, snapshot: nodes, settings }
    await this.deps.storage.saveState(state)
    await this.deps.vault.upsertDevice({
      collectionId,
      replicaId: settings.replicaId,
      deviceLabel: settings.deviceLabel,
      browserFamily: settings.browserFamily,
    })
  }

  // -------------------------------------------------------------------------
  // Onboarding hand-off — 'create' and 'activate' decisions from the
  // onboarding page. 'disabled' is handled directly in background/main.ts.
  // -------------------------------------------------------------------------

  async completeOnboardingCreate(params: {
    name: string
    replicaId: string
    browserFamily: BrowserFamily
    deviceLabel: string
  }): Promise<{ success: boolean, error?: string }> {
    try {
      const collectionId = await this.deps.vault.createCollection(params.name)
      const seed = await seedCollectionFromNative(this.deps.api, collectionId, params.browserFamily)
      await this.deps.vault.upsertNodes(collectionId, seed.snapshot)

      const state: BookmarkSyncState = {
        schemaVersion: 1,
        settings: {
          schemaVersion: 1,
          mode: 'active',
          collectionId,
          collectionName: params.name,
          replicaId: params.replicaId,
          browserFamily: params.browserFamily,
          deviceLabel: params.deviceLabel,
          dirty: false,
          lastSyncAt: this.deps.now(),
          lastError: null,
        },
        snapshot: seed.snapshot,
        bindings: seed.bindings,
        pendingOps: [],
        pendingDeletionReview: null,
        ownCollectionMissing: false,
        pendingUpserts: [],
        pendingDeleteIds: [],
      }
      await this.deps.storage.saveState(state)
      await this.deps.vault.upsertDevice({
        collectionId,
        replicaId: params.replicaId,
        deviceLabel: params.deviceLabel,
        browserFamily: params.browserFamily,
      })
      this.registerListeners()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  async completeOnboardingActivate(params: {
    collectionId: string
    collectionName: string
    replicaId: string
    browserFamily: BrowserFamily
    deviceLabel: string
  }): Promise<{ success: boolean, error?: string }> {
    try {
      const targetRows = await this.deps.vault.listNodes(params.collectionId)
      const { bindings } = await this.runGuarded(() =>
        activateCollection(this.deps.api, this.journalForFreshState(), params.browserFamily, targetRows),
      )

      const state: BookmarkSyncState = {
        schemaVersion: 1,
        settings: {
          schemaVersion: 1,
          mode: 'active',
          collectionId: params.collectionId,
          collectionName: params.collectionName,
          replicaId: params.replicaId,
          browserFamily: params.browserFamily,
          deviceLabel: params.deviceLabel,
          dirty: false,
          lastSyncAt: this.deps.now(),
          lastError: null,
        },
        snapshot: targetRows,
        bindings,
        pendingOps: [],
        pendingDeletionReview: null,
        ownCollectionMissing: false,
        pendingUpserts: [],
        pendingDeleteIds: [],
      }
      await this.deps.storage.saveState(state)
      await this.deps.vault.upsertDevice({
        collectionId: params.collectionId,
        replicaId: params.replicaId,
        deviceLabel: params.deviceLabel,
        browserFamily: params.browserFamily,
      })
      this.registerListeners()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /** A throwaway journal for one-shot flows (onboarding) that don't yet have a persisted state to journal against. */
  private journalForFreshState() {
    return {
      appendPending: async () => {},
      resolvePending: async () => {},
    }
  }

  // -------------------------------------------------------------------------
  // switchCollection — the "activate" flow reused for later switches. Guarded
  // so a switch can never run while unsynced local changes exist and the
  // vault is unreachable, and structured so emptying the old collection can
  // never itself produce a vault delete/tombstone (see plan 002's critical
  // invariant).
  // -------------------------------------------------------------------------

  async switchCollection(target: SwitchTarget): Promise<SwitchResult> {
    const initial = await this.deps.storage.loadState()
    if (!initial.ok || initial.state.settings.mode !== 'active')
      return { ok: false, error: 'NOT_ACTIVE' }

    let active = initial.state.settings

    if (active.dirty) {
      // One last attempt to flush before refusing — if the vault is
      // reachable this clears `dirty` and the switch can proceed.
      await this.runSyncOnce()
      const reloaded = await this.deps.storage.loadState()
      if (!reloaded.ok || reloaded.state.settings.mode !== 'active' || reloaded.state.settings.dirty) {
        return { ok: false, error: 'DIRTY_AND_UNSYNCED' }
      }
      active = reloaded.state.settings
    }

    try {
      const targetRows = await this.deps.vault.listNodes(target.collectionId)

      // Emptying the old collection's native tree never touches the vault —
      // the guard suppresses event-driven buffering, and there is nothing
      // pending to flush (dirty was confirmed false above), so no
      // upsert/delete is ever sent for the collection we're leaving.
      const { bindings } = await this.runGuarded(() =>
        activateCollection(this.deps.api, this.journalForFreshState(), active.browserFamily, targetRows),
      )

      const nextState: BookmarkSyncState = {
        schemaVersion: 1,
        settings: {
          ...active,
          collectionId: target.collectionId,
          collectionName: target.collectionName,
          dirty: false,
          lastSyncAt: this.deps.now(),
          lastError: null,
        },
        snapshot: targetRows,
        bindings,
        pendingOps: [],
        pendingDeletionReview: null,
        ownCollectionMissing: false,
        pendingUpserts: [],
        pendingDeleteIds: [],
      }
      await this.deps.storage.saveState(nextState)
      await this.deps.vault.upsertDevice({
        collectionId: target.collectionId,
        replicaId: active.replicaId,
        deviceLabel: active.deviceLabel,
        browserFamily: active.browserFamily,
      })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  async confirmPendingDeletions(): Promise<void> {
    const result = await this.deps.storage.loadState()
    if (!result.ok || !result.state.pendingDeletionReview)
      return
    const state = { ...result.state, pendingDeletionReview: null }
    await this.deps.storage.saveState(state)
    this.scheduleSync(0)
  }

  async rejectPendingDeletions(): Promise<void> {
    // Leave the quarantine in place — do nothing but let the caller know
    // there's still a review pending; nothing to persist here since we
    // simply don't clear `pendingDeletionReview`.
  }

  // -------------------------------------------------------------------------
  // Native event handlers.
  // -------------------------------------------------------------------------

  private async handleCreated(nativeId: string, node: NativeBookmarkNode): Promise<void> {
    if (this.applyGuardActive)
      return
    const result = await this.deps.storage.loadState()
    if (!result.ok || result.state.settings.mode !== 'active')
      return
    let state = result.state
    const settings = result.state.settings
    const { collectionId, browserFamily } = settings
    const { browserToHaex } = buildBindingMaps(state.bindings)

    const parentNativeId = node.parentId
    if (!parentNativeId)
      return
    let haexParentId = browserToHaex.get(parentNativeId)
    if (!haexParentId) {
      const rootKind = rootKindForNativeId(browserFamily, parentNativeId)
      if (!rootKind)
        return // outside our native roots entirely — not ours to track
      const rootHaexId = crypto.randomUUID()
      state = { ...state, bindings: addBinding(state.bindings, { haexId: rootHaexId, browserId: parentNativeId, bindingType: 'root' }) }
      haexParentId = rootHaexId
    }

    const kind = nativeKind(node)
    const haexId = crypto.randomUUID()
    const row: BookmarkNodeRow = {
      id: haexId,
      collectionId,
      parentId: haexParentId,
      rootKind: null,
      kind,
      title: kind === 'separator' ? null : node.title,
      url: kind === 'bookmark' ? (node.url ?? null) : null,
      position: node.index ?? 0,
    }

    state = {
      ...state,
      bindings: addBinding(state.bindings, { haexId, browserId: nativeId, bindingType: 'node' }),
      snapshot: [...state.snapshot, row],
      settings: { ...settings, dirty: true },
    }
    state = bufferUpsert(state, row)
    await this.deps.storage.saveState(state)
    this.scheduleSync()
  }

  private async handleChanged(nativeId: string, changes: { title?: string, url?: string }): Promise<void> {
    if (this.applyGuardActive)
      return
    const result = await this.deps.storage.loadState()
    if (!result.ok || result.state.settings.mode !== 'active')
      return
    let state = result.state
    const settings = result.state.settings
    const { browserToHaex } = buildBindingMaps(state.bindings)
    const haexId = browserToHaex.get(nativeId)
    if (!haexId)
      return

    const existing = state.snapshot.find(r => r.id === haexId)
    if (!existing)
      return
    const updated: BookmarkNodeRow = {
      ...existing,
      title: changes.title !== undefined ? changes.title : existing.title,
      url: changes.url !== undefined ? changes.url : existing.url,
    }
    state = {
      ...state,
      snapshot: state.snapshot.map(r => (r.id === haexId ? updated : r)),
      settings: { ...settings, dirty: true },
    }
    state = bufferUpsert(state, updated)
    await this.deps.storage.saveState(state)
    this.scheduleSync()
  }

  private async handleMoved(nativeId: string, info: { parentId: string, index: number }): Promise<void> {
    if (this.applyGuardActive)
      return
    const result = await this.deps.storage.loadState()
    if (!result.ok || result.state.settings.mode !== 'active')
      return
    let state = result.state
    const settings = result.state.settings
    const { browserToHaex } = buildBindingMaps(state.bindings)
    const haexId = browserToHaex.get(nativeId)
    if (!haexId)
      return
    const haexParentId = browserToHaex.get(info.parentId)
    if (!haexParentId)
      return // moved outside anything we track — nothing sensible to record

    const existing = state.snapshot.find(r => r.id === haexId)
    if (!existing)
      return
    const updated: BookmarkNodeRow = { ...existing, parentId: haexParentId, position: info.index }
    state = {
      ...state,
      snapshot: state.snapshot.map(r => (r.id === haexId ? updated : r)),
      settings: { ...settings, dirty: true },
    }
    state = bufferUpsert(state, updated)
    await this.deps.storage.saveState(state)
    this.scheduleSync()
  }

  private async handleRemoved(nativeId: string, info: { parentId: string, node: NativeBookmarkNode }): Promise<void> {
    if (this.applyGuardActive)
      return
    const result = await this.deps.storage.loadState()
    if (!result.ok || result.state.settings.mode !== 'active')
      return
    let state = result.state
    const settings = result.state.settings
    const { browserToHaex } = buildBindingMaps(state.bindings)

    const haexId = browserToHaex.get(nativeId)
    if (!haexId) {
      return // never mapped — ignore
    }
    // A root binding being "removed" can't really happen (native roots are
    // never destroyed by us or the plan's invariants) — but fail safe by
    // never turning it into a delete.
    const isRootBinding = state.bindings.some(b => b.haexId === haexId && b.bindingType === 'root')
    if (isRootBinding)
      return

    const removedHaexIds: string[] = [haexId]
    const collectDescendants = (n: NativeBookmarkNode) => {
      for (const child of n.children ?? []) {
        const childHaexId = browserToHaex.get(child.id)
        if (childHaexId)
          removedHaexIds.push(childHaexId)
        collectDescendants(child)
      }
    }
    collectDescendants(info.node)

    for (const id of removedHaexIds) {
      state = { ...state, bindings: removeBindingByHaexId(state.bindings, id), snapshot: state.snapshot.filter(r => r.id !== id) }
      state = bufferDelete(state, id)
    }
    state = { ...state, settings: { ...settings, dirty: true } }
    await this.deps.storage.saveState(state)
    this.scheduleSync()
  }

  private async handlePermissionRemoved(permissions: { permissions?: string[] }): Promise<void> {
    if (!permissions.permissions?.includes('bookmarks'))
      return
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    await this.deps.alarms.clear(BOOKMARK_SYNC_ALARM_NAME)
    const result = await this.deps.storage.loadState()
    if (result.ok && result.state.settings.mode === 'active') {
      await this.deps.storage.saveState({
        ...result.state,
        settings: { schemaVersion: 1, mode: 'disabled', dismissedAt: this.deps.now() },
      })
    }
  }

  /** Exposed for tests/diagnostics — not part of the public sync contract. */
  isApplyGuardActive(): boolean {
    return this.applyGuardActive
  }
}

// Re-exported so callers (main.ts) don't need to know the internal shape.
export { findNodeById as findNativeNodeById }
