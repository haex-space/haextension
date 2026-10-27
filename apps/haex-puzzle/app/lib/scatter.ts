import type { Grid, Point, Rect } from '~/types/puzzle'
import { shuffle } from './random'

/** How far a piece may sit off its slot's centre, as a fraction of its side; keeps overlaps under 35 %. */
export const SCATTER_JITTER = 0.15

/**
 * The table the pieces are spread over: the picture's frame at (0, 0) grown on every side by half the
 * picture's size, but by at least two piece sides, so a one-row picture still has room above and below.
 */
export function tableRect(grid: Grid): Rect {
  const marginX = Math.max(grid.width / 2, 2 * grid.pieceWidth)
  const marginY = Math.max(grid.height / 2, 2 * grid.pieceHeight)
  return { x: -marginX, y: -marginY, width: grid.width + 2 * marginX, height: grid.height + 2 * marginY }
}

/** Slots: piece-sized cells of the table, inset by the jitter, that stay clear of the frame by the jitter. */
function freeSlots(grid: Grid): Point[] {
  const table = tableRect(grid)
  const { pieceWidth: w, pieceHeight: h } = grid
  const clearX = SCATTER_JITTER * w
  const clearY = SCATTER_JITTER * h
  // Inset by the jitter on every side, so a jittered piece stays inside the table.
  const innerWidth = table.width - 2 * clearX
  const innerHeight = table.height - 2 * clearY
  const columns = Math.floor(innerWidth / w)
  const rows = Math.floor(innerHeight / h)
  const startX = table.x + clearX + (innerWidth - columns * w) / 2
  const startY = table.y + clearY + (innerHeight - rows * h) / 2
  const slots: Point[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x = startX + c * w
      const y = startY + r * h
      const touchesFrame = x < grid.width + clearX && x + w > -clearX && y < grid.height + clearY && y + h > -clearY
      if (!touchesFrame) slots.push({ x, y })
    }
  }
  return slots
}

/**
 * Where every piece starts, by piece id: a random distinct slot of the table, off its centre by at most
 * `SCATTER_JITTER` of the piece's side. The slots are cells, so no piece is ever hidden behind another,
 * and none starts on the frame, so none starts at home.
 */
export function scatter(grid: Grid, random: () => number): Point[] {
  const count = grid.columns * grid.rows
  const slots = freeSlots(grid)
  if (slots.length < count) throw new Error(`The table has ${slots.length} free slots for ${count} pieces`)
  const chosen = shuffle(slots, random).slice(0, count)
  return chosen.map(slot => ({
    x: slot.x + (random() * 2 - 1) * SCATTER_JITTER * grid.pieceWidth,
    y: slot.y + (random() * 2 - 1) * SCATTER_JITTER * grid.pieceHeight,
  }))
}
