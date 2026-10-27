import { describe, expect, it } from 'vitest'
import { chooseGrid } from './grid'
import { makeEdges, OVERHANG, pieceOutline, pieceSides } from './jigsaw'
import type { Grid, Point, Segment } from '~/types/puzzle'

const grids: Grid[] = [
  chooseGrid(2048, 1536, 12),
  chooseGrid(2048, 1536, 48),
  chooseGrid(5000, 500, 12),
  chooseGrid(500, 5000, 12),
  chooseGrid(1000, 1000, 192),
  { columns: 1, rows: 1, pieceWidth: 300, pieceHeight: 200, width: 300, height: 200 },
]

function sample(segment: Segment, steps = 24): Point[] {
  if (!segment.c1 || !segment.c2) return [segment.from, segment.to]
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const m = 1 - t
    const k0 = m * m * m
    const k1 = 3 * m * m * t
    const k2 = 3 * m * t * t
    const k3 = t * t * t
    points.push({
      x: k0 * segment.from.x + k1 * segment.c1.x + k2 * segment.c2.x + k3 * segment.to.x,
      y: k0 * segment.from.y + k1 * segment.c1.y + k2 * segment.c2.y + k3 * segment.to.y,
    })
  }
  return points
}

function closeTo(a: Point, b: Point) {
  expect(a.x).toBeCloseTo(b.x, 9)
  expect(a.y).toBeCloseTo(b.y, 9)
}

describe('interlocking', () => {
  it('draws every shared edge once: one piece walks what the other walks reversed', () => {
    for (const grid of grids) {
      const edges = makeEdges(grid, 5)
      for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
          const here = pieceSides(grid, edges, column, row)
          if (column < grid.columns - 1) {
            const there = pieceSides(grid, edges, column + 1, row)
            expect(there.left).toHaveLength(here.right.length)
            here.right.forEach((segment, i) => {
              const mirror = there.left[there.left.length - 1 - i]!
              closeTo(segment.from, mirror.to)
              closeTo(segment.to, mirror.from)
              if (segment.c1) closeTo(segment.c1, mirror.c2!)
              if (segment.c2) closeTo(segment.c2, mirror.c1!)
            })
          }
          if (row < grid.rows - 1) {
            const below = pieceSides(grid, edges, column, row + 1)
            here.bottom.forEach((segment, i) => {
              const mirror = below.top[below.top.length - 1 - i]!
              closeTo(segment.from, mirror.to)
              closeTo(segment.to, mirror.from)
            })
          }
        }
      }
    }
  })

  it('keeps the outer sides of the picture straight', () => {
    for (const grid of grids) {
      const edges = makeEdges(grid, 9)
      for (let column = 0; column < grid.columns; column++) {
        const top = pieceSides(grid, edges, column, 0).top
        const bottom = pieceSides(grid, edges, column, grid.rows - 1).bottom
        expect(top).toHaveLength(1)
        expect(top[0]!.c1).toBeUndefined()
        expect(bottom).toHaveLength(1)
        expect(bottom[0]!.c1).toBeUndefined()
      }
      for (let row = 0; row < grid.rows; row++) {
        expect(pieceSides(grid, edges, 0, row).left[0]!.c1).toBeUndefined()
        expect(pieceSides(grid, edges, grid.columns - 1, row).right[0]!.c1).toBeUndefined()
      }
    }
  })

  it('starts and ends every piece outline at its own corners, and closes', () => {
    const grid = grids[0]!
    const outline = pieceOutline(grid, makeEdges(grid, 1), 1, 1)
    expect(outline[0]).toEqual({ type: 'move', x: 0, y: 0 })
    const last = outline[outline.length - 1]!
    expect(last).toMatchObject({ x: 0, y: 0 })
    const corner = pieceOutline(grid, makeEdges(grid, 1), 0, 0)
    expect(corner[corner.length - 1]).toMatchObject({ type: 'line', x: 0, y: 0 })
  })
})

describe('variety', () => {
  it('does not give every edge of a puzzle the same shape', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const edges = makeEdges(grids[1]!, seed)
      const all = [...edges.horizontal.flat(), ...edges.vertical.flat()]
      expect(new Set(all.map(e => e.direction)).size).toBe(2)
      expect(new Set(all.map(e => e.tab.toFixed(4))).size).toBeGreaterThan(1)
    }
  })

  it('is deterministic per seed', () => {
    expect(makeEdges(grids[0]!, 3)).toEqual(makeEdges(grids[0]!, 3))
    expect(makeEdges(grids[0]!, 3)).not.toEqual(makeEdges(grids[0]!, 4))
  })
})

describe('geometry', () => {
  it('never reaches farther beyond a piece’s cell box than OVERHANG × the shorter side', () => {
    for (const grid of grids) {
      const edges = makeEdges(grid, 11)
      const reach = OVERHANG * Math.min(grid.pieceWidth, grid.pieceHeight) + 1e-6
      for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
          const x0 = column * grid.pieceWidth
          const y0 = row * grid.pieceHeight
          const sides = pieceSides(grid, edges, column, row)
          for (const segment of [...sides.top, ...sides.right, ...sides.bottom, ...sides.left]) {
            for (const p of sample(segment)) {
              expect(p.x).toBeGreaterThanOrEqual(x0 - reach)
              expect(p.x).toBeLessThanOrEqual(x0 + grid.pieceWidth + reach)
              expect(p.y).toBeGreaterThanOrEqual(y0 - reach)
              expect(p.y).toBeLessThanOrEqual(y0 + grid.pieceHeight + reach)
            }
          }
        }
      }
    }
  })

  it('tiles the picture: the pieces’ areas add up to the picture area (SC-005)', () => {
    for (const grid of grids) {
      const edges = makeEdges(grid, 21)
      let total = 0
      for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
          const sides = pieceSides(grid, edges, column, row)
          const polygon = [...sides.top, ...sides.right, ...sides.bottom, ...sides.left].flatMap(s => sample(s, 200))
          let twice = 0
          for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i]!
            const q = polygon[(i + 1) % polygon.length]!
            twice += p.x * q.y - q.x * p.y
          }
          total += Math.abs(twice) / 2
        }
      }
      expect(total / (grid.width * grid.height)).toBeCloseTo(1, 4)
    }
  })

  it('covers the picture with cell boxes without gaps or overlaps for 200 random sizes', () => {
    let seed = 1
    const next = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < 200; i++) {
      const width = 100 + Math.round(next() * 3000)
      const height = 100 + Math.round(next() * 3000)
      const grid = chooseGrid(width, height, [12, 48, 108, 192][i % 4]!)
      expect(grid.pieceWidth * grid.columns).toBeCloseTo(width, 6)
      expect(grid.pieceHeight * grid.rows).toBeCloseTo(height, 6)
      expect(grid.columns * grid.pieceWidth * grid.rows * grid.pieceHeight).toBeCloseTo(width * height, 3)
    }
  })
})
