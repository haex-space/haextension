import { describe, expect, it } from 'vitest'
import { availableDifficulties, DIFFICULTIES, difficultyById } from './difficulty'
import { chooseGrid } from './grid'

describe('chooseGrid', () => {
  it('gives 4 × 3 for a 4:3 picture at 12 pieces', () => {
    const grid = chooseGrid(2048, 1536, 12)
    expect([grid.columns, grid.rows]).toEqual([4, 3])
  })

  it('gives 11 × 1 for a 10:1 panorama at 12 pieces (11 is within 10 % and squarer than 12)', () => {
    const grid = chooseGrid(5000, 500, 12)
    expect([grid.columns, grid.rows]).toEqual([11, 1])
  })

  it('divides the picture exactly', () => {
    const grid = chooseGrid(1000, 700, 48)
    expect(grid.pieceWidth * grid.columns).toBeCloseTo(1000)
    expect(grid.pieceHeight * grid.rows).toBeCloseTo(700)
  })

  it('stays within 10 % of the target with usable pieces over aspect ratios 1:10 … 10:1', () => {
    let checked = 0
    for (let i = 0; i <= 220; i++) {
      const aspect = 10 ** (-1 + (2 * i) / 220)
      const height = 2000
      const width = Math.round(height * aspect)
      for (const id of availableDifficulties(width, height)) {
        const target = difficultyById(id).target
        const grid = chooseGrid(width, height, target)
        const count = grid.columns * grid.rows
        expect(Math.abs(count - target)).toBeLessThanOrEqual(target * 0.1 + 1e-9)
        const pieceAspect = grid.pieceWidth / grid.pieceHeight
        // The count bound and squareness pull against each other on extreme shapes: 2:1 over the
        // whole range, 1.5:1 for pictures between 1:4 and 4:1.
        const skew = Math.max(pieceAspect, 1 / pieceAspect)
        expect(skew).toBeLessThanOrEqual(2)
        if (aspect >= 0.25 && aspect <= 4) expect(skew).toBeLessThanOrEqual(1.5 + 1e-9)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(200)
    expect(DIFFICULTIES.length).toBe(4)
  })

  it('prefers the product closest to the target when squareness ties', () => {
    const grid = chooseGrid(1200, 900, 108)
    expect(Math.abs(grid.columns * grid.rows - 108)).toBeLessThanOrEqual(1)
  })
})
