// Pure, browser-independent bookmark model: node/root types, canonical root
// mapping, forest construction, and forest diffing. No `browser` globals —
// testable in plain Node/vitest.

export const BOOKMARK_NODE_KINDS = ['folder', 'bookmark', 'separator'] as const
export const BOOKMARK_ROOT_KINDS = ['toolbar', 'menu', 'other', 'mobile'] as const
export const BROWSER_FAMILIES = ['firefox', 'chromium', 'edge', 'other'] as const

export type BookmarkNodeKind = (typeof BOOKMARK_NODE_KINDS)[number]
export type BookmarkRootKind = (typeof BOOKMARK_ROOT_KINDS)[number]
export type BrowserFamily = (typeof BROWSER_FAMILIES)[number]

/** Flat row shape, matching the `haex_bookmarks` table / `bookmarks-list` response. */
export interface BookmarkNodeRow {
  id: string
  collectionId: string
  parentId: string | null
  rootKind: BookmarkRootKind | null
  kind: BookmarkNodeKind
  title: string | null
  url: string | null
  position: number
}

/** A node with its children resolved, sorted by `position`. */
export interface BookmarkTreeNode extends BookmarkNodeRow {
  children: BookmarkTreeNode[]
}

// ---------------------------------------------------------------------------
// Canonical root mapping (browserFamily -> native root ids, and back).
// ---------------------------------------------------------------------------

const CHROMIUM_LIKE_ROOT_IDS: Partial<Record<BookmarkRootKind, string>> = {
  toolbar: '1',
  other: '2',
  mobile: '3',
}

const FIREFOX_ROOT_IDS: Partial<Record<BookmarkRootKind, string>> = {
  toolbar: 'toolbar_____',
  menu: 'menu________',
  other: 'unfiled_____',
  mobile: 'mobile______',
}

/**
 * Native root ids this browser family exposes, keyed by canonical root kind.
 * `chromium`/`edge` have no native `menu` root; `other` (unknown family) has
 * none at all — callers must fall back (canonical root kind -> `other`).
 */
export function nativeRootIdsForFamily(family: BrowserFamily): Partial<Record<BookmarkRootKind, string>> {
  switch (family) {
    case 'firefox':
      return FIREFOX_ROOT_IDS
    case 'chromium':
    case 'edge':
      return CHROMIUM_LIKE_ROOT_IDS
    case 'other':
      return {}
  }
}

/** Inverse lookup: native root id -> canonical root kind, or null if unknown. */
export function rootKindForNativeId(family: BrowserFamily, nativeId: string): BookmarkRootKind | null {
  const map = nativeRootIdsForFamily(family)
  for (const kind of BOOKMARK_ROOT_KINDS) {
    if (map[kind] === nativeId)
      return kind
  }
  return null
}

/**
 * Native root id to materialize a canonical root kind into, for this browser
 * family. Falls back to the family's `other` root when the kind has no
 * native counterpart (e.g. `menu` in Chromium) — caller is responsible for
 * recording a diagnosis when `usedFallback` is true. Returns null only when
 * the family has no roots at all (`other` family).
 */
export function resolveNativeRootId(
  family: BrowserFamily,
  rootKind: BookmarkRootKind,
): { nativeId: string, usedFallback: boolean } | null {
  const map = nativeRootIdsForFamily(family)
  const direct = map[rootKind]
  if (direct)
    return { nativeId: direct, usedFallback: false }

  const fallback = map.other
  if (fallback)
    return { nativeId: fallback, usedFallback: true }

  return null
}

// ---------------------------------------------------------------------------
// Forest construction, with deterministic orphan/cycle resolution.
// ---------------------------------------------------------------------------

export interface BuildForestResult {
  roots: BookmarkTreeNode[]
  /** ids that were reparented because their parent was missing or cyclic. */
  reparentedIds: string[]
}

/**
 * Builds a forest from a flat row list. Rows whose `parentId` is missing
 * from the set, or that participate in a parent cycle, are deterministically
 * cut loose and reattached under `orphanFallbackParentId` (or promoted to a
 * top-level root when that id is null/absent) so a corrupt or partially
 * synced snapshot can never crash the diff/apply pipeline.
 */
export function buildForest(rows: BookmarkNodeRow[], orphanFallbackParentId: string | null = null): BuildForestResult {
  const byId = new Map(rows.map(row => [row.id, row]))
  const reparentedIds: string[] = []

  // effectiveParent starts as the declared parentId, then gets corrected
  // below for missing parents and cycle members.
  const effectiveParent = new Map<string, string | null>()
  for (const row of rows) effectiveParent.set(row.id, row.parentId)

  const reparent = (id: string) => {
    if (effectiveParent.get(id) !== orphanFallbackParentId) {
      effectiveParent.set(id, orphanFallbackParentId)
      reparentedIds.push(id)
    }
  }

  // Missing-parent orphans: declared parentId doesn't exist in the row set.
  for (const row of rows) {
    if (row.parentId !== null && !byId.has(row.parentId)) {
      reparent(row.id)
    }
  }

  // Cycle detection: walk each node's ancestor chain. A cycle is cut by
  // reparenting the lexicographically largest id among its members —
  // deterministic and stable across runs/replicas.
  const state = new Map<string, 'unvisited' | 'visiting' | 'done'>()
  for (const row of rows) state.set(row.id, 'unvisited')

  for (const row of rows) {
    if (state.get(row.id) !== 'unvisited')
      continue

    const path: string[] = []
    let current: string | null = row.id
    while (current !== null && state.get(current) === 'unvisited') {
      state.set(current, 'visiting')
      path.push(current)
      current = effectiveParent.get(current) ?? null
    }

    if (current !== null && state.get(current) === 'visiting') {
      // Found a cycle: the portion of `path` from `current` onward.
      const cycleStart = path.indexOf(current)
      const cycleMembers = path.slice(cycleStart)
      const largest = cycleMembers.reduce((a, b) => (a > b ? a : b))
      reparent(largest)
    }

    for (const id of path) state.set(id, 'done')
  }

  const roots: BookmarkTreeNode[] = []
  const nodeById = new Map<string, BookmarkTreeNode>()
  for (const row of rows) {
    nodeById.set(row.id, { ...row, parentId: effectiveParent.get(row.id) ?? null, children: [] })
  }
  for (const row of rows) {
    const node = nodeById.get(row.id)!
    const parentId = effectiveParent.get(row.id) ?? null
    if (parentId === null || parentId === orphanFallbackParentId) {
      if (parentId === orphanFallbackParentId && orphanFallbackParentId !== null) {
        nodeById.get(orphanFallbackParentId)?.children.push(node)
      } else {
        roots.push(node)
      }
    } else {
      const parent = nodeById.get(parentId)
      if (parent) {
        parent.children.push(node)
      } else {
        // Defensive: shouldn't happen after the orphan pass above.
        roots.push(node)
      }
    }
  }

  const sortByPosition = (node: BookmarkTreeNode) => {
    node.children.sort((a, b) => a.position - b.position)
    node.children.forEach(sortByPosition)
  }
  roots.sort((a, b) => a.position - b.position)
  roots.forEach(sortByPosition)

  return { roots, reparentedIds }
}

/** Flattens a forest back into row order (parents before children, i.e. topological). */
export function flattenForest(roots: BookmarkTreeNode[]): BookmarkNodeRow[] {
  const out: BookmarkNodeRow[] = []
  const visit = (node: BookmarkTreeNode) => {
    const { children, ...row } = node
    out.push(row)
    children.forEach(visit)
  }
  roots.forEach(visit)
  return out
}

// ---------------------------------------------------------------------------
// Diffing two flat row lists (previous snapshot vs. new desired state).
// ---------------------------------------------------------------------------

export interface CreateOp { type: 'create', node: BookmarkNodeRow }
export interface UpdateOp { type: 'update', id: string, node: BookmarkNodeRow }
export interface MoveOp { type: 'move', id: string, node: BookmarkNodeRow, fromParentId: string | null, fromPosition: number }
export interface RemoveOp { type: 'remove', id: string }
export type DiffOp = CreateOp | UpdateOp | MoveOp | RemoveOp

export interface ForestDiff {
  creates: CreateOp[]
  updates: UpdateOp[]
  moves: MoveOp[]
  removes: RemoveOp[]
}

function fieldsEqual(a: BookmarkNodeRow, b: BookmarkNodeRow): boolean {
  return a.kind === b.kind && a.title === b.title && a.url === b.url && a.rootKind === b.rootKind
}

function depthOf(row: BookmarkNodeRow, byId: Map<string, BookmarkNodeRow>): number {
  let depth = 0
  let current: BookmarkNodeRow | undefined = row
  const seen = new Set<string>()
  while (current?.parentId !== null && current?.parentId !== undefined && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = byId.get(current.parentId)
    if (!parent)
      break
    depth += 1
    current = parent
  }
  return depth
}

/**
 * Diffs `previous` (last applied snapshot) against `next` (new desired
 * state) by node identity (`id`). Creates are returned parent-first, removes
 * child-first — safe orders for a caller applying folder creates/removes
 * without a two-pass parent lookup.
 */
export function diffForests(previous: BookmarkNodeRow[], next: BookmarkNodeRow[]): ForestDiff {
  const prevById = new Map(previous.map(row => [row.id, row]))
  const nextById = new Map(next.map(row => [row.id, row]))

  const creates: CreateOp[] = []
  const updates: UpdateOp[] = []
  const moves: MoveOp[] = []
  const removes: RemoveOp[] = []

  for (const [id, node] of nextById) {
    const prev = prevById.get(id)
    if (!prev) {
      creates.push({ type: 'create', node })
      continue
    }
    const moved = prev.parentId !== node.parentId || prev.position !== node.position
    if (moved) {
      moves.push({ type: 'move', id, node, fromParentId: prev.parentId, fromPosition: prev.position })
    } else if (!fieldsEqual(prev, node)) {
      updates.push({ type: 'update', id, node })
    }
  }

  for (const [id] of prevById) {
    if (!nextById.has(id))
      removes.push({ type: 'remove', id })
  }

  creates.sort((a, b) => depthOf(a.node, nextById) - depthOf(b.node, nextById))
  moves.sort((a, b) => depthOf(a.node, nextById) - depthOf(b.node, nextById))
  removes.sort((a, b) => depthOf(prevById.get(b.id)!, prevById) - depthOf(prevById.get(a.id)!, prevById))

  return { creates, updates, moves, removes }
}

export function isDiffEmpty(diff: ForestDiff): boolean {
  return diff.creates.length === 0 && diff.updates.length === 0 && diff.moves.length === 0 && diff.removes.length === 0
}

// ---------------------------------------------------------------------------
// Text field validation shared by onboarding/options UI. Mirrors V's
// validateCollectionName/validateDeviceLabel so bad input is caught before a
// round trip, but V remains the authority — this is UX, not enforcement.
// ---------------------------------------------------------------------------

// U+0000-U+001F except tab/LF/CR, which are normalizable whitespace.
const FORBIDDEN_CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}${String.fromCharCode(12)}${String.fromCharCode(14)}-${String.fromCharCode(31)}]`,
)

export type TextFieldError = 'tooShort' | 'tooLong' | 'invalidChars'

/** Validates a trimmed length range and absence of control chars. Returns null when valid. */
export function validateTrimmedText(value: string, minLength: number, maxLength: number): TextFieldError | null {
  const trimmed = value.trim()
  if (trimmed.length < minLength)
    return 'tooShort'
  if (trimmed.length > maxLength)
    return 'tooLong'
  if (FORBIDDEN_CONTROL_CHARS.test(value))
    return 'invalidChars'
  return null
}
