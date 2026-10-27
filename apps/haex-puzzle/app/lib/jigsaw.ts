import type { Edge, Edges, Grid, PathCommand, Point, Segment } from '~/types/puzzle'
import { seededRandom } from './random'

/** How far a tab may reach beyond its piece's cell box, as a fraction of the shorter piece side. */
export const OVERHANG = 0.28
/** The edge's perpendicular unit, so that the deepest reach of a tab (about 0.615 units) equals `OVERHANG`. */
const DEPTH_UNIT = 0.455
const TAB = 0.2
const TAB_VARIATION = 0.06
const JITTER = 0.08

/** The edges between all neighbouring cells; the same seed gives the same edges. */
export function makeEdges(grid: Grid, seed: number): Edges {
  const random = seededRandom(seed)
  const edge = (): Edge => ({
    direction: random() < 0.5 ? 1 : -1,
    tab: TAB + (random() - 0.5) * TAB_VARIATION,
    a: (random() - 0.5) * JITTER,
    b: (random() - 0.5) * JITTER,
    c: (random() - 0.5) * JITTER,
    d: (random() - 0.5) * JITTER,
    e: (random() - 0.5) * JITTER,
  })
  const horizontal = Array.from({ length: Math.max(0, grid.rows - 1) }, () => Array.from({ length: grid.columns }, edge))
  const vertical = Array.from({ length: grid.rows }, () => Array.from({ length: Math.max(0, grid.columns - 1) }, edge))
  return { horizontal, vertical }
}

/**
 * The canvas-free jigsaw edge from `start` along `along` (unit vector) for `length`, bulging toward
 * `across` (unit vector) times the edge's direction: three cubic Béziers with a neck and a round head.
 */
function edgeSegments(edge: Edge, start: Point, along: Point, across: Point, length: number, unit: number): Segment[] {
  const { tab: t, a, b, c, d, e } = edge
  const point = (u: number, v: number): Point => ({
    x: start.x + along.x * length * u + across.x * unit * v * edge.direction,
    y: start.y + along.y * length * u + across.y * unit * v * edge.direction,
  })
  const p0 = point(0, 0)
  const p1 = point(0.2, a)
  const p2 = point(0.5 + b + d, -t + c)
  const p3 = point(0.5 - t + b, t + c)
  const p4 = point(0.5 - 2 * t + b - d, 3 * t + c)
  const p5 = point(0.5 + 2 * t + b - d, 3 * t + c)
  const p6 = point(0.5 + t + b, t + c)
  const p7 = point(0.5 + b + d, -t + c)
  const p8 = point(0.8, e)
  const p9 = point(1, 0)
  return [
    { from: p0, c1: p1, c2: p2, to: p3 },
    { from: p3, c1: p4, c2: p5, to: p6 },
    { from: p6, c1: p7, c2: p8, to: p9 },
  ]
}

function reversed(segments: Segment[]): Segment[] {
  return segments.map(({ from, c1, c2, to }) => ({ from: to, c1: c2, c2: c1, to: from })).reverse()
}

function straight(from: Point, to: Point): Segment[] {
  return [{ from, to }]
}

export interface PieceSides {
  top: Segment[]
  right: Segment[]
  bottom: Segment[]
  left: Segment[]
}

/**
 * The four sides of a piece in picture coordinates, walked clockwise from the top-left corner.
 * Each shared edge is built once, left to right or top to bottom; the piece on the far side walks
 * it reversed, which is what makes neighbours interlock exactly.
 */
export function pieceSides(grid: Grid, edges: Edges, column: number, row: number): PieceSides {
  const { pieceWidth: w, pieceHeight: h, columns, rows } = grid
  const unit = Math.min(w, h) * DEPTH_UNIT
  const x0 = column * w
  const y0 = row * h
  const x1 = x0 + w
  const y1 = y0 + h
  const right = { x: 1, y: 0 }
  const down = { x: 0, y: 1 }

  const horizontal = (r: number): Segment[] => edgeSegments(edges.horizontal[r]![column]!, { x: x0, y: (r + 1) * h }, right, down, w, unit)
  const vertical = (c: number): Segment[] => edgeSegments(edges.vertical[row]![c]!, { x: (c + 1) * w, y: y0 }, down, right, h, unit)

  return {
    top: row === 0 ? straight({ x: x0, y: y0 }, { x: x1, y: y0 }) : horizontal(row - 1),
    right: column === columns - 1 ? straight({ x: x1, y: y0 }, { x: x1, y: y1 }) : vertical(column),
    bottom: row === rows - 1 ? straight({ x: x1, y: y1 }, { x: x0, y: y1 }) : reversed(horizontal(row)),
    left: column === 0 ? straight({ x: x0, y: y1 }, { x: x0, y: y0 }) : reversed(vertical(column - 1)),
  }
}

/** The piece's outline as plain drawing commands, relative to the top-left of its cell box. */
export function pieceOutline(grid: Grid, edges: Edges, column: number, row: number): PathCommand[] {
  const ox = column * grid.pieceWidth
  const oy = row * grid.pieceHeight
  const sides = pieceSides(grid, edges, column, row)
  const commands: PathCommand[] = [{ type: 'move', x: sides.top[0]!.from.x - ox, y: sides.top[0]!.from.y - oy }]
  for (const segment of [...sides.top, ...sides.right, ...sides.bottom, ...sides.left]) {
    if (segment.c1 && segment.c2) {
      commands.push({
        type: 'curve',
        c1x: segment.c1.x - ox, c1y: segment.c1.y - oy,
        c2x: segment.c2.x - ox, c2y: segment.c2.y - oy,
        x: segment.to.x - ox, y: segment.to.y - oy,
      })
    } else {
      commands.push({ type: 'line', x: segment.to.x - ox, y: segment.to.y - oy })
    }
  }
  return commands
}
