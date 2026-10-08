// One sync pass of the active collection: recover the journal, push buffered
// local mutations, pull the convergent vault state and apply the diff to the
// native tree. Runs under `BookmarkSyncService`'s mutex.

import type { BookmarkNodeRow } from './model'
import type { BookmarkSyncState } from './storage'
import type { SyncServiceDeps } from './syncDeps'
import { diffForests, isDiffEmpty } from './model'
import { applyDiff, recoverJournal } from './nativeAdapter'

// Bulk-delete protection thresholds (see plan 002, "Laufender Sync").
const BULK_DELETE_MIN_ABSOLUTE = 20
const BULK_DELETE_MIN_RATIO = 0.25
const BULK_DELETE_HARD_ABSOLUTE = 500

export const OWN_COLLECTION_MISSING = 'OWN_COLLECTION_MISSING'

function isBulkDelete(removedCount: number, mappedNodeCountBefore: number): boolean {
  if (removedCount >= BULK_DELETE_HARD_ABSOLUTE)
    return true
  if (mappedNodeCountBefore === 0)
    return false
  const ratio = removedCount / mappedNodeCountBefore
  return removedCount >= BULK_DELETE_MIN_ABSOLUTE && ratio >= BULK_DELETE_MIN_RATIO
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length)
    return false
  const setA = new Set(a)
  return b.every(id => setA.has(id))
}

export async function doSyncOnce(
  deps: SyncServiceDeps,
  runGuarded: <T>(fn: () => Promise<T>) => Promise<T>,
): Promise<void> {
  const result = await deps.storage.loadState()
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
      await deps.storage.saveState(state)
    },
    resolvePending: async (opId: string) => {
      state = { ...state, pendingOps: state.pendingOps.filter(p => p.opId !== opId) }
      await deps.storage.saveState(state)
    },
  }

  // 1. Recover any journal left over from a crash.
  if (state.pendingOps.length > 0) {
    const pendingBefore = state.pendingOps
    const recovered = await recoverJournal(deps.api, journal, pendingBefore, state.bindings)
    state = { ...state, bindings: recovered.bindings }
    await deps.storage.saveState(state)
  }

  // 2. Push buffered local mutations. A push failure (offline vault) must
  // leave `dirty`/the buffers untouched and be reported, never thrown —
  // callers like switchCollection rely on runSyncOnce() never rejecting.
  try {
    if (state.pendingUpserts.length > 0) {
      await deps.vault.upsertNodes(collectionId, state.pendingUpserts)
      state = { ...state, pendingUpserts: [] }
      await deps.storage.saveState(state)
    }
    if (state.pendingDeleteIds.length > 0) {
      await deps.vault.deleteNodes(collectionId, state.pendingDeleteIds)
      state = { ...state, pendingDeleteIds: [] }
      await deps.storage.saveState(state)
    }
  } catch (err) {
    settings = { ...settings, lastError: String(err) }
    state = { ...state, settings }
    await deps.storage.saveState(state)
    return
  }

  // 3. Pull the new convergent state.
  let nodes: BookmarkNodeRow[]
  try {
    nodes = await deps.vault.listNodes(collectionId)
  } catch (err) {
    settings = { ...settings, lastError: String(err) }
    state = { ...state, settings }
    await deps.storage.saveState(state)
    return
  }

  if (nodes.length === 0 && state.snapshot.length > 0) {
    settings = { ...settings, lastError: OWN_COLLECTION_MISSING }
    state = { ...state, ownCollectionMissing: true, settings }
    await deps.storage.saveState(state)
    return
  }

  // 4. Diff against the last applied snapshot.
  const diff = diffForests(state.snapshot, nodes)
  if (isDiffEmpty(diff)) {
    settings = { ...settings, dirty: false, lastSyncAt: deps.now(), lastError: null }
    state = { ...state, settings }
    await deps.storage.saveState(state)
    await deps.vault.upsertDevice({
      collectionId,
      replicaId: settings.replicaId,
      deviceLabel: settings.deviceLabel,
      browserFamily: settings.browserFamily,
    })
    return
  }

  // 5. Bulk-delete protection — halt *before* touching the native tree,
  // unless this exact diff was already approved via confirmPendingDeletions.
  const mappedNodeCountBefore = state.bindings.filter(b => b.bindingType === 'node').length
  const removedIds = diff.removes.map(r => r.id)
  const approved = state.pendingDeletionReview?.approved && sameIdSet(state.pendingDeletionReview.deletedHaexIds, removedIds)
  if (isBulkDelete(diff.removes.length, mappedNodeCountBefore) && !approved) {
    state = {
      ...state,
      pendingDeletionReview: {
        deletedHaexIds: removedIds,
        mappedNodeCountBefore,
        createdAt: deps.now(),
        approved: false,
      },
    }
    await deps.storage.saveState(state)
    return
  }

  // 6. Apply the diff to the native tree, guarded against feedback loops.
  const applied = await runGuarded(() => applyDiff(deps.api, journal, state.bindings, diff))
  settings = { ...settings, dirty: false, lastSyncAt: deps.now(), lastError: null }
  state = { ...state, bindings: applied.bindings, snapshot: nodes, settings, pendingDeletionReview: null }
  await deps.storage.saveState(state)
  await deps.vault.upsertDevice({
    collectionId,
    replicaId: settings.replicaId,
    deviceLabel: settings.deviceLabel,
    browserFamily: settings.browserFamily,
  })
}
