import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from './difficulty'
import { chooseGrid } from './grid'
import { seededRandom } from './random'
import { scatter, tableRect } from './scatter'
import type { Grid, Point } from '~/types/puzzle'

const shapes: [number, number][] = [[2048, 1536], [1000, 1000], [3000, 1000], [1000, 3000], [5000, 500], [500, 5000]]

function boxesOverlap(a: Point, b: Point, grid: Grid) {
  const w = Math.min(a.x + grid.pieceWidth, b.x + grid.pieceWidth) - Math.max(a.x, b.x)
  const h = Math.min(a.y + grid.pieceHeight, b.y + grid.pieceHeight) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? (w * h) / (grid.pieceWidth * grid.pieceHeight) : 0
}

describe('tableRect', () => {
  it('grows the frame by half the picture’s size on every side where that is enough', () => {
    const grid = chooseGrid(2048, 1536, 48)
    expect(tableRect(grid)).toEqual({ x: -1024, y: -768, width: 4096, height: 3072 })
  })

  it('leaves at least two piece sides on every side, for one-row pictures', () => {
    const grid = chooseGrid(5000, 500, 12)
    const table = tableRect(grid)
    expect(-table.y).toBeGreaterThanOrEqual(2 * grid.pieceHeight)
  })
})

describe('scatter', () => {
  it('keeps every piece off the frame, inside the table, and uncovered, for 1000 seeds', () => {
    // Violations are collected and checked once: a million `expect` calls would be slow for no gain.
    const violations: string[] = []
    let runs = 0
    for (const [width, height] of shapes) {
      for (const level of DIFFICULTIES) {
        if (Math.sqrt((width * height) / level.target) < level.minPieceSide) continue
        const grid = chooseGrid(width, height, level.target)
        const table = tableRect(grid)
        for (let seed = 0; seed < (level.target > 50 ? 200 : 1000); seed++) {
          runs++
          const label = `${width}x${height} @${level.target} seed ${seed}`
          const positions = scatter(grid, seededRandom(seed))
          if (positions.length !== grid.columns * grid.rows) violations.push(`${label}: count`)
          const byX = [...positions].sort((a, b) => a.x - b.x)
          byX.forEach((p, i) => {
            // Sweep by x: only boxes that overlap in x can overlap at all.
            for (let j = i + 1; j < byX.length && byX[j]!.x < p.x + grid.pieceWidth; j++) {
              if (boxesOverlap(p, byX[j]!, grid) > 0.35) violations.push(`${label}: covered`)
            }
          })
          for (const p of positions) {
            const inside = p.x >= table.x - 1e-6 && p.y >= table.y - 1e-6
              && p.x + grid.pieceWidth <= table.x + table.width + 1e-6
              && p.y + grid.pieceHeight <= table.y + table.height + 1e-6
            if (!inside) violations.push(`${label}: outside the table`)
            const onFrame = p.x < grid.width && p.x + grid.pieceWidth > 0 && p.y < grid.height && p.y + grid.pieceHeight > 0
            if (onFrame) violations.push(`${label}: on the frame`)
          }
        }
      }
    }
    expect(runs).toBeGreaterThan(3000)
    expect(violations.slice(0, 5)).toEqual([])
  })

  it('differs from seed to seed', () => {
    const grid = chooseGrid(2048, 1536, 12)
    expect(scatter(grid, seededRandom(1))).not.toEqual(scatter(grid, seededRandom(2)))
  })
})
