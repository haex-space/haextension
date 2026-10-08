// Turns native bookmark events (a user edit in the browser) into the next
// local sync state: snapshot/binding updates plus a buffered vault upsert or
// delete. Each returns `null` when the event concerns nothing we track.

import type { BookmarkNodeRow } from './model'
import type { NativeBookmarkNode } from './nativeAdapter'
import type { BookmarkSyncSettingsActive, BookmarkSyncState } from './storage'
import { rootKindForNativeId } from './model'
import { nativeKind } from './nativeAdapter'
import { addBinding, bufferDelete, bufferUpsert, buildBindingMaps, removeBindingByHaexId } from './storage'

export function recordCreated(
  current: BookmarkSyncState,
  settings: BookmarkSyncSettingsActive,
  nativeId: string,
  node: NativeBookmarkNode,
): BookmarkSyncState | null {
  let state = current
  const { collectionId, browserFamily } = settings
  const { browserToHaex } = buildBindingMaps(state.bindings)

  const parentNativeId = node.parentId
  if (!parentNativeId)
    return null
  let haexParentId = browserToHaex.get(parentNativeId)
  if (!haexParentId) {
    const rootKind = rootKindForNativeId(browserFamily, parentNativeId)
    if (!rootKind)
      return null // outside our native roots entirely — not ours to track
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
  let state = current
  const { browserToHaex } = buildBindingMaps(state.bindings)
  const haexId = browserToHaex.get(nativeId)
  if (!haexId)
    return null
  const haexParentId = browserToHaex.get(info.parentId)
  if (!haexParentId)
    return null // moved outside anything we track — nothing sensible to record

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
