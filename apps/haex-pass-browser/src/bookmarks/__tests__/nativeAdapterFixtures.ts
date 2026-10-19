// Shared fakes for the nativeAdapter specs: an in-memory native bookmark
// tree that behaves like the WebExtension API, a journal and row builders.
import type { BookmarkNodeRow } from '../model'
import type { NativeBookmarkNode, NativeBookmarksApi } from '../nativeAdapter'
import type { PendingBrowserOperation } from '../storage'

/** Recursive lookup — `chromiumTree()` nests the real roots under a synthetic id "0". */
export function findInTree(nodes: NativeBookmarkNode[], id: string): NativeBookmarkNode | undefined {
  for (const node of nodes) {
    if (node.id === id)
      return node
    if (node.children) {
      const found = findInTree(node.children, id)
      if (found)
        return found
    }
  }
  return undefined
}

function cloneTree(nodes: NativeBookmarkNode[]): NativeBookmarkNode[] {
  return nodes.map(n => ({ ...n, children: n.children ? cloneTree(n.children) : undefined }))
}

export class FakeNativeApi implements NativeBookmarksApi {
  supportsSeparators: boolean
  roots: NativeBookmarkNode[]
  private index = new Map<string, { node: NativeBookmarkNode, parent: NativeBookmarkNode | null }>()
  private nextId: number

  constructor(roots: NativeBookmarkNode[], opts: { supportsSeparators?: boolean, startId?: number } = {}) {
    this.roots = roots
    this.supportsSeparators = opts.supportsSeparators ?? false
    this.nextId = opts.startId ?? 1000
    this.reindex()
  }

  private reindex() {
    this.index.clear()
    const visit = (nodes: NativeBookmarkNode[], parent: NativeBookmarkNode | null) => {
      for (const node of nodes) {
        this.index.set(node.id, { node, parent })
        if (node.children)
          visit(node.children, node)
      }
    }
    visit(this.roots, null)
  }

  async getTree() {
    return cloneTree(this.roots)
  }

  async getChildren(id: string) {
    return cloneTree(this.index.get(id)?.node.children ?? [])
  }

  async create(details: { parentId: string, title: string, url?: string, index: number, kind: 'folder' | 'bookmark' | 'separator' }): Promise<NativeBookmarkNode> {
    const entry = this.index.get(details.parentId)
    if (!entry)
      throw new Error(`parent ${details.parentId} not found`)
    const node: NativeBookmarkNode = {
      id: String(this.nextId++),
      parentId: details.parentId,
      title: details.title,
      url: details.kind === 'bookmark' ? details.url : undefined,
      type: details.kind,
      children: details.kind === 'folder' ? [] : undefined,
    }
    entry.node.children ??= []
    // Mirrors Chromium, which rejects an index past the current child count.
    if (details.index > entry.node.children.length)
      throw new Error('Index out of bounds.')
    entry.node.children.splice(details.index, 0, node)
    this.reindex()
    return { ...node }
  }

  async update(id: string, changes: { title?: string, url?: string }): Promise<void> {
    const entry = this.index.get(id)
    if (!entry)
      throw new Error('not found')
    if (changes.title !== undefined)
      entry.node.title = changes.title
    if (changes.url !== undefined)
      entry.node.url = changes.url
  }

  async move(id: string, destination: { parentId: string, index: number }): Promise<void> {
    const entry = this.index.get(id)
    if (!entry)
      throw new Error('not found')
    const targetEntry = this.index.get(destination.parentId)
    if (destination.index > (targetEntry?.node.children?.length ?? 0))
      throw new Error('Index out of bounds.')
    const oldSiblings = entry.parent ? (entry.parent.children ?? []) : this.roots
    const idx = oldSiblings.indexOf(entry.node)
    if (idx >= 0)
      oldSiblings.splice(idx, 1)
    const newParentEntry = this.index.get(destination.parentId)
    const newSiblings = newParentEntry ? (newParentEntry.node.children ??= []) : this.roots
    newSiblings.splice(destination.index, 0, entry.node)
    entry.node.parentId = destination.parentId
    this.reindex()
  }

  async removeTree(id: string): Promise<void> {
    const entry = this.index.get(id)
    if (!entry)
      return // idempotent: already gone
    const siblings = entry.parent ? (entry.parent.children ?? []) : this.roots
    const idx = siblings.indexOf(entry.node)
    if (idx >= 0)
      siblings.splice(idx, 1)
    this.reindex()
  }

  findId(id: string) {
    return this.index.get(id)?.node ?? null
  }
}

export function createFakeJournal() {
  const pending: PendingBrowserOperation[] = []
  return {
    pending,
    appendPending: async (op: PendingBrowserOperation) => { pending.push(op) },
    resolvePending: async (opId: string) => {
      const idx = pending.findIndex(p => p.opId === opId)
      if (idx >= 0)
        pending.splice(idx, 1)
    },
  }
}

export function chromiumTree(): NativeBookmarkNode[] {
  return [
    {
      id: '0',
      title: 'root',
      children: [
        { id: '1', title: 'Bookmarks bar', children: [
          { id: '10', title: 'Example', url: 'https://example.com', children: undefined },
        ] },
        { id: '2', title: 'Other bookmarks', children: [] },
        { id: '3', title: 'Mobile bookmarks', children: [], unmodifiable: 'managed' },
      ],
    },
  ]
}

export function firefoxTree(): NativeBookmarkNode[] {
  return [
    { id: 'toolbar_____', title: 'Toolbar', children: [
      { id: 'ff10', title: 'Existing', url: 'https://existing.example', children: undefined },
      { id: 'ff-managed', title: 'Managed', url: 'https://managed.example', children: undefined, unmodifiable: 'policy' },
    ] },
    { id: 'menu________', title: 'Menu', children: [] },
    { id: 'unfiled_____', title: 'Other', children: [] },
    { id: 'mobile______', title: 'Mobile', children: [] },
  ]
}

export function row(partial: Partial<BookmarkNodeRow> & { id: string }): BookmarkNodeRow {
  return {
    collectionId: 'c1',
    parentId: null,
    rootKind: null,
    kind: 'bookmark',
    title: null,
    url: null,
    position: 0,
    ...partial,
  }
}
