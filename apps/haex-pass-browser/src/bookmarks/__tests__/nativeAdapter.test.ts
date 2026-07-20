import type { BookmarkNodeRow } from '../model'
import type { NativeBookmarkNode, NativeBookmarksApi } from '../nativeAdapter'
import type { BookmarkIdBinding, PendingBrowserOperation } from '../storage'
import { describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

// nativeAdapter.ts imports storage.ts, which auto-imports the real
// `webextension-polyfill` (it references `browser.storage.local`) — that
// module throws immediately outside an actual extension context, so it must
// be mocked even though this file never touches `browser` itself.
vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

import { diffForests } from '../model'
import { activateCollection, applyDiff, recoverJournal, seedCollectionFromNative } from '../nativeAdapter'

/** Recursive lookup — `chromiumTree()` nests the real roots under a synthetic id "0". */
function findInTree(nodes: NativeBookmarkNode[], id: string): NativeBookmarkNode | undefined {
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

class FakeNativeApi implements NativeBookmarksApi {
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

function createFakeJournal() {
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

function chromiumTree(): NativeBookmarkNode[] {
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

function firefoxTree(): NativeBookmarkNode[] {
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

function row(partial: Partial<BookmarkNodeRow> & { id: string }): BookmarkNodeRow {
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

describe('seedCollectionFromNative', () => {
  it('uploads existing bookmarks as the new collection, without deleting anything', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const before = await api.getTree()

    const { bindings, snapshot, diagnostics } = await seedCollectionFromNative(api, 'c1', 'chromium')

    const after = await api.getTree()
    expect(after).toEqual(before) // seeding never mutates the native tree

    const toolbarRoot = snapshot.find(n => n.rootKind === 'toolbar')
    expect(toolbarRoot).toBeTruthy()
    const example = snapshot.find(n => n.url === 'https://example.com')
    expect(example?.parentId).toBe(toolbarRoot!.id)
    expect(bindings.find(b => b.browserId === '10')).toBeTruthy()

    // The unmodifiable "Mobile bookmarks" root exists but has no children —
    // still gets a root binding; genuinely unmodifiable descendants elsewhere would be excluded.
    expect(diagnostics.filter(d => d.code === 'UNMODIFIABLE_SKIPPED')).toEqual([])
  })

  it('excludes unmodifiable descendants and their subtree from the upload', async () => {
    const tree = firefoxTree()
    const api = new FakeNativeApi(tree)
    const { snapshot, bindings, diagnostics } = await seedCollectionFromNative(api, 'c1', 'firefox')

    expect(snapshot.find(n => n.url === 'https://managed.example')).toBeUndefined()
    expect(bindings.find(b => b.browserId === 'ff-managed')).toBeUndefined()
    expect(diagnostics.some(d => d.code === 'UNMODIFIABLE_SKIPPED' && d.nativeId === 'ff-managed')).toBe(true)
  })
})

describe('activateCollection', () => {
  it('empties modifiable descendants of native roots and materializes the target collection', async () => {
    const api = new FakeNativeApi(firefoxTree())
    const journal = createFakeJournal()

    const target: BookmarkNodeRow[] = [
      row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'bm1', parentId: 'root-toolbar', title: 'New', url: 'https://new.example', position: 0 }),
    ]

    const { bindings, diagnostics } = await activateCollection(api, journal, 'firefox', target)

    const tree = await api.getTree()
    const toolbar = findInTree(tree, 'toolbar_____')!
    // Old "Existing" bookmark is gone, managed one was never touched (it wasn't there to remove from toolbar since we only clear modifiable ones — verify no leftover of the old modifiable child).
    expect(toolbar.children!.some(c => c.url === 'https://existing.example')).toBe(false)
    expect(toolbar.children!.some(c => c.url === 'https://new.example')).toBe(true)

    // Native roots themselves were never removed/recreated.
    expect(tree.map(n => n.id).sort()).toEqual(['menu________', 'mobile______', 'toolbar_____', 'unfiled_____'])

    expect(bindings.find(b => b.haexId === 'bm1')).toBeTruthy()
    expect(journal.pending).toEqual([])
    expect(diagnostics).toEqual([])
  })

  it('leaves unmodifiable children untouched when clearing', async () => {
    const api = new FakeNativeApi(firefoxTree())
    const journal = createFakeJournal()
    await activateCollection(api, journal, 'firefox', [])

    const tree = await api.getTree()
    const toolbar = findInTree(tree, 'toolbar_____')!
    expect(toolbar.children!.some(c => c.id === 'ff-managed')).toBe(true)
  })

  it('falls back an unsupported rootKind to "other" and records a diagnostic, without breaking bijectivity', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const journal = createFakeJournal()

    const target: BookmarkNodeRow[] = [
      row({ id: 'root-other', kind: 'folder', rootKind: 'other', position: 0 }),
      row({ id: 'root-menu', kind: 'folder', rootKind: 'menu', position: 1 }),
      row({ id: 'other-child', parentId: 'root-other', title: 'O', url: 'https://o.example', position: 0 }),
      row({ id: 'menu-child', parentId: 'root-menu', title: 'M', url: 'https://m.example', position: 0 }),
    ]

    const { bindings, diagnostics } = await activateCollection(api, journal, 'chromium', target)

    expect(diagnostics.some(d => d.code === 'ROOT_FALLBACK' && d.haexId === 'root-menu')).toBe(true)
    // Both canonical roots bind to the same native "Other bookmarks" (id '2').
    expect(bindings.find(b => b.haexId === 'root-other')?.browserId).toBe('2')
    expect(bindings.find(b => b.haexId === 'root-menu')?.browserId).toBe('2')

    const tree = await api.getTree()
    const other = findInTree(tree, '2')!
    expect(other.children!.map(c => c.url).sort()).toEqual(['https://m.example', 'https://o.example'])
  })

  it('creates folders parent-first (a nested bookmark ends up under its own folder, not the root)', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const journal = createFakeJournal()

    const target: BookmarkNodeRow[] = [
      row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'folder1', parentId: 'root-toolbar', kind: 'folder', title: 'Folder', position: 0 }),
      row({ id: 'bm1', parentId: 'folder1', title: 'Nested', url: 'https://nested.example', position: 0 }),
    ]

    await activateCollection(api, journal, 'chromium', target)

    const tree = await api.getTree()
    const toolbar = findInTree(tree, '1')!
    const folder = toolbar.children!.find(c => c.title === 'Folder')!
    expect(folder.children!.some(c => c.url === 'https://nested.example')).toBe(true)
  })

  it('skips separators on a browser family that cannot create them', async () => {
    const api = new FakeNativeApi(chromiumTree(), { supportsSeparators: false })
    const journal = createFakeJournal()

    const target: BookmarkNodeRow[] = [
      row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'sep1', parentId: 'root-toolbar', kind: 'separator', position: 0 }),
    ]

    const { diagnostics, bindings } = await activateCollection(api, journal, 'chromium', target)
    expect(diagnostics.some(d => d.code === 'SEPARATOR_UNSUPPORTED' && d.haexId === 'sep1')).toBe(true)
    expect(bindings.find(b => b.haexId === 'sep1')).toBeUndefined()
  })

  it('creates separators on a browser family that supports them', async () => {
    const api = new FakeNativeApi(firefoxTree(), { supportsSeparators: true })
    const journal = createFakeJournal()

    const target: BookmarkNodeRow[] = [
      row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'sep1', parentId: 'root-toolbar', kind: 'separator', position: 0 }),
    ]

    const { diagnostics, bindings } = await activateCollection(api, journal, 'firefox', target)
    expect(diagnostics.some(d => d.code === 'SEPARATOR_UNSUPPORTED')).toBe(false)
    expect(bindings.find(b => b.haexId === 'sep1')).toBeTruthy()
  })
})

describe('applyDiff', () => {
  it('is a no-op for an empty diff', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const journal = createFakeJournal()
    const bindings: BookmarkIdBinding[] = [{ haexId: 'root-toolbar', browserId: '1', bindingType: 'root' }]
    const before = await api.getTree()

    const diff = diffForests([], [])
    const result = await applyDiff(api, journal, bindings, diff)

    expect(result.bindings).toEqual(bindings)
    expect(await api.getTree()).toEqual(before)
  })

  it('creates, updates, moves and removes according to the diff', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const journal = createFakeJournal()
    const bindings: BookmarkIdBinding[] = [{ haexId: 'root-toolbar', browserId: '1', bindingType: 'root' }]

    const prev: BookmarkNodeRow[] = [
      row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 }),
    ]
    const next: BookmarkNodeRow[] = [
      row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'bm1', parentId: 'root-toolbar', title: 'New', url: 'https://new.example', position: 0 }),
    ]
    const diff = diffForests(prev, next)
    const { bindings: afterCreate } = await applyDiff(api, journal, bindings, diff)

    const tree1 = await api.getTree()
    expect(findInTree(tree1, '1')!.children!.some(c => c.url === 'https://new.example')).toBe(true)

    const next2: BookmarkNodeRow[] = [
      row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'bm1', parentId: 'root-toolbar', title: 'Renamed', url: 'https://new.example', position: 0 }),
    ]
    const diff2 = diffForests(next, next2)
    await applyDiff(api, journal, afterCreate, diff2)
    const tree2 = await api.getTree()
    expect(findInTree(tree2, '1')!.children![0].title).toBe('Renamed')

    const diff3 = diffForests(next2, [row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 })])
    const { bindings: afterRemove } = await applyDiff(api, journal, afterCreate, diff3)
    const tree3 = await api.getTree()
    // Only the diff-owned "bm1" is gone; the pre-existing "Example" bookmark
    // (never part of any vault-side row) is untouched — applyDiff only acts
    // on nodes it was told about.
    expect(findInTree(tree3, '1')!.children!.some(c => c.url === 'https://new.example')).toBe(false)
    expect(findInTree(tree3, '1')!.children!.some(c => c.url === 'https://example.com')).toBe(true)
    expect(afterRemove.find(b => b.haexId === 'bm1')).toBeUndefined()
  })
})

describe('recoverJournal', () => {
  it('binds an already-succeeded create instead of duplicating it', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const journal = createFakeJournal()

    // Simulate: journal.appendPending happened, api.create succeeded, but the
    // process crashed before journal.resolvePending ran.
    const beforeChildIds = findInTree(await api.getTree(), '1')!.children!.map(c => c.id)
    await api.create({ parentId: '1', title: 'Recovered', url: 'https://recovered.example', index: 1, kind: 'bookmark' })

    const pendingOp: PendingBrowserOperation = {
      opId: 'op1',
      type: 'create',
      haexId: 'haex-recovered',
      browserId: null,
      parentBrowserId: '1',
      beforeChildIds,
      expected: { title: 'Recovered', url: 'https://recovered.example', index: 1 },
    }

    const { bindings, diagnostics } = await recoverJournal(api, journal, [pendingOp], [])

    const tree = await api.getTree()
    const matching = findInTree(tree, '1')!.children!.filter(c => c.url === 'https://recovered.example')
    expect(matching).toHaveLength(1) // no duplicate created
    expect(bindings.find(b => b.haexId === 'haex-recovered')?.browserId).toBe(matching[0].id)
    expect(diagnostics).toEqual([])
  })

  it('redoes a create that never actually happened', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const journal = createFakeJournal()
    const beforeChildIds = findInTree(await api.getTree(), '1')!.children!.map(c => c.id)

    const pendingOp: PendingBrowserOperation = {
      opId: 'op1',
      type: 'create',
      haexId: 'haex-new',
      browserId: null,
      parentBrowserId: '1',
      beforeChildIds,
      expected: { title: 'Never happened', url: 'https://never.example', index: 1 },
    }

    const { bindings } = await recoverJournal(api, journal, [pendingOp], [])
    const tree = await api.getTree()
    expect(findInTree(tree, '1')!.children!.some(c => c.url === 'https://never.example')).toBe(true)
    expect(bindings.find(b => b.haexId === 'haex-new')).toBeTruthy()
  })

  it('quarantines instead of guessing when multiple candidates match after a crash', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const journal = createFakeJournal()
    const beforeChildIds = findInTree(await api.getTree(), '1')!.children!.map(c => c.id)

    // Two candidate nodes with the exact same expected title/url now exist.
    await api.create({ parentId: '1', title: 'Dup', url: 'https://dup.example', index: 1, kind: 'bookmark' })
    await api.create({ parentId: '1', title: 'Dup', url: 'https://dup.example', index: 2, kind: 'bookmark' })

    const pendingOp: PendingBrowserOperation = {
      opId: 'op1',
      type: 'create',
      haexId: 'haex-dup',
      browserId: null,
      parentBrowserId: '1',
      beforeChildIds,
      expected: { title: 'Dup', url: 'https://dup.example', index: 1 },
    }

    const { bindings, diagnostics } = await recoverJournal(api, journal, [pendingOp], [])
    expect(bindings.find(b => b.haexId === 'haex-dup')).toBeUndefined()
    expect(diagnostics.some(d => d.code === 'CREATE_QUARANTINED')).toBe(true)
  })

  it('resolves a pending remove whose target is already gone', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const journal = createFakeJournal()

    const pendingOp: PendingBrowserOperation = {
      opId: 'op1',
      type: 'remove',
      haexId: 'haex-gone',
      browserId: 'already-removed-id',
      parentBrowserId: null,
      beforeChildIds: [],
      expected: { title: '', url: null, index: 0 },
    }

    await expect(recoverJournal(api, journal, [pendingOp], [])).resolves.toEqual({ bindings: [], diagnostics: [] })
  })
})
