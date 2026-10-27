import type { Grid } from '~/types/puzzle'

const TOLERANCE = 0.1

/**
 * The grid for a picture and a target piece count: among all column/row pairs whose product is
 * within 10 % of the target, the one whose pieces are closest to square; ties go to the product
 * closest to the target.
 */
export function chooseGrid(width: number, height: number, target: number): Grid {
  const lowest = Math.max(1, Math.ceil(target * (1 - TOLERANCE)))
  const highest = Math.floor(target * (1 + TOLERANCE))
  let best: { columns: number; rows: number; squareness: number; distance: number } | null = null

  for (let columns = 1; columns <= highest; columns++) {
    for (let rows = 1; columns * rows <= highest; rows++) {
      if (columns * rows < lowest) continue
      const aspect = (width / columns) / (height / rows)
      const squareness = Math.abs(Math.log(aspect))
      const distance = Math.abs(columns * rows - target)
      if (!best || squareness < best.squareness - 1e-9
        || (Math.abs(squareness - best.squareness) <= 1e-9 && distance < best.distance)) {
        best = { columns, rows, squareness, distance }
      }
    }
  }

  const { columns, rows } = best ?? { columns: 1, rows: 1 }
  return { columns, rows, pieceWidth: width / columns, pieceHeight: height / rows, width, height }
}
