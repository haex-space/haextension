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
  it('keeps the placed groups at home and every loose group on the table (200 moves × 100 seeds)', () => {
    const violations: string[] = []
    for (let seed = 0; seed < 100; seed++) {
      const random = seededRandom(seed)
      const state = make(seed, 'medium')
      for (let move = 0; move < 200 && state.phase === 'playing'; move++) {
        const loose = state.groups.filter(g => !g.placed)
        const group = loose[Math.floor(random() * loose.length)]!
        if (!grab(state, group.id)) continue
        const piece = state.pieces[group.pieceIds[0]!]!
        const home = homeOf(state, piece)
        // Half of the moves end near home, to exercise the snap; the others anywhere, also far off the table.
        const target = random() < 0.5
          ? { x: home.x + (random() - 0.5) * side(state), y: home.y + (random() - 0.5) * side(state) }
          : { x: (random() - 0.5) * 20_000, y: (random() - 0.5) * 20_000 }
        moveGroup(state, group.id, target.x - piece.x, target.y - piece.y)
        release(state, group.id)

        for (const g of state.groups) {
          for (const id of g.pieceIds) {
            const p = state.pieces[id]!
            const h = homeOf(state, p)
            if (g.placed && (p.x !== h.x || p.y !== h.y)) violations.push(`seed ${seed} move ${move}: placed piece ${id} off home`)
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
      }
    }
    expect(violations.slice(0, 5)).toEqual([])
  })
})
