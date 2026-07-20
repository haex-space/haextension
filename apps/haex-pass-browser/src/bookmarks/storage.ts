// Versioned local state for the active bookmark collection. One storage key,
// written as a whole object on every save — never a partial patch — so a
// read always sees an internally consistent snapshot/bindings/journal triple.
//
// If `browser.storage.local` returns something unreadable (corrupt JSON
// shape, unknown schemaVersion), `loadState` reports it as an error instead
// of silently falling back to an empty state — silently discarding a dirty
// snapshot would be a data-loss bug (see plan 002 STOP conditions).

import type { BookmarkNodeRow, BrowserFamily } from './model'

const STORAGE_KEY = 'haex-pass-bookmark-sync-state'
const SCHEMA_VERSION = 1

export interface BookmarkSyncSettingsDisabled {
  schemaVersion: 1
  mode: 'disabled'
  dismissedAt: string | null
}

export interface BookmarkSyncSettingsActive {
  schemaVersion: 1
  mode: 'active'
  collectionId: string
  collectionName: string
  replicaId: string
  browserFamily: BrowserFamily
  deviceLabel: string
  dirty: boolean
  lastSyncAt: string | null
  lastError: string | null
}

export type BookmarkSyncSettings = BookmarkSyncSettingsDisabled | BookmarkSyncSettingsActive

export interface BookmarkIdBinding {
  haexId: string
  browserId: string
  bindingType: 'node' | 'root'
}

export interface PendingBrowserOperation {
  opId: string
  type: 'create' | 'update' | 'move' | 'remove'
  haexId: string
  browserId: string | null
  parentBrowserId: string | null
  beforeChildIds: string[]
  expected: { title: string, url: string | null, index: number }
}

export interface PendingDeletionReview {
  deletedHaexIds: string[]
  mappedNodeCountBefore: number
  createdAt: string
}

export interface BookmarkSyncState {
  schemaVersion: 1
  settings: BookmarkSyncSettings
  /** Last snapshot of the active collection successfully applied to the native tree. */
  snapshot: BookmarkNodeRow[]
  bindings: BookmarkIdBinding[]
  pendingOps: PendingBrowserOperation[]
  pendingDeletionReview: PendingDeletionReview | null
  ownCollectionMissing: boolean
}

export function defaultDisabledState(): BookmarkSyncState {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { schemaVersion: SCHEMA_VERSION, mode: 'disabled', dismissedAt: null },
    snapshot: [],
    bindings: [],
    pendingOps: [],
    pendingDeletionReview: null,
    ownCollectionMissing: false,
  }
}

export type LoadResult
  = | { ok: true, state: BookmarkSyncState }
    | { ok: false, error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidSettings(value: unknown): value is BookmarkSyncSettings {
  if (!isPlainObject(value) || value.schemaVersion !== SCHEMA_VERSION)
    return false
  if (value.mode === 'disabled')
    return true
  if (value.mode === 'active') {
    return typeof value.collectionId === 'string'
      && typeof value.collectionName === 'string'
      && typeof value.replicaId === 'string'
      && typeof value.browserFamily === 'string'
      && typeof value.deviceLabel === 'string'
      && typeof value.dirty === 'boolean'
  }
  return false
}

function isValidState(value: unknown): value is BookmarkSyncState {
  if (!isPlainObject(value) || value.schemaVersion !== SCHEMA_VERSION)
    return false
  if (!isValidSettings(value.settings))
    return false
  if (!Array.isArray(value.snapshot) || !Array.isArray(value.bindings) || !Array.isArray(value.pendingOps))
    return false
  return true
}

/**
 * Loads the persisted state. Absence of the key is a legitimate "fresh
 * install" case (`ok: true` with the disabled default). A present-but-broken
 * value, or a storage read failure, is reported as `ok: false` — callers
 * must surface this rather than proceeding as if sync were freshly disabled.
 */
export async function loadState(): Promise<LoadResult> {
  let raw: unknown
  try {
    const result = await browser.storage.local.get(STORAGE_KEY)
    raw = result[STORAGE_KEY]
  } catch (err) {
    return { ok: false, error: `storage.local.get failed: ${String(err)}` }
  }

  if (raw === undefined)
    return { ok: true, state: defaultDisabledState() }

  if (!isValidState(raw))
    return { ok: false, error: 'stored bookmark sync state has an unrecognized shape' }

  return { ok: true, state: raw }
}

export async function saveState(state: BookmarkSyncState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state })
}

// ---------------------------------------------------------------------------
// Binding list helpers — bijectivity (haexId <-> browserId) is enforced here;
// lookup maps themselves are in-memory only, derived fresh from `bindings`.
// ---------------------------------------------------------------------------

export class BindingConflictError extends Error {}

export function buildBindingMaps(bindings: BookmarkIdBinding[]): {
  haexToBrowser: Map<string, string>
  browserToHaex: Map<string, string>
} {
  const haexToBrowser = new Map<string, string>()
  const browserToHaex = new Map<string, string>()
  for (const binding of bindings) {
    haexToBrowser.set(binding.haexId, binding.browserId)
    browserToHaex.set(binding.browserId, binding.haexId)
  }
  return { haexToBrowser, browserToHaex }
}

/**
 * Adds or replaces a binding, enforcing that neither id is already paired
 * with a different partner. Re-adding the exact same pair is a no-op.
 * Throws `BindingConflictError` if either id is already bound elsewhere —
 * callers should quarantine rather than silently overwrite in that case.
 *
 * Exception: `bindingType: 'root'` bindings are exempt from the browserId
 * side of this check. Root-kind fallback (e.g. `menu` -> `other` on
 * Chromium) can legitimately make two canonical roots share one native
 * folder id — that's a documented, intentional merge, not a corruption.
 */
export function addBinding(bindings: BookmarkIdBinding[], next: BookmarkIdBinding): BookmarkIdBinding[] {
  const byHaexId = bindings.find(b => b.haexId === next.haexId)
  const byBrowserId = bindings.find(b => b.browserId === next.browserId)

  if (byHaexId && byHaexId.browserId === next.browserId && byBrowserId === byHaexId) {
    return bindings
  }
  if (byHaexId && byHaexId.browserId !== next.browserId) {
    throw new BindingConflictError(`haexId ${next.haexId} is already bound to a different browserId`)
  }
  if (next.bindingType !== 'root' && byBrowserId && byBrowserId.haexId !== next.haexId) {
    throw new BindingConflictError(`browserId ${next.browserId} is already bound to a different haexId`)
  }
  return [...bindings, next]
}

export function removeBindingByHaexId(bindings: BookmarkIdBinding[], haexId: string): BookmarkIdBinding[] {
  return bindings.filter(b => b.haexId !== haexId)
}

export function removeBindingByBrowserId(bindings: BookmarkIdBinding[], browserId: string): BookmarkIdBinding[] {
  return bindings.filter(b => b.browserId !== browserId)
}
