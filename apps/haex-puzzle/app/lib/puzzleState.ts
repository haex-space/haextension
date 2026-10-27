import type { DifficultyId, Group, Piece, Point, PuzzleState } from '~/types/puzzle'
import { difficultyById } from './difficulty'
import { chooseGrid } from './grid'
import { makeEdges } from './jigsaw'
import { scatter, tableRect } from './scatter'

/** A piece released this close to its place, as a fraction of the shorter piece side, snaps into it. */
export const SNAP_FRACTION = 0.25

/*
 * The puzzle's rules, without drawing or input. The functions change the state they are given in
 * place (it is one object with up to 192 pieces, changed on every release), and return what the
 * caller needs to know.
 */

function layOut(state: PuzzleState, random: () => number): void {
  const { grid } = state
  state.pieces = scatter(grid, random).map((position, id): Piece => ({
    id,
    column: id % grid.columns,
    row: Math.floor(id / grid.columns),
    x: position.x,
    y: position.y,
    group: id,
  }))
  state.groups = state.pieces.map((piece): Group => ({ id: piece.id, pieceIds: [piece.id], placed: false, z: piece.id }))
  state.phase = 'playing'
}

/** A new puzzle: the grid and edges for the picture, every piece scattered over the table and alone. */
export function start(pictureId: string, width: number, height: number, difficulty: DifficultyId, random: () => number): PuzzleState {
  const grid = chooseGrid(width, height, difficultyById(difficulty).target)
  const state: PuzzleState = {
    pictureId,
    difficulty,
    grid,
    edges: makeEdges(grid, Math.floor(random() * 0x7fffffff)),
    pieces: [],
    groups: [],
    table: tableRect(grid),
    phase: 'playing',
  }
  layOut(state, random)
  return state
}

/** The same picture, grid and edges, with the pieces scattered anew. */
export function restartSame(state: PuzzleState, random: () => number): void {
  layOut(state, random)
}

export function homeOf(state: PuzzleState, piece: Piece): Point {
  return { x: piece.column * state.grid.pieceWidth, y: piece.row * state.grid.pieceHeight }
}

function groupOf(state: PuzzleState, groupId: number): Group | undefined {
  return state.groups.find(group => group.id === groupId)
}

export function isComplete(state: PuzzleState): boolean {
  return state.groups.every(group => group.placed)
}

/** Picks a loose group up: it moves above all others. False for a placed group or a finished puzzle. */
export function grab(state: PuzzleState, groupId: number): boolean {
  const group = groupOf(state, groupId)
  if (!group || group.placed || state.phase === 'complete') return false
  group.z = Math.max(...state.groups.map(g => g.z)) + 1
  return true
}

function shift(state: PuzzleState, group: Group, dx: number, dy: number): void {
  for (const id of group.pieceIds) {
    const piece = state.pieces[id]!
    piece.x += dx
    piece.y += dy
  }
}

/** Moves a loose group by a distance, without any rule applied (used while it is being dragged). */
export function moveGroup(state: PuzzleState, groupId: number, dx: number, dy: number): void {
  const group = groupOf(state, groupId)
  if (!group || group.placed || state.phase === 'complete') return
  shift(state, group, dx, dy)
}

/** If no piece of the group is at least partly on the table, moves the group back until one is. */
function keepOnTable(state: PuzzleState, group: Group): void {
  const { table, grid } = state
  const reach = Math.min(grid.pieceWidth, grid.pieceHeight) / 4
  let best: Point | null = null
  for (const id of group.pieceIds) {
    const piece = state.pieces[id]!
    const left = table.x - (piece.x + grid.pieceWidth)
    const right = piece.x - (table.x + table.width)
    const above = table.y - (piece.y + grid.pieceHeight)
    const below = piece.y - (table.y + table.height)
    // How far the piece has to move to overlap the table by `reach`; 0 when it already does.
    const dx = left >= 0 ? left + reach : right >= 0 ? -(right + reach) : 0
    const dy = above >= 0 ? above + reach : below >= 0 ? -(below + reach) : 0
    if (dx === 0 && dy === 0) return
    if (!best || Math.hypot(dx, dy) < Math.hypot(best.x, best.y)) best = { x: dx, y: dy }
  }
  if (best) shift(state, group, best.x, best.y)
}

/** Puts a group exactly on its place and fixes it there. */
function place(state: PuzzleState, group: Group): void {
  for (const id of group.pieceIds) {
    const piece = state.pieces[id]!
    const home = homeOf(state, piece)
    piece.x = home.x
    piece.y = home.y
  }
  group.placed = true
}

/** The group's piece that is closest to its place, within the snapping distance, with the distance to move. */
function snapOffset(state: PuzzleState, group: Group): Point | null {
  const limit = SNAP_FRACTION * Math.min(state.grid.pieceWidth, state.grid.pieceHeight)
  let best: Point | null = null
  for (const id of group.pieceIds) {
    const piece = state.pieces[id]!
    const home = homeOf(state, piece)
    const offset = { x: home.x - piece.x, y: home.y - piece.y }
    if (Math.hypot(offset.x, offset.y) > limit) continue
    if (!best || Math.hypot(offset.x, offset.y) < Math.hypot(best.x, best.y)) best = offset
  }
  return best
}

/** The grid neighbours of a piece: left, right, above, below. */
function neighboursOf(state: PuzzleState, piece: Piece): Piece[] {
  const { columns, rows } = state.grid
  const found: Piece[] = []
  if (piece.column > 0) found.push(state.pieces[piece.id - 1]!)
  if (piece.column < columns - 1) found.push(state.pieces[piece.id + 1]!)
  if (piece.row > 0) found.push(state.pieces[piece.id - columns]!)
  if (piece.row < rows - 1) found.push(state.pieces[piece.id + columns]!)
  return found
}

/**
 * Joins the group to the first other group that has a grid neighbour of one of its pieces lying where it
 * belongs next to that piece (within the snapping distance). The joined group is rigid: the released group
 * is shifted by the small error, so the join is exact. Once it has joined one group (`aligned`), the group
 * it joins next is shifted instead, so the first join stays exact. Returns the group after the join, or null.
 */
function joinNeighbour(state: PuzzleState, group: Group, aligned: boolean): Group | null {
  const limit = SNAP_FRACTION * Math.min(state.grid.pieceWidth, state.grid.pieceHeight)
  for (const id of group.pieceIds) {
    const piece = state.pieces[id]!
    for (const neighbour of neighboursOf(state, piece)) {
      if (neighbour.group === group.id) continue
      const other = groupOf(state, neighbour.group)!
      const homePiece = homeOf(state, piece)
      const homeNeighbour = homeOf(state, neighbour)
      // Where the neighbour is, compared to where it should be relative to this piece.
      const errorX = neighbour.x - piece.x - (homeNeighbour.x - homePiece.x)
      const errorY = neighbour.y - piece.y - (homeNeighbour.y - homePiece.y)
      if (Math.hypot(errorX, errorY) > limit) continue

      // A placed group never moves, and neither does a group that is already aligned to another.
      if (aligned && !other.placed) shift(state, other, -errorX, -errorY)
      else shift(state, group, errorX, errorY)
      return mergeGroups(state, group, other)
    }
  }
  return null
}

/** Moves every piece of `other` into `group`; the merged group lies on top and is placed if either was. */
function mergeGroups(state: PuzzleState, group: Group, other: Group): Group {
  for (const id of other.pieceIds) {
    state.pieces[id]!.group = group.id
    group.pieceIds.push(id)
  }
  group.placed = group.placed || other.placed
  group.z = Math.max(group.z, other.z)
  state.groups.splice(state.groups.indexOf(other), 1)
  return group
}

/**
 * Puts a dragged group down: applies a last move, keeps it on the table, fixes it to the frame when it
 * lies within the snapping distance of its place, and otherwise joins it to the neighbours it fits next
 * to. Completes the puzzle when every group is placed.
 */
export function release(state: PuzzleState, groupId: number, dx = 0, dy = 0): void {
  const group = groupOf(state, groupId)
  if (!group || group.placed || state.phase === 'complete') return
  shift(state, group, dx, dy)
  keepOnTable(state, group)

  let aligned = false
  while (!group.placed) {
    if (snapOffset(state, group)) {
      place(state, group)
    } else if (joinNeighbour(state, group, aligned)) {
      aligned = true
    } else {
      break
    }
  }
  // Pieces joined to a placed group lie at home too; make sure of it exactly.
  if (group.placed) place(state, group)
  if (isComplete(state)) state.phase = 'complete'
}

/**
 * The topmost loose piece at a point of the table, or null. `contains` tells whether a point, given
 * relative to the piece's cell box, lies inside its outline (the renderer supplies the real outline).
 */
export function pieceAt(state: PuzzleState, point: Point, contains: (piece: Piece, local: Point) => boolean): Piece | null {
  const loose = state.groups.filter(group => !group.placed).sort((a, b) => b.z - a.z)
  for (const group of loose) {
    for (const id of group.pieceIds) {
      const piece = state.pieces[id]!
      if (contains(piece, { x: point.x - piece.x, y: point.y - piece.y })) return piece
    }
  }
  return null
}
