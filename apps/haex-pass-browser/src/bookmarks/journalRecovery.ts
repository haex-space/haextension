// Crash recovery for the native-write journal (see the design note in
// nativeAdapter.ts): replays operations a sync pass left pending.

import type { Diagnostic, JournalHandle, NativeBookmarksApi } from './nativeAdapter'
import type { BookmarkIdBinding, PendingBrowserOperation } from './storage'
import { clampIndex, clampToChildren, findNodeById } from './nativeAdapter'
import { addBinding } from './storage'

// Resume any operation left pending after a crash, without ever risking a
// duplicate create.

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
    try {
      bindings = await recoverOp(api, journal, op, bindings, diagnostics)
    } catch (err) {
      // Same as a failed write in applyDiff: drop the entry, the diff retries.
      diagnostics.push({ code: 'APPLY_FAILED', haexId: op.haexId, nativeId: op.browserId ?? undefined, detail: String(err) })
      await journal.resolvePending(op.opId)
    }
  }

  return { bindings, diagnostics }
}

async function recoverOp(
  api: NativeBookmarksApi,
  journal: JournalHandle,
  op: PendingBrowserOperation,
  bindings: BookmarkIdBinding[],
  diagnostics: Diagnostic[],
): Promise<BookmarkIdBinding[]> {
  const tree = await api.getTree()

  if (op.type === 'remove') {
    const stillPresent = op.browserId && findNodeById(tree, op.browserId)
    if (stillPresent) {
      await api.removeTree(op.browserId!)
    }
    await journal.resolvePending(op.opId)
    return bindings
  }

  if (op.type === 'create') {
    const parent = op.parentBrowserId ? findNodeById(tree, op.parentBrowserId) : null
    const currentChildren = parent?.children ?? []
    const newChildren = currentChildren.filter(c => !op.beforeChildIds.includes(c.id))
    const matches = newChildren.filter(c => c.title === op.expected.title && (c.url ?? null) === op.expected.url)

    let nextBindings: BookmarkIdBinding[]
    if (matches.length === 0) {
      // Create never happened (or its result vanished) — safe to redo.
      const created = await api.create({
        parentId: op.parentBrowserId!,
        title: op.expected.title,
        url: op.expected.url ?? undefined,
        index: clampToChildren(op.expected.index, currentChildren.length),
        kind: op.expected.kind ?? (op.expected.url !== null ? 'bookmark' : 'folder'),
      })
      nextBindings = addBinding(bindings, { haexId: op.haexId, browserId: created.id, bindingType: 'node' })
    } else if (matches.length === 1) {
      nextBindings = addBinding(bindings, { haexId: op.haexId, browserId: matches[0].id, bindingType: 'node' })
    } else {
      diagnostics.push({
        code: 'CREATE_QUARANTINED',
        haexId: op.haexId,
        detail: `${matches.length} candidate native nodes matched after crash recovery — left unbound to avoid a wrong duplicate pick`,
      })
      // Left unresolved on purpose: do not resolvePending, so this stays
      // flagged for a human decision instead of guessing.
      return bindings
    }
    await journal.resolvePending(op.opId, nextBindings)
    return nextBindings
  }

  // 'update'/'move': compare current state against `expected` and redo if needed.
  const node = op.browserId ? findNodeById(tree, op.browserId) : null
  if (node) {
    const matchesExpected = node.title === op.expected.title && (node.url ?? null) === op.expected.url
    if (!matchesExpected) {
      await api.update(op.browserId!, { title: op.expected.title, url: op.expected.url ?? undefined })
    }
    if (op.type === 'move' && op.parentBrowserId && node.parentId !== op.parentBrowserId) {
      await api.move(op.browserId!, { parentId: op.parentBrowserId, index: await clampIndex(api, op.parentBrowserId, op.expected.index) })
    }
  }
  await journal.resolvePending(op.opId)
  return bindings
}
