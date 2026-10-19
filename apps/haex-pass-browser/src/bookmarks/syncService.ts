// Event/sync state machine: coordinates native bookmark events, the local
// journal/snapshot/binding state, and the active collection against the
// vault. Deliberately "dumb" — it mirrors, it never merges; convergence is
// the vault CRDT's job.
//
// All WebExtension access is injected (`SyncServiceDeps`) so this whole
// module is testable with a fake vault (in-memory collections with
// column-wise LWW + tombstones) and a fake bookmark tree — no `browser`
// global required.

import type { BookmarkStatus } from './messages'
import type { BrowserFamily } from './model'
import type { NativeBookmarkNode } from './nativeAdapter'
import type { BookmarkSyncSettingsActive, BookmarkSyncState } from './storage'
import type { SyncServiceDeps } from './syncDeps'
import { activateCollection, seedCollectionFromNative } from './nativeAdapter'
import { recordChanged, recordCreated, recordMoved, recordRemoved } from './nativeEvents'
import { doSyncOnce } from './syncPass'

export const BOOKMARK_SYNC_ALARM_NAME = 'haex-pass-bookmark-sync'
const ALARM_PERIOD_MINUTES = 5
const DEFAULT_COALESCE_MS = 2000

export const COLLECTION_NOT_FOUND = 'COLLECTION_NOT_FOUND'

export interface SwitchTarget {
  collectionId: string
  collectionName: string
}

interface OnboardingCreateParams {
  name: string
  replicaId: string
  browserFamily: BrowserFamily
  deviceLabel: string
}

interface OnboardingActivateParams {
  collectionId: string
  collectionName: string
  replicaId: string
  browserFamily: BrowserFamily
  deviceLabel: string
}

export type SwitchResult
  = | { ok: true }
    | { ok: false, error: 'DIRTY_AND_UNSYNCED' | string }

// Background work started from browser events has no caller to report to.
function reportFailure(work: Promise<unknown>, what: string): void {
  work.catch(err => console.error(`[haex-pass] ${what}:`, err))
}

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

export class BookmarkSyncService {
  private readonly deps: SyncServiceDeps
  // Every read-modify-write of the stored state runs through this queue.
  // The state is one storage key, so two writers interleaving across an
  // await would silently drop the other's changes.
  private stateQueue: Promise<unknown> = Promise.resolve()
  private syncQueued = false
  private rerunRequested = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private listenersRegistered = false
  private applyGuardActive = false

  constructor(deps: SyncServiceDeps) {
    this.deps = deps
  }

  /**
   * `bookmarksPermitted: false` means the optional permission is gone; if it
   * was revoked while the worker slept, the removal event was never seen.
   */
  async start({ bookmarksPermitted = true }: { bookmarksPermitted?: boolean } = {}): Promise<void> {
    const result = await this.deps.storage.loadState()
    if (!result.ok || result.state.settings.mode !== 'active')
      return
    if (!bookmarksPermitted) {
      await this.disableSync()
      return
    }
    this.activateListening()
    this.scheduleSync(0)
  }

  /**
   * Registers the native bookmark, permission and alarm listeners; idempotent.
   * The background calls this synchronously at startup: MV3 only delivers the
   * event that woke the worker to listeners registered in that first turn.
   * Handlers do nothing while sync is disabled.
   */
  attachListeners(): void {
    if (this.listenersRegistered)
      return
    this.listenersRegistered = true
    this.deps.events.onCreated((id, node) => this.recordNativeEvent((state, settings) => recordCreated(state, settings, id, node)))
    this.deps.events.onChanged((id, changes) => this.recordNativeEvent((state, settings) => recordChanged(state, settings, id, changes)))
    this.deps.events.onMoved((id, info) => this.recordNativeEvent((state, settings) => recordMoved(state, settings, id, info)))
    this.deps.events.onRemoved((id, info) => this.recordNativeEvent((state, settings) => recordRemoved(state, settings, id, info)))
    this.deps.events.onPermissionRemoved(permissions => reportFailure(this.handlePermissionRemoved(permissions), 'Failed to turn bookmark sync off'))
    this.deps.alarms.onAlarm((alarm) => {
      if (alarm.name === BOOKMARK_SYNC_ALARM_NAME)
        this.scheduleSync(0)
    })
  }

  private activateListening(): void {
    this.attachListeners()
    this.deps.alarms.create(BOOKMARK_SYNC_ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES })
  }

  scheduleSync(delayMs: number = this.deps.coalesceMs ?? DEFAULT_COALESCE_MS): void {
    if (this.debounceTimer)
      clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      reportFailure(this.runSyncOnce(), 'Bookmark sync pass failed')
    }, delayMs)
  }

  private withStateLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.stateQueue.then(fn)
    this.stateQueue = run.catch(() => {})
    return run
  }

  /** One sync pass; the caller must hold the state lock. */
  private syncPass(): Promise<void> {
    return doSyncOnce(this.deps, fn => this.runGuarded(fn))
  }

  /** Queues one sync pass; while one is queued or running, further callers just mark "another run needed". */
  async runSyncOnce(): Promise<void> {
    if (this.syncQueued) {
      this.rerunRequested = true
      return
    }
    this.syncQueued = true
    try {
      await this.withStateLock(() => this.syncPass())
    } finally {
      this.syncQueued = false
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
      // Final reconcile: nothing legitimate runs while the guard is up, so
      // anything an event handler buffered during this window was
      // necessarily self-generated — drop it rather than pushing it as a
      // real local edit. Keep the guard active until this write lands, so a
      // real native edit can't load stale state and get clobbered by it.
      const result = await this.deps.storage.loadState()
      if (result.ok && (result.state.pendingUpserts.length > 0 || result.state.pendingDeleteIds.length > 0)) {
        await this.deps.storage.saveState({ ...result.state, pendingUpserts: [], pendingDeleteIds: [] })
      }
      this.applyGuardActive = false
    }
  }

  // -------------------------------------------------------------------------
  // Onboarding hand-off — 'create' and 'activate' decisions from the
  // onboarding page. 'disabled' is handled directly in background/main.ts.
  // -------------------------------------------------------------------------

  async completeOnboardingCreate(params: OnboardingCreateParams): Promise<{ success: boolean, error?: string }> {
    return this.withStateLock(() => this.onboardCreate(params))
  }

  private async onboardCreate(params: OnboardingCreateParams): Promise<{ success: boolean, error?: string }> {
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
      this.activateListening()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  async completeOnboardingActivate(params: OnboardingActivateParams): Promise<{ success: boolean, error?: string }> {
    return this.withStateLock(() => this.onboardActivate(params))
  }

  private async onboardActivate(params: OnboardingActivateParams): Promise<{ success: boolean, error?: string }> {
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
      this.activateListening()
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

  switchCollection(target: SwitchTarget): Promise<SwitchResult> {
    return this.withStateLock(() => this.switchLocked(target))
  }

  private async switchLocked(target: SwitchTarget): Promise<SwitchResult> {
    const initial = await this.deps.storage.loadState()
    if (!initial.ok || initial.state.settings.mode !== 'active')
      return { ok: false, error: 'NOT_ACTIVE' }

    let active = initial.state.settings

    if (active.dirty) {
      // One last attempt to flush before refusing — if the vault is
      // reachable this clears `dirty` and the switch can proceed.
      await this.syncPass()
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

  /** Reduced status for Options/Popup — never includes url/title-bearing snapshot/binding data. */
  async getStatus(): Promise<BookmarkStatus | null> {
    const result = await this.deps.storage.loadState()
    if (!result.ok)
      return null
    const { settings } = result.state
    if (settings.mode === 'disabled')
      return { mode: 'disabled' }
    return {
      mode: 'active',
      collectionId: settings.collectionId,
      collectionName: settings.collectionName,
      replicaId: settings.replicaId,
      browserFamily: settings.browserFamily,
      deviceLabel: settings.deviceLabel,
      dirty: settings.dirty,
      lastSyncAt: settings.lastSyncAt,
      lastError: settings.lastError,
      ownCollectionMissing: result.state.ownCollectionMissing,
      pendingDeletionReview: result.state.pendingDeletionReview
        ? {
            deletedCount: result.state.pendingDeletionReview.deletedHaexIds.length,
            mappedNodeCountBefore: result.state.pendingDeletionReview.mappedNodeCountBefore,
          }
        : null,
    }
  }

  /** Approves the quarantined diff so the next sync pass applies it instead of re-quarantining it. */
  confirmPendingDeletions(): Promise<void> {
    return this.withStateLock(() => this.confirmLocked())
  }

  private async confirmLocked(): Promise<void> {
    const result = await this.deps.storage.loadState()
    if (!result.ok || !result.state.pendingDeletionReview)
      return
    const state = {
      ...result.state,
      pendingDeletionReview: { ...result.state.pendingDeletionReview, approved: true },
    }
    await this.deps.storage.saveState(state)
    this.scheduleSync(0)
  }

  /** Pushes the quarantined nodes back to the vault to undo the remote bulk delete, leaving the local tree untouched. */
  rejectPendingDeletions(): Promise<void> {
    return this.withStateLock(() => this.rejectLocked())
  }

  private async rejectLocked(): Promise<void> {
    const result = await this.deps.storage.loadState()
    if (!result.ok || !result.state.pendingDeletionReview || result.state.settings.mode !== 'active')
      return
    const { collectionId } = result.state.settings
    const { deletedHaexIds } = result.state.pendingDeletionReview
    const restoredNodes = result.state.snapshot.filter(n => deletedHaexIds.includes(n.id))
    try {
      if (restoredNodes.length > 0)
        await this.deps.vault.upsertNodes(collectionId, restoredNodes)
      await this.deps.storage.saveState({ ...result.state, pendingDeletionReview: null })
      this.scheduleSync(0)
    } catch (err) {
      const settings = { ...result.state.settings, lastError: String(err) }
      await this.deps.storage.saveState({ ...result.state, settings })
    }
  }

  // -------------------------------------------------------------------------
  // Native event handlers.
  // -------------------------------------------------------------------------

  private recordNativeEvent(
    record: (state: BookmarkSyncState, settings: BookmarkSyncSettingsActive) => BookmarkSyncState | null,
  ): void {
    // Checked when the event fires, not when its turn in the queue comes:
    // events raised by our own native writes arrive while the guard is up.
    if (this.applyGuardActive)
      return
    reportFailure(this.withStateLock(async () => {
      const result = await this.deps.storage.loadState()
      if (!result.ok || result.state.settings.mode !== 'active')
        return
      const state = record(result.state, result.state.settings)
      if (!state)
        return
      await this.deps.storage.saveState(state)
      this.scheduleSync()
    }), 'Failed to record a bookmark change')
  }

  private async handlePermissionRemoved(permissions: { permissions?: string[] }): Promise<void> {
    if (!permissions.permissions?.includes('bookmarks'))
      return
    await this.disableSync()
  }

  /**
   * Turns sync off: clears the alarm and any pending debounce timer, and
   * flips settings to `disabled`. Used both for the onboarding "later"/
   * Options "disable sync" decision and for a revoked bookmarks permission.
   * Native event listeners stay registered but every handler no-ops as soon
   * as it re-reads `mode !== 'active'`, so this is safe even though they
   * aren't individually torn down.
   */
  disableSync(): Promise<void> {
    return this.withStateLock(() => this.disableLocked())
  }

  private async disableLocked(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    await this.deps.alarms.clear(BOOKMARK_SYNC_ALARM_NAME)
    const result = await this.deps.storage.loadState()
    if (!result.ok)
      return
    await this.deps.storage.saveState({
      ...result.state,
      settings: { schemaVersion: 1, mode: 'disabled', dismissedAt: this.deps.now() },
    })
  }

  /** Exposed for tests/diagnostics — not part of the public sync contract. */
  isApplyGuardActive(): boolean {
    return this.applyGuardActive
  }
}

// Re-exported so callers (main.ts) don't need to know the internal shape.
export { findNodeById as findNativeNodeById }
