// Native bookmark tree adapter: seeding a new collection from the current
// native tree, activating (wipe + materialize) a collection and applying a
// diff, all journaled (recovery is in journalRecovery.ts). The WebExtension bookmarks API is injected as
// `NativeBookmarksApi` so this whole module is testable with an in-memory
// fake tree — no `browser` global required.
//
// Design note on the journal: every mutating native call (create/removeTree)
// is wrapped by `journaledCreate`/`journaledRemove`, which persist a
// `PendingBrowserOperation` via the injected `JournalHandle` *before* calling
// the native API and resolve it *after* the call succeeds. `recoverJournal`
// replays any operation left pending after a crash — for `create` by
// comparing children against `beforeChildIds` (0 matches -> retry, >1 ->
// quarantine instead of risking a duplicate), for `remove` by checking
// whether the native id is already gone.

import type { BookmarkNodeKind, BookmarkNodeRow, BrowserFamily, ForestDiff } from './model'
import type { BookmarkIdBinding, PendingBrowserOperation } from './storage'
import { buildForest, nativeRootIdsForFamily, resolveNativeRootId } from './model'
import { addBinding, buildBindingMaps, removeBindingByHaexId } from './storage'

export interface NativeBookmarkNode {
  id: string
  parentId?: string
  index?: number
  title: string
  url?: string
  type?: 'bookmark' | 'folder' | 'separator'
  unmodifiable?: string
  children?: NativeBookmarkNode[]
}

export interface NativeCreateDetails {
  parentId: string
  title: string
  url?: string
  index: number
  kind: BookmarkNodeKind
}

export interface NativeBookmarksApi {
  /** Whether this browser can materialize a `kind: 'separator'` node. */
  supportsSeparators: boolean
  getTree: () => Promise<NativeBookmarkNode[]>
  getChildren: (id: string) => Promise<NativeBookmarkNode[]>
  create: (details: NativeCreateDetails) => Promise<NativeBookmarkNode>
  update: (id: string, changes: { title?: string, url?: string }) => Promise<void>
  move: (id: string, destination: { parentId: string, index: number }) => Promise<void>
  removeTree: (id: string) => Promise<void>
}

export interface Diagnostic {
  code: 'UNMODIFIABLE_SKIPPED' | 'SEPARATOR_UNSUPPORTED' | 'ROOT_FALLBACK' | 'CREATE_QUARANTINED' | 'APPLY_FAILED'
  haexId?: string
  nativeId?: string
  detail: string
}

export interface JournalHandle {
  appendPending: (op: PendingBrowserOperation) => Promise<void>
  /**
   * `bindings` is the complete binding list after the op. It must be saved in
   * the same write as the resolve, or a crash right after would leave a
   * native node without its binding and the next run would create it again.
   */
  resolvePending: (opId: string, bindings?: BookmarkIdBinding[]) => Promise<void>
}

export function findNodeById(roots: NativeBookmarkNode[], id: string): NativeBookmarkNode | null {
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

function isUnmodifiable(node: NativeBookmarkNode): boolean {
  return node.unmodifiable !== undefined
}

export function nativeKind(node: NativeBookmarkNode): BookmarkNodeKind {
  if (node.type === 'separator')
    return 'separator'
  if (node.url !== undefined)
    return 'bookmark'
  return 'folder'
}

/**
 * Vault positions can point past the parent's current children (skipped
 * separators, siblings deleted elsewhere, creates in diff order). Chromium
 * rejects such an index, so append instead.
 */
export function clampToChildren(index: number, childCount: number): number {
  return Math.min(Math.max(index, 0), childCount)
}

export async function clampIndex(api: NativeBookmarksApi, parentId: string, index: number): Promise<number> {
  return clampToChildren(index, (await api.getChildren(parentId)).length)
}

/**
 * Runs a native write under a journal entry. A write that throws still
 * resolves its entry: the sync diff retries the change on the next pass,
 * while a pending entry would make journal recovery repeat it first, forever.
 * The caller resolves the entry itself after a successful write.
 */
async function journaledWrite<T>(journal: JournalHandle, op: PendingBrowserOperation, write: () => Promise<T>): Promise<T> {
  await journal.appendPending(op)
  try {
    return await write()
  } catch (err) {
    await journal.resolvePending(op.opId)
    throw err
  }
}

async function journaledRemove(
  api: NativeBookmarksApi,
  journal: JournalHandle,
  browserId: string,
  bindingsAfter?: BookmarkIdBinding[],
): Promise<void> {
  const op: PendingBrowserOperation = {
    opId: crypto.randomUUID(),
    type: 'remove',
    haexId: '',
    browserId,
    parentBrowserId: null,
    beforeChildIds: [],
    expected: { title: '', url: null, index: 0 },
  }
  await journaledWrite(journal, op, () => api.removeTree(browserId))
  await journal.resolvePending(op.opId, bindingsAfter)
}

/** Creates the native node and binds it to `haexId`; returns the new native id and binding list. */
async function journaledCreate(
  api: NativeBookmarksApi,
  journal: JournalHandle,
  bindings: BookmarkIdBinding[],
  haexId: string,
  parentBrowserId: string,
  details: Omit<NativeCreateDetails, 'parentId'>,
): Promise<{ nativeId: string, bindings: BookmarkIdBinding[] }> {
  const siblings = await api.getChildren(parentBrowserId)
  const op: PendingBrowserOperation = {
    opId: crypto.randomUUID(),
    type: 'create',
    haexId,
    browserId: null,
    parentBrowserId,
    // Recovery tells the node this op created apart from existing siblings
    // that happen to share its title and url.
    beforeChildIds: siblings.map(child => child.id),
    expected: { title: details.title, url: details.url ?? null, index: details.index, kind: details.kind },
  }
  const created = await journaledWrite(journal, op, () =>
    api.create({ ...details, index: clampToChildren(details.index, siblings.length), parentId: parentBrowserId }))
  const nextBindings = addBinding(bindings, { haexId, browserId: created.id, bindingType: 'node' })
  await journal.resolvePending(op.opId, nextBindings)
  return { nativeId: created.id, bindings: nextBindings }
}

// ---------------------------------------------------------------------------
// seedCollectionFromNative — upload the current native tree as a new
// collection's starting content. Additive only: nothing is moved or removed.
// ---------------------------------------------------------------------------

export interface SeedResult {
  bindings: BookmarkIdBinding[]
  snapshot: BookmarkNodeRow[]
  diagnostics: Diagnostic[]
}

export async function seedCollectionFromNative(
  api: NativeBookmarksApi,
  collectionId: string,
  browserFamily: BrowserFamily,
): Promise<SeedResult> {
  const tree = await api.getTree()
  const diagnostics: Diagnostic[] = []
  let bindings: BookmarkIdBinding[] = []
  const snapshot: BookmarkNodeRow[] = []

  function visit(node: NativeBookmarkNode, haexParentId: string | null, position: number): void {
    if (isUnmodifiable(node)) {
      diagnostics.push({ code: 'UNMODIFIABLE_SKIPPED', nativeId: node.id, detail: 'native node is unmodifiable, excluded from seeding' })
      return
    }
    const kind = nativeKind(node)
    const haexId = crypto.randomUUID()
    bindings = addBinding(bindings, { haexId, browserId: node.id, bindingType: 'node' })
    snapshot.push({
      id: haexId,
      collectionId,
      parentId: haexParentId,
      rootKind: null,
      kind,
      title: kind === 'separator' ? null : node.title,
      url: kind === 'bookmark' ? (node.url ?? null) : null,
      position,
    })
    node.children?.forEach((child, index) => visit(child, haexId, index))
  }

  for (const [rootKind, nativeRootId] of Object.entries(nativeRootIdsForFamily(browserFamily))) {
    const rootNode = findNodeById(tree, nativeRootId)
    if (!rootNode)
      continue
    const rootHaexId = crypto.randomUUID()
    bindings = addBinding(bindings, { haexId: rootHaexId, browserId: nativeRootId, bindingType: 'root' })
    snapshot.push({
      id: rootHaexId,
      collectionId,
      parentId: null,
      rootKind: rootKind as BookmarkNodeRow['rootKind'],
      kind: 'folder',
      title: null,
      url: null,
      position: 0,
    })
    rootNode.children?.forEach((child, index) => visit(child, rootHaexId, index))
  }

  return { bindings, snapshot, diagnostics }
}

// ---------------------------------------------------------------------------
// activateCollection — clear modifiable descendants of every native root,
// then materialize the target collection into them. Native roots themselves
// are never touched.
// ---------------------------------------------------------------------------

export interface ActivateResult {
  bindings: BookmarkIdBinding[]
  diagnostics: Diagnostic[]
}

export async function activateCollection(
  api: NativeBookmarksApi,
  journal: JournalHandle,
  browserFamily: BrowserFamily,
  targetRows: BookmarkNodeRow[],
): Promise<ActivateResult> {
  const diagnostics: Diagnostic[] = []

  // Phase 1: clear modifiable descendants of every native root this family exposes.
  const tree = await api.getTree()
  for (const nativeRootId of Object.values(nativeRootIdsForFamily(browserFamily))) {
    const rootNode = findNodeById(tree, nativeRootId)
    if (!rootNode)
      continue
    for (const child of rootNode.children ?? []) {
      if (isUnmodifiable(child))
        continue
      await journaledRemove(api, journal, child.id)
    }
  }

  // Phase 2: materialize the target collection into the now-empty native roots.
  const { roots } = buildForest(targetRows)
  let bindings: BookmarkIdBinding[] = []

  async function materialize(nodeChildren: ReturnType<typeof buildForest>['roots'], nativeParentId: string): Promise<void> {
    for (const node of nodeChildren) {
      if (node.kind === 'separator' && !api.supportsSeparators) {
        diagnostics.push({ code: 'SEPARATOR_UNSUPPORTED', haexId: node.id, detail: 'target browser cannot create separators' })
        continue
      }
      const created = await journaledCreate(api, journal, bindings, node.id, nativeParentId, {
        title: node.title ?? '',
        url: node.kind === 'bookmark' ? (node.url ?? undefined) : undefined,
        index: node.position,
        kind: node.kind,
      })
      bindings = created.bindings
      await materialize(node.children, created.nativeId)
    }
  }

  for (const root of roots) {
    if (!root.rootKind)
      continue
    const resolved = resolveNativeRootId(browserFamily, root.rootKind)
    if (!resolved)
      continue
    if (resolved.usedFallback) {
      diagnostics.push({ code: 'ROOT_FALLBACK', haexId: root.id, detail: `rootKind "${root.rootKind}" mapped to native "other" root` })
    }
    bindings = addBinding(bindings, { haexId: root.id, browserId: resolved.nativeId, bindingType: 'root' })
    await materialize(root.children, resolved.nativeId)
  }

  return { bindings, diagnostics }
}

// ---------------------------------------------------------------------------
// applyDiff — apply a computed ForestDiff (see model.ts) to the native tree.
// Creates are already parent-first and removes child-first (diffForests
// guarantees this ordering); native roots are never targeted since diffs
// only ever contain node ids the caller has bound to non-root bindings.
// ---------------------------------------------------------------------------

export interface ApplyDiffResult {
  bindings: BookmarkIdBinding[]
  diagnostics: Diagnostic[]
  /** Rows whose native change failed; the caller keeps them out of the applied snapshot so they are retried. */
  failedIds: string[]
}

export async function applyDiff(
  api: NativeBookmarksApi,
  journal: JournalHandle,
  bindings: BookmarkIdBinding[],
  diff: ForestDiff,
  browserFamily: BrowserFamily,
): Promise<ApplyDiffResult> {
  const diagnostics: Diagnostic[] = []
  const failedIds: string[] = []
  let nextBindings = bindings
  const { haexToBrowser } = buildBindingMaps(nextBindings)

  // One change the browser refuses (an unsupported URL, a node removed
  // meanwhile) must not hold back every other change in the diff.
  async function attempt(haexId: string, change: () => Promise<void>): Promise<void> {
    try {
      await change()
    } catch (err) {
      diagnostics.push({ code: 'APPLY_FAILED', haexId, detail: String(err) })
      failedIds.push(haexId)
    }
  }

  for (const { node } of diff.creates) {
    // Already created by an interrupted earlier run (its binding was saved
    // with the journal) or bound by journal recovery.
    if (haexToBrowser.has(node.id))
      continue
    if (node.rootKind) {
      // A canonical root is never created, only bound to the native root.
      const resolved = resolveNativeRootId(browserFamily, node.rootKind)
      if (!resolved) {
        diagnostics.push({ code: 'CREATE_QUARANTINED', haexId: node.id, detail: `no native root for rootKind "${node.rootKind}"` })
        failedIds.push(node.id)
        continue
      }
      nextBindings = addBinding(nextBindings, { haexId: node.id, browserId: resolved.nativeId, bindingType: 'root' })
      haexToBrowser.set(node.id, resolved.nativeId)
      continue
    }
    if (node.kind === 'separator' && !api.supportsSeparators) {
      diagnostics.push({ code: 'SEPARATOR_UNSUPPORTED', haexId: node.id, detail: 'target browser cannot create separators' })
      continue
    }
    const parentBrowserId = node.parentId ? haexToBrowser.get(node.parentId) : undefined
    if (!parentBrowserId) {
      diagnostics.push({ code: 'CREATE_QUARANTINED', haexId: node.id, detail: 'parent is not locally mapped yet, will retry next run' })
      failedIds.push(node.id)
      continue
    }
    await attempt(node.id, async () => {
      const created = await journaledCreate(api, journal, nextBindings, node.id, parentBrowserId, {
        title: node.title ?? '',
        url: node.kind === 'bookmark' ? (node.url ?? undefined) : undefined,
        index: node.position,
        kind: node.kind,
      })
      nextBindings = created.bindings
      haexToBrowser.set(node.id, created.nativeId)
    })
  }

  for (const { id, node } of diff.updates) {
    const browserId = haexToBrowser.get(id)
    if (!browserId)
      continue
    const op: PendingBrowserOperation = {
      opId: crypto.randomUUID(),
      type: 'update',
      haexId: id,
      browserId,
      parentBrowserId: null,
      beforeChildIds: [],
      expected: { title: node.title ?? '', url: node.url, index: node.position },
    }
    await attempt(id, async () => {
      await journaledWrite(journal, op, () => api.update(browserId, { title: node.title ?? '', url: node.url ?? undefined }))
      await journal.resolvePending(op.opId)
    })
  }

  for (const { id, node } of diff.moves) {
    const browserId = haexToBrowser.get(id)
    const parentBrowserId = node.parentId ? haexToBrowser.get(node.parentId) : undefined
    if (!browserId || !parentBrowserId)
      continue
    const op: PendingBrowserOperation = {
      opId: crypto.randomUUID(),
      type: 'move',
      haexId: id,
      browserId,
      parentBrowserId,
      beforeChildIds: [],
      expected: { title: node.title ?? '', url: node.url, index: node.position },
    }
    await attempt(id, async () => {
      const index = await clampIndex(api, parentBrowserId, node.position)
      await journaledWrite(journal, op, () => api.move(browserId, { parentId: parentBrowserId, index }))
      await journal.resolvePending(op.opId)
    })
  }

  for (const { id } of diff.removes) {
    const browserId = haexToBrowser.get(id)
    if (!browserId)
      continue
    await attempt(id, async () => {
      const afterRemove = removeBindingByHaexId(nextBindings, id)
      await journaledRemove(api, journal, browserId, afterRemove)
      nextBindings = afterRemove
      haexToBrowser.delete(id)
    })
  }

  return { bindings: nextBindings, diagnostics, failedIds }
}
