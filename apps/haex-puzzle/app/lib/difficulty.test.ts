import { describe, expect, it } from 'vitest'
import { availableDifficulties, DIFFICULTIES, isTooSmall } from './difficulty'

describe('difficulty', () => {
  it('lists the four levels with their target counts', () => {
    expect(DIFFICULTIES.map(d => [d.id, d.target])).toEqual([
      ['easy', 12], ['medium', 48], ['hard', 108], ['expert', 192],
    ])
  })

  it('offers only Easy for a 100 × 100 picture', () => {
    expect(availableDifficulties(100, 100)).toEqual(['easy'])
  })

  it('offers all four levels for 2048 × 1536', () => {
    expect(availableDifficulties(2048, 1536)).toEqual(['easy', 'medium', 'hard', 'expert'])
  })

  it('is too small at 83 × 83 and not at 84 × 84', () => {
    expect(isTooSmall(83, 83)).toBe(true)
    expect(isTooSmall(84, 84)).toBe(false)
  })

  it('offers an easier level whenever it offers a harder one', () => {
    const order = DIFFICULTIES.map(d => d.id)
    for (let side = 40; side < 3000; side += 37) {
      const offered = availableDifficulties(side, Math.round(side * 0.7))
      const indices = offered.map(id => order.indexOf(id))
      expect(indices).toEqual(indices.map((_, i) => i))
    }
  })
})
