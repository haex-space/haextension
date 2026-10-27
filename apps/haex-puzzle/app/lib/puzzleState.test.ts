import { describe, expect, it } from 'vitest'
import { seededRandom } from './random'
import { grab, homeOf, isComplete, moveGroup, pieceAt, release, restartSame, SNAP_FRACTION, start } from './puzzleState'
import type { Piece, PuzzleState } from '~/types/puzzle'

function make(seed = 1, difficulty: 'easy' | 'medium' = 'easy') {
  return start('picture', 1200, 900, difficulty, seededRandom(seed))
}

const side = (state: PuzzleState) => Math.min(state.grid.pieceWidth, state.grid.pieceHeight)
/** Moves the piece's group so that the piece lies at `home + offset`. */
function putNear(state: PuzzleState, piece: Piece, offsetX: number, offsetY = 0) {
  const home = homeOf(state, piece)
  moveGroup(state, piece.group, home.x + offsetX - piece.x, home.y + offsetY - piece.y)
}
function pieceAtPosition(state: PuzzleState, column: number, row: number) {
  return state.pieces.find(p => p.column === column && p.row === row)!
}

describe('start', () => {
  it('makes every piece its own loose group, none at home, phase playing', () => {
    const state = make()
    expect(state.pieces).toHaveLength(state.grid.columns * state.grid.rows)
    expect(state.groups.every(g => !g.placed && g.pieceIds.length === 1)).toBe(true)
    expect(state.phase).toBe('playing')
    for (const piece of state.pieces) {
      const home = homeOf(state, piece)
      expect(piece.x !== home.x || piece.y !== home.y).toBe(true)
    }
  })
})

describe('release: snapping to the frame', () => {
  for (const [name, column, row] of [['an interior piece', 1, 1], ['an edge piece', 2, 0], ['a corner piece', 0, 0]] as const) {
    it(`snaps ${name} within the distance and not beyond it`, () => {
      const state = make()
      const limit = SNAP_FRACTION * side(state)
      const piece = pieceAtPosition(state, column, row)

      putNear(state, piece, limit - 0.01, 0)
      release(state, piece.group)
      expect(state.groups[piece.group]!.placed).toBe(true)
      expect(piece.x).toBe(homeOf(state, piece).x)
      expect(piece.y).toBe(homeOf(state, piece).y)

      const other = make()
      const loose = pieceAtPosition(other, column, row)
      putNear(other, loose, limit + 0.01, 0)
      release(other, loose.group)
      expect(other.groups[loose.group]!.placed).toBe(false)
      expect(loose.x).toBeCloseTo(homeOf(other, loose).x + limit + 0.01)
    })
  }

  it('measures the snapping distance as a straight line, not per axis', () => {
    const state = make()
    const limit = SNAP_FRACTION * side(state)
    const piece = pieceAtPosition(state, 1, 1)
    putNear(state, piece, limit * 0.8, limit * 0.8)
    release(state, piece.group)
    expect(state.groups[piece.group]!.placed).toBe(false)
  })

  it('ignores grab, move and release of a placed group', () => {
    const state = make()
    const piece = pieceAtPosition(state, 1, 1)
    putNear(state, piece, 0)
    release(state, piece.group)
    expect(grab(state, piece.group)).toBe(false)
    moveGroup(state, piece.group, 500, 500)
    expect(piece.x).toBe(homeOf(state, piece).x)
  })
})

describe('release: staying on the table', () => {
  it('moves a group back so that one of its pieces is at least partly on the table', () => {
    const state = make()
    const piece = state.pieces[0]!
    moveGroup(state, piece.group, 100_000, -100_000)
    release(state, piece.group)
    const { table, grid } = state
    expect(piece.x).toBeLessThan(table.x + table.width)
    expect(piece.x + grid.pieceWidth).toBeGreaterThan(table.x)
    expect(piece.y).toBeLessThan(table.y + table.height)
    expect(piece.y + grid.pieceHeight).toBeGreaterThan(table.y)
  })

  it('leaves a piece that is already partly on the table where it is', () => {
    const state = make()
    const piece = state.pieces[0]!
    const { x, y } = piece
    release(state, piece.group)
    expect([piece.x, piece.y]).toEqual([x, y])
  })
})

describe('pieceAt', () => {
  const everywhere = () => true

  it('returns the topmost loose piece, and the one beneath once the top one is moved away', () => {
    const state = make()
    const [top, below] = [state.pieces[0]!, state.pieces[1]!]
    moveGroup(state, below.group, top.x - below.x, top.y - below.y)
    const point = { x: top.x + 5, y: top.y + 5 }
    const inBox = (piece: Piece, local: { x: number; y: number }) => local.x >= 0 && local.y >= 0 && local.x <= state.grid.pieceWidth && local.y <= state.grid.pieceHeight && piece.id >= 0

    grab(state, below.group)
    expect(pieceAt(state, point, inBox)?.id).toBe(below.id)

    moveGroup(state, below.group, 5000, 0)
    expect(pieceAt(state, point, inBox)?.id).toBe(top.id)
  })

  it('never returns a placed piece', () => {
    const state = make()
    const piece = pieceAtPosition(state, 1, 1)
    putNear(state, piece, 0)
    release(state, piece.group)
    const home = homeOf(state, piece)
    expect(pieceAt(state, { x: home.x + 1, y: home.y + 1 }, everywhere)?.id).not.toBe(piece.id)
  })

  it('returns null when nothing contains the point', () => {
    expect(pieceAt(make(), { x: 0, y: 0 }, () => false)).toBeNull()
  })
})

describe('release: joining neighbours', () => {
  const tolerance = (state: PuzzleState) => SNAP_FRACTION * side(state)
  /** Moves the piece's group so that the piece sits `offset` away from where it should lie next to `anchor`. */
  function putNextTo(state: PuzzleState, piece: Piece, anchor: Piece, errorX: number, errorY = 0) {
    const homePiece = homeOf(state, piece)
    const homeAnchor = homeOf(state, anchor)
    const wantX = anchor.x + (homePiece.x - homeAnchor.x) + errorX
    const wantY = anchor.y + (homePiece.y - homeAnchor.y) + errorY
    moveGroup(state, piece.group, wantX - piece.x, wantY - piece.y)
  }
  function offsetsConsistent(state: PuzzleState) {
    for (const group of state.groups) {
      const first = state.pieces[group.pieceIds[0]!]!
      const h0 = homeOf(state, first)
      for (const id of group.pieceIds) {
        const p = state.pieces[id]!
        const h = homeOf(state, p)
        if (Math.abs(p.x - first.x - (h.x - h0.x)) > 1e-6 || Math.abs(p.y - first.y - (h.y - h0.y)) > 1e-6) return false
      }
    }
    return true
  }

  it('joins two neighbours released within the tolerance, exactly, and moves them together afterwards', () => {
    const state = make()
    const a = pieceAtPosition(state, 1, 1)
    const b = pieceAtPosition(state, 2, 1)
    moveGroup(state, a.group, 300 - a.x, 700 - a.y)
    putNextTo(state, b, a, tolerance(state) - 0.5, 0)
    release(state, b.group)
    expect(a.group).toBe(b.group)
    expect(state.groups.filter(g => g.pieceIds.length === 2)).toHaveLength(1)
    expect(offsetsConsistent(state)).toBe(true)
    expect(b.x - a.x).toBeCloseTo(state.grid.pieceWidth, 6)

    moveGroup(state, a.group, 40, 25)
    expect(b.x - a.x).toBeCloseTo(state.grid.pieceWidth, 6)
    expect(b.y - a.y).toBeCloseTo(0, 6)
  })

  it('does not join neighbours released beyond the tolerance', () => {
    const state = make()
    const a = pieceAtPosition(state, 1, 1)
    const b = pieceAtPosition(state, 2, 1)
    moveGroup(state, a.group, 300 - a.x, 700 - a.y)
    putNextTo(state, b, a, tolerance(state) + 1, 0)
    release(state, b.group)
    expect(a.group).not.toBe(b.group)
  })

  it('never joins pieces that are not neighbours, even where they would fit', () => {
    const state = make()
    const a = pieceAtPosition(state, 0, 0)
    const c = pieceAtPosition(state, 2, 0)
    moveGroup(state, a.group, 300 - a.x, 700 - a.y)
    putNextTo(state, c, a, 0, 0)
    release(state, c.group)
    expect(a.group).not.toBe(c.group)
  })

  it('snaps a joined group to the frame as a whole and places it', () => {
    const state = make()
    const a = pieceAtPosition(state, 1, 1)
    const b = pieceAtPosition(state, 2, 1)
    moveGroup(state, a.group, 300 - a.x, 700 - a.y)
    putNextTo(state, b, a, 1, 0)
    release(state, b.group)
    putNear(state, a, tolerance(state) / 2, 0)
    release(state, a.group)
    const group = state.groups.find(g => g.id === a.group)!
    expect(group.placed).toBe(true)
    expect(a.x).toBe(homeOf(state, a).x)
    expect(b.x).toBe(homeOf(state, b).x)
    expect(b.y).toBe(homeOf(state, b).y)
  })

  it('merges every group a released piece fits between, and keeps the join exact', () => {
    const state = make()
    const left = pieceAtPosition(state, 0, 1)
    const middle = pieceAtPosition(state, 1, 1)
    const right = pieceAtPosition(state, 2, 1)
    moveGroup(state, left.group, 400 - left.x, 700 - left.y)
    putNextTo(state, right, left, 3, 2)
    // `right` is two pieces from `left`; the piece between them joins both.
    const farOff = right.x
    expect(farOff).toBeGreaterThan(0)
    release(state, left.group)
    putNextTo(state, middle, left, 4, -3)
    release(state, middle.group)
    expect(new Set([left.group, middle.group, right.group]).size).toBe(1)
    expect(offsetsConsistent(state)).toBe(true)
  })

  it('places a piece that joins a placed neighbour', () => {
    const state = make()
    const a = pieceAtPosition(state, 1, 1)
    const b = pieceAtPosition(state, 2, 1)
    putNear(state, a, 0)
    release(state, a.group)
    putNextTo(state, b, a, tolerance(state) - 0.5, 0)
    release(state, b.group)
    expect(state.groups.every(g => g.pieceIds.includes(b.id) ? g.placed : true)).toBe(true)
    expect(b.x).toBe(homeOf(state, b).x)
  })

  it('completes once when joins place the last groups', () => {
    const state = make()
    const row = state.pieces.filter(p => p.row === 0)
    for (const p of row) {
      putNear(state, p, 0.2)
      release(state, p.group)
    }
    for (const p of state.pieces.filter(q => q.row > 0)) {
      expect(state.phase).toBe('playing')
      putNear(state, p, 0.2)
      release(state, p.group)
    }
    expect(state.phase).toBe('complete')
    expect(isComplete(state)).toBe(true)
  })
})

describe('completion', () => {
  it('completes exactly when the last piece is placed, once, and then accepts no change', () => {
    const state = make()
    const order = [...state.pieces]
    order.forEach((piece, i) => {
      expect(state.phase).toBe('playing')
      expect(isComplete(state)).toBe(false)
      putNear(state, piece, 0.5)
      release(state, piece.group)
      expect(state.phase).toBe(i === order.length - 1 ? 'complete' : 'playing')
    })
    expect(isComplete(state)).toBe(true)
    const snapshot = JSON.stringify(state.pieces)
    expect(grab(state, 0)).toBe(false)
    moveGroup(state, 0, 100, 100)
    release(state, 0, 100, 100)
    expect(JSON.stringify(state.pieces)).toBe(snapshot)
    expect(state.phase).toBe('complete')
  })
})

describe('restartSame', () => {
  it('keeps picture and grid and scatters anew', () => {
    const state = make(1)
    const { grid, edges, pictureId } = state
    const before = JSON.stringify(state.pieces)
    putNear(state, state.pieces[0]!, 0)
    release(state, 0)
    restartSame(state, seededRandom(99))
    expect(state.grid).toBe(grid)
    expect(state.edges).toBe(edges)
    expect(state.pictureId).toBe(pictureId)
    expect(state.phase).toBe('playing')
    expect(state.groups.every(g => !g.placed)).toBe(true)
    expect(JSON.stringify(state.pieces)).not.toBe(before)
  })
})

describe('invariants under random play', () => {
  function connected(state: PuzzleState, ids: number[]) {
    const inGroup = new Set(ids)
    const seen = new Set([ids[0]!])
    const queue = [ids[0]!]
    while (queue.length) {
      const id = queue.pop()!
      const p = state.pieces[id]!
      for (const n of [id - 1, id + 1, id - state.grid.columns, id + state.grid.columns]) {
        const q = state.pieces[n]
        const adjacent = q && Math.abs(q.column - p.column) + Math.abs(q.row - p.row) === 1
        if (adjacent && inGroup.has(n) && !seen.has(n)) {
          seen.add(n)
          queue.push(n)
        }
      }
    }
    return seen.size === ids.length
  }

  it('keeps groups rigid and connected, placed groups at home and loose groups on the table (200 moves × 100 seeds)', () => {
    const violations: string[] = []
    let largestGroup = 0
    let placedGroups = 0
    for (let seed = 0; seed < 100; seed++) {
      const random = seededRandom(seed)
      const state = make(seed, 'medium')
      for (let move = 0; move < 200 && state.phase === 'playing'; move++) {
        const loose = state.groups.filter(g => !g.placed)
        const group = loose[Math.floor(random() * loose.length)]!
        if (!grab(state, group.id)) continue
        const piece = state.pieces[group.pieceIds[0]!]!
        const home = homeOf(state, piece)
        const roll = random()
        let target: { x: number; y: number }
        if (roll < 0.3) {
          target = { x: home.x + (random() - 0.5) * side(state), y: home.y + (random() - 0.5) * side(state) }
        } else if (roll < 0.7) {
          // Next to a neighbour of some piece in the group, with a small error.
          const neighbours = [piece.id - 1, piece.id + 1, piece.id - state.grid.columns, piece.id + state.grid.columns]
            .map(i => state.pieces[i]).filter((q): q is Piece => !!q && q.group !== group.id
              && Math.abs(q.column - piece.column) + Math.abs(q.row - piece.row) === 1)
          const q = neighbours[Math.floor(random() * neighbours.length)]
          const hq = q ? homeOf(state, q) : home
          target = q
            ? { x: q.x - (hq.x - home.x) + (random() - 0.5) * side(state) * 0.4, y: q.y - (hq.y - home.y) + (random() - 0.5) * side(state) * 0.4 }
            : { x: random() * 4000 - 2000, y: random() * 4000 - 2000 }
        } else {
          target = { x: (random() - 0.5) * 20_000, y: (random() - 0.5) * 20_000 }
        }
        moveGroup(state, group.id, target.x - piece.x, target.y - piece.y)
        release(state, group.id)

        const owners = new Map<number, number>()
        for (const g of state.groups) {
          largestGroup = Math.max(largestGroup, g.pieceIds.length)
          if (g.placed) placedGroups++
          for (const id of g.pieceIds) {
            owners.set(id, (owners.get(id) ?? 0) + 1)
            if (state.pieces[id]!.group !== g.id) violations.push(`seed ${seed} move ${move}: piece ${id} names group ${state.pieces[id]!.group}, lies in ${g.id}`)
            const p = state.pieces[id]!
            const h = homeOf(state, p)
            if (g.placed && (p.x !== h.x || p.y !== h.y)) violations.push(`seed ${seed} move ${move}: placed piece ${id} off home`)
          }
          if (!connected(state, g.pieceIds)) violations.push(`seed ${seed} move ${move}: group ${g.id} not connected`)
          const first = state.pieces[g.pieceIds[0]!]!
          const h0 = homeOf(state, first)
          for (const id of g.pieceIds) {
            const p = state.pieces[id]!
            const h = homeOf(state, p)
            if (Math.abs(p.x - first.x - (h.x - h0.x)) > 1e-6 || Math.abs(p.y - first.y - (h.y - h0.y)) > 1e-6) violations.push(`seed ${seed} move ${move}: group ${g.id} not rigid`)
          }
          if (!g.placed) {
            const onTable = g.pieceIds.some((id) => {
              const p = state.pieces[id]!
              return p.x < state.table.x + state.table.width && p.x + state.grid.pieceWidth > state.table.x
                && p.y < state.table.y + state.table.height && p.y + state.grid.pieceHeight > state.table.y
            })
            if (!onTable) violations.push(`seed ${seed} move ${move}: group ${g.id} off the table`)
          }
        }
        if (owners.size !== state.pieces.length || [...owners.values()].some(n => n !== 1)) violations.push(`seed ${seed} move ${move}: a piece is not in exactly one group`)
        if ((state.phase === 'complete') !== state.groups.every(g => g.placed)) violations.push(`seed ${seed} move ${move}: phase disagrees with placed groups`)
      }
    }
    // The moves must actually reach joins and snaps, or the invariants above prove nothing.
    expect(largestGroup).toBeGreaterThan(3)
    expect(placedGroups).toBeGreaterThan(100)
    expect(violations.slice(0, 5)).toEqual([])
  })
})
