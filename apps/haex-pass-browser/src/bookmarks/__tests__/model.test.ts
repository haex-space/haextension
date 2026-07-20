import type { BookmarkNodeRow } from '../model'
import { describe, expect, it } from 'vitest'
import {
  buildForest,
  diffForests,
  flattenForest,
  isDiffEmpty,
  nativeRootIdsForFamily,
  resolveNativeRootId,
  rootKindForNativeId,
  validateTrimmedText,
} from '../model'

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

describe('canonical root mapping', () => {
  it('maps chromium native root ids', () => {
    expect(nativeRootIdsForFamily('chromium')).toEqual({ toolbar: '1', other: '2', mobile: '3' })
  })

  it('maps edge the same as chromium', () => {
    expect(nativeRootIdsForFamily('edge')).toEqual(nativeRootIdsForFamily('chromium'))
  })

  it('maps firefox native root ids including menu', () => {
    expect(nativeRootIdsForFamily('firefox')).toEqual({
      toolbar: 'toolbar_____',
      menu: 'menu________',
      other: 'unfiled_____',
      mobile: 'mobile______',
    })
  })

  it('has no known roots for an unknown family', () => {
    expect(nativeRootIdsForFamily('other')).toEqual({})
  })

  it('resolves a direct match without fallback', () => {
    expect(resolveNativeRootId('firefox', 'menu')).toEqual({ nativeId: 'menu________', usedFallback: false })
  })

  it('falls back menu -> other in chromium', () => {
    expect(resolveNativeRootId('chromium', 'menu')).toEqual({ nativeId: '2', usedFallback: true })
  })

  it('returns null when the family has no roots at all', () => {
    expect(resolveNativeRootId('other', 'toolbar')).toBeNull()
  })

  it('inverts native id -> root kind', () => {
    expect(rootKindForNativeId('chromium', '1')).toBe('toolbar')
    expect(rootKindForNativeId('firefox', 'menu________')).toBe('menu')
    expect(rootKindForNativeId('chromium', 'unknown-id')).toBeNull()
  })
})

describe('buildForest', () => {
  it('builds a simple forest from a flat row list', () => {
    const rows = [
      row({ id: 'root', kind: 'folder', rootKind: 'toolbar', parentId: null, position: 0 }),
      row({ id: 'a', parentId: 'root', position: 0, title: 'A' }),
      row({ id: 'b', parentId: 'root', position: 1, title: 'B' }),
    ]
    const { roots, reparentedIds } = buildForest(rows)
    expect(reparentedIds).toEqual([])
    expect(roots).toHaveLength(1)
    expect(roots[0].id).toBe('root')
    expect(roots[0].children.map(c => c.id)).toEqual(['a', 'b'])
  })

  it('sorts children by position', () => {
    const rows = [
      row({ id: 'root', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'b', parentId: 'root', position: 1 }),
      row({ id: 'a', parentId: 'root', position: 0 }),
    ]
    const { roots } = buildForest(rows)
    expect(roots[0].children.map(c => c.id)).toEqual(['a', 'b'])
  })

  it('reparents a node whose declared parent is missing', () => {
    const rows = [
      row({ id: 'orphan', parentId: 'missing-parent', position: 0 }),
    ]
    const { roots, reparentedIds } = buildForest(rows, null)
    expect(reparentedIds).toEqual(['orphan'])
    expect(roots.map(r => r.id)).toEqual(['orphan'])
  })

  it('reparents missing-parent orphans under a fallback parent when given', () => {
    const rows = [
      row({ id: 'fallback', kind: 'folder', rootKind: 'other', position: 0 }),
      row({ id: 'orphan', parentId: 'missing-parent', position: 0 }),
    ]
    const { roots, reparentedIds } = buildForest(rows, 'fallback')
    expect(reparentedIds).toEqual(['orphan'])
    expect(roots).toHaveLength(1)
    expect(roots[0].children.map(c => c.id)).toEqual(['orphan'])
  })

  it('breaks a two-node cycle deterministically by cutting the lexicographically largest id', () => {
    const rows = [
      row({ id: 'x', parentId: 'y', position: 0 }),
      row({ id: 'y', parentId: 'x', position: 0 }),
    ]
    const { roots, reparentedIds } = buildForest(rows)
    expect(reparentedIds).toEqual(['y'])
    // y was cut loose -> becomes a root, x becomes y's child.
    expect(roots.map(r => r.id)).toEqual(['y'])
    expect(roots[0].children.map(c => c.id)).toEqual(['x'])
  })

  it('breaks a self-cycle (node is its own parent)', () => {
    const rows = [row({ id: 'self', parentId: 'self', position: 0 })]
    const { roots, reparentedIds } = buildForest(rows)
    expect(reparentedIds).toEqual(['self'])
    expect(roots.map(r => r.id)).toEqual(['self'])
  })

  it('is stable/idempotent when run twice on the same input', () => {
    const rows = [
      row({ id: 'b', parentId: 'a', position: 0 }),
      row({ id: 'a', parentId: 'b', position: 0 }),
    ]
    const first = buildForest(rows)
    const second = buildForest(rows)
    expect(first.reparentedIds).toEqual(second.reparentedIds)
  })
})

describe('flattenForest', () => {
  it('round-trips through buildForest -> flattenForest as parent-first order', () => {
    const rows = [
      row({ id: 'root', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'child', parentId: 'root', position: 0 }),
      row({ id: 'grandchild', parentId: 'child', position: 0 }),
    ]
    const { roots } = buildForest(rows)
    const flat = flattenForest(roots)
    expect(flat.map(r => r.id)).toEqual(['root', 'child', 'grandchild'])
  })
})

describe('diffForests', () => {
  it('produces no ops for two identical forests', () => {
    const rows = [row({ id: 'a', position: 0 })]
    const diff = diffForests(rows, rows)
    expect(isDiffEmpty(diff)).toBe(true)
  })

  it('detects a create', () => {
    const prev: BookmarkNodeRow[] = []
    const next = [row({ id: 'a', position: 0 })]
    const diff = diffForests(prev, next)
    expect(diff.creates).toHaveLength(1)
    expect(diff.creates[0].node.id).toBe('a')
    expect(isDiffEmpty(diff)).toBe(false)
  })

  it('detects a remove', () => {
    const prev = [row({ id: 'a', position: 0 })]
    const next: BookmarkNodeRow[] = []
    const diff = diffForests(prev, next)
    expect(diff.removes).toEqual([{ type: 'remove', id: 'a' }])
  })

  it('detects a field update (title change) without move', () => {
    const prev = [row({ id: 'a', position: 0, title: 'Old' })]
    const next = [row({ id: 'a', position: 0, title: 'New' })]
    const diff = diffForests(prev, next)
    expect(diff.updates).toHaveLength(1)
    expect(diff.moves).toHaveLength(0)
  })

  it('detects a move (parent or position change) instead of an update', () => {
    const prev = [
      row({ id: 'root', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'a', parentId: 'root', position: 0 }),
    ]
    const next = [
      row({ id: 'root', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'a', parentId: 'root', position: 1 }),
    ]
    const diff = diffForests(prev, next)
    expect(diff.moves).toHaveLength(1)
    expect(diff.updates).toHaveLength(0)
  })

  it('orders creates parent-first', () => {
    const prev: BookmarkNodeRow[] = []
    const next = [
      row({ id: 'child', parentId: 'root', position: 0 }),
      row({ id: 'root', kind: 'folder', rootKind: 'toolbar', position: 0 }),
    ]
    const diff = diffForests(prev, next)
    expect(diff.creates.map(c => c.node.id)).toEqual(['root', 'child'])
  })

  it('orders removes child-first', () => {
    const prev = [
      row({ id: 'root', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'child', parentId: 'root', position: 0 }),
    ]
    const next: BookmarkNodeRow[] = []
    const diff = diffForests(prev, next)
    expect(diff.removes.map(r => r.id)).toEqual(['child', 'root'])
  })
})

describe('validateTrimmedText', () => {
  it('accepts a normal name', () => {
    expect(validateTrimmedText('Private', 1, 60)).toBeNull()
  })

  it('rejects empty/whitespace-only text', () => {
    expect(validateTrimmedText('   ', 1, 60)).toBe('tooShort')
  })

  it('rejects text over the max length after trimming', () => {
    expect(validateTrimmedText(`  ${'a'.repeat(61)}  `, 1, 60)).toBe('tooLong')
  })

  it('rejects control characters', () => {
    expect(validateTrimmedText(`Private${String.fromCharCode(7)}`, 1, 60)).toBe('invalidChars')
  })

  it('allows tab/newline/carriage-return', () => {
    expect(validateTrimmedText('Private\tArbeit', 1, 60)).toBeNull()
  })
})
