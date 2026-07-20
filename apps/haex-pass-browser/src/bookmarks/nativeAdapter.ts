// Native bookmark tree adapter: seeding a new collection from the current
// native tree, activating (wipe + materialize) a collection, and crash-safe
// journal recovery. The WebExtension bookmarks API is injected as
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
  create: (details: NativeCreateDetails) => Promise<NativeBookmarkNode>
  update: (id: string, changes: { title?: string, url?: string }) => Promise<void>
  move: (id: string, destination: { parentId: string, index: number }) => Promise<void>
  removeTree: (id: string) => Promise<void>
}

export interface Diagnostic {
  code: 'UNMODIFIABLE_SKIPPED' | 'SEPARATOR_UNSUPPORTED' | 'ROOT_FALLBACK' | 'CREATE_QUARANTINED'
  haexId?: string
  nativeId?: string
  detail: string
}

export interface JournalHandle {
  appendPending: (op: PendingBrowserOperation) => Promise<void>
  resolvePending: (opId: string) => Promise<void>
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

async function journaledRemove(api: NativeBookmarksApi, journal: JournalHandle, browserId: string): Promise<void> {
  const op: PendingBrowserOperation = {
    opId: crypto.randomUUID(),
    type: 'remove',
    haexId: '',
    browserId,
    parentBrowserId: null,
    beforeChildIds: [],
    expected: { title: '', url: null, index: 0 },
  }
  await journal.appendPending(op)
  await api.removeTree(browserId)
  await journal.resolvePending(op.opId)
}

async function journaledCreate(
  api: NativeBookmarksApi,
  journal: JournalHandle,
  haexId: string,
  parentBrowserId: string,
  beforeChildIds: string[],
  details: Omit<NativeCreateDetails, 'parentId'>,
): Promise<string> {
  const op: PendingBrowserOperation = {
    opId: crypto.randomUUID(),
    type: 'create',
    haexId,
    browserId: null,
    parentBrowserId,
    beforeChildIds,
    expected: { title: details.title, url: details.url ?? null, index: details.index },
  }
  await journal.appendPending(op)
  const created = await api.create({ ...details, parentId: parentBrowserId })
  await journal.resolvePending(op.opId)
  return created.id
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
      const nativeId = await journaledCreate(api, journal, node.id, nativeParentId, [], {
        title: node.title ?? '',
        url: node.kind === 'bookmark' ? (node.url ?? undefined) : undefined,
        index: node.position,
        kind: node.kind,
      })
      bindings = addBinding(bindings, { haexId: node.id, browserId: nativeId, bindingType: 'node' })
      await materialize(node.children, nativeId)
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
}

export async function applyDiff(
  api: NativeBookmarksApi,
  journal: JournalHandle,
  bindings: BookmarkIdBinding[],
  diff: ForestDiff,
): Promise<ApplyDiffResult> {
  const diagnostics: Diagnostic[] = []
  let nextBindings = bindings
  const { haexToBrowser } = buildBindingMaps(nextBindings)

  for (const { node } of diff.creates) {
    if (node.kind === 'separator' && !api.supportsSeparators) {
      diagnostics.push({ code: 'SEPARATOR_UNSUPPORTED', haexId: node.id, detail: 'target browser cannot create separators' })
      continue
    }
    const parentBrowserId = node.parentId ? haexToBrowser.get(node.parentId) : undefined
    if (!parentBrowserId) {
      diagnostics.push({ code: 'CREATE_QUARANTINED', haexId: node.id, detail: 'parent is not locally mapped yet, will retry next run' })
      continue
    }
    const nativeId = await journaledCreate(api, journal, node.id, parentBrowserId, [], {
      title: node.title ?? '',
      url: node.kind === 'bookmark' ? (node.url ?? undefined) : undefined,
      index: node.position,
      kind: node.kind,
    })
    nextBindings = addBinding(nextBindings, { haexId: node.id, browserId: nativeId, bindingType: 'node' })
    haexToBrowser.set(node.id, nativeId)
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
    await journal.appendPending(op)
    await api.update(browserId, { title: node.title ?? '', url: node.url ?? undefined })
    await journal.resolvePending(op.opId)
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
    await journal.appendPending(op)
    await api.move(browserId, { parentId: parentBrowserId, index: node.position })
    await journal.resolvePending(op.opId)
  }

  for (const { id } of diff.removes) {
    const browserId = haexToBrowser.get(id)
    if (!browserId)
      continue
    await journaledRemove(api, journal, browserId)
    nextBindings = removeBindingByHaexId(nextBindings, id)
    haexToBrowser.delete(id)
  }

  return { bindings: nextBindings, diagnostics }
}

// ---------------------------------------------------------------------------
// recoverJournal — resume any operation left pending after a crash, without
// ever risking a duplicate create.
// ---------------------------------------------------------------------------

export interface RecoverResult {
  bindings: BookmarkIdBinding[]
  diagnostics: Diagnostic[]
}

export async function recoverJournal(
  api: NativeBookmarksApi,
  journal: JournalHandle,
  pendingOps: PendingBrowserOperation[],
  existingBindings: BookmarkIdBinding[],
): Promise<RecoverResult> {
  const diagnostics: Diagnostic[] = []
  let bindings = existingBindings

  for (const op of pendingOps) {
    const tree = await api.getTree()

    if (op.type === 'remove') {
      const stillPresent = op.browserId && findNodeById(tree, op.browserId)
      if (stillPresent) {
        await api.removeTree(op.browserId!)
      }
      await journal.resolvePending(op.opId)
      continue
    }

    if (op.type === 'create') {
      const parent = op.parentBrowserId ? findNodeById(tree, op.parentBrowserId) : null
      const currentChildren = parent?.children ?? []
      const newChildren = currentChildren.filter(c => !op.beforeChildIds.includes(c.id))
      const matches = newChildren.filter(c => c.title === op.expected.title && (c.url ?? null) === op.expected.url)

      if (matches.length === 0) {
        // Create never happened (or its result vanished) — safe to redo.
        const created = await api.create({
          parentId: op.parentBrowserId!,
          title: op.expected.title,
          url: op.expected.url ?? undefined,
          index: op.expected.index,
          kind: op.expected.url !== null ? 'bookmark' : 'folder',
        })
        bindings = addBinding(bindings, { haexId: op.haexId, browserId: created.id, bindingType: 'node' })
      } else if (matches.length === 1) {
        bindings = addBinding(bindings, { haexId: op.haexId, browserId: matches[0].id, bindingType: 'node' })
      } else {
        diagnostics.push({
          code: 'CREATE_QUARANTINED',
          haexId: op.haexId,
          detail: `${matches.length} candidate native nodes matched after crash recovery — left unbound to avoid a wrong duplicate pick`,
        })
        // Left unresolved on purpose: do not resolvePending, so this stays
        // flagged for a human decision instead of guessing.
        continue
      }
      await journal.resolvePending(op.opId)
      continue
    }

    // 'update'/'move': compare current state against `expected` and redo if needed.
    const node = op.browserId ? findNodeById(tree, op.browserId) : null
    if (node) {
      const matchesExpected = node.title === op.expected.title && (node.url ?? null) === op.expected.url
      if (!matchesExpected) {
        await api.update(op.browserId!, { title: op.expected.title, url: op.expected.url ?? undefined })
      }
      if (op.type === 'move' && op.parentBrowserId && node.parentId !== op.parentBrowserId) {
        await api.move(op.browserId!, { parentId: op.parentBrowserId, index: op.expected.index })
      }
    }
    await journal.resolvePending(op.opId)
  }

  return { bindings, diagnostics }
}
