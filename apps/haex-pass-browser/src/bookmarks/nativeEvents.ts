// Turns native bookmark events (a user edit in the browser) into the next
// local sync state: snapshot/binding updates plus a buffered vault upsert or
// delete. Each returns `null` when the event concerns nothing we track.

import type { BookmarkNodeRow } from './model'
import type { NativeBookmarkNode } from './nativeAdapter'
import type { BookmarkSyncSettingsActive, BookmarkSyncState } from './storage'
import { rootKindForNativeId } from './model'
import { nativeKind } from './nativeAdapter'
import { addBinding, bufferDelete, bufferUpsert, buildBindingMaps, removeBindingByHaexId } from './storage'

/**
 * The haex id of a native parent, binding an untracked native root on the
 * way: the collection may have no row for it yet, and pushing a child
 * without one leaves the vault with a parent no other device can resolve.
 */
function resolveParent(
  state: BookmarkSyncState,
  settings: BookmarkSyncSettingsActive,
  parentNativeId: string,
): { state: BookmarkSyncState, haexParentId: string } | null {
  const bound = buildBindingMaps(state.bindings).browserToHaex.get(parentNativeId)
  if (bound)
    return { state, haexParentId: bound }
  const rootKind = rootKindForNativeId(settings.browserFamily, parentNativeId)
  if (!rootKind)
    return null // outside our native roots entirely — not ours to track
  const rootRow: BookmarkNodeRow = {
    id: crypto.randomUUID(),
    collectionId: settings.collectionId,
    parentId: null,
    rootKind,
    kind: 'folder',
    title: null,
    url: null,
    position: 0,
  }
  const withRoot = {
    ...state,
    bindings: addBinding(state.bindings, { haexId: rootRow.id, browserId: parentNativeId, bindingType: 'root' }),
    snapshot: [...state.snapshot, rootRow],
  }
  return { state: bufferUpsert(withRoot, rootRow), haexParentId: rootRow.id }
}

export function recordCreated(
  current: BookmarkSyncState,
  settings: BookmarkSyncSettingsActive,
  nativeId: string,
  node: NativeBookmarkNode,
): BookmarkSyncState | null {
  const { collectionId } = settings
  if (!node.parentId)
    return null
  const parent = resolveParent(current, settings, node.parentId)
  if (!parent)
    return null
  let state = parent.state
  const { haexParentId } = parent

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
  return bufferUpsert(state, row)
}

export function recordChanged(
  current: BookmarkSyncState,
  settings: BookmarkSyncSettingsActive,
  nativeId: string,
  changes: { title?: string, url?: string },
): BookmarkSyncState | null {
  let state = current
  const { browserToHaex } = buildBindingMaps(state.bindings)
  const haexId = browserToHaex.get(nativeId)
  if (!haexId)
    return null

  const existing = state.snapshot.find(r => r.id === haexId)
  if (!existing)
    return null
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
  return bufferUpsert(state, updated)
}

export function recordMoved(
  current: BookmarkSyncState,
  settings: BookmarkSyncSettingsActive,
  nativeId: string,
  info: { parentId: string, index: number },
): BookmarkSyncState | null {
  const haexId = buildBindingMaps(current.bindings).browserToHaex.get(nativeId)
  if (!haexId)
    return null
  const parent = resolveParent(current, settings, info.parentId)
  if (!parent)
    return null // moved outside anything we track — nothing sensible to record
  let state = parent.state
  const { haexParentId } = parent

  const existing = state.snapshot.find(r => r.id === haexId)
  if (!existing)
    return null
  const updated: BookmarkNodeRow = { ...existing, parentId: haexParentId, position: info.index }
  state = {
    ...state,
    snapshot: state.snapshot.map(r => (r.id === haexId ? updated : r)),
    settings: { ...settings, dirty: true },
  }
  return bufferUpsert(state, updated)
}

export function recordRemoved(
  current: BookmarkSyncState,
  settings: BookmarkSyncSettingsActive,
  nativeId: string,
  info: { parentId: string, node: NativeBookmarkNode },
): BookmarkSyncState | null {
  let state = current
  const { browserToHaex } = buildBindingMaps(state.bindings)

  const haexId = browserToHaex.get(nativeId)
  if (!haexId) {
    return null // never mapped — ignore
  }
  // A root binding being "removed" can't really happen (native roots are
  // never destroyed by us or the plan's invariants) — but fail safe by
  // never turning it into a delete.
  const isRootBinding = state.bindings.some(b => b.haexId === haexId && b.bindingType === 'root')
  if (isRootBinding)
    return null

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
  return { ...state, settings: { ...settings, dirty: true } }
}
