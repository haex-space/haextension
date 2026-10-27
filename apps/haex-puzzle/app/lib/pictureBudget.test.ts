import { describe, expect, it } from 'vitest'
import { fitLongSide, MAX_ATTEMPTS, MAX_BYTES, MAX_LONG_SIDE, nextAttempt, QUALITY_LADDER } from './pictureBudget'

describe('limits', () => {
  it('uses 2048 px and exactly 1 MiB', () => {
    expect(MAX_LONG_SIDE).toBe(2048)
    expect(MAX_BYTES).toBe(1_048_576)
  })
})

describe('fitLongSide', () => {
  it('never enlarges', () => {
    expect(fitLongSide(800, 600, 2048)).toEqual({ width: 800, height: 600 })
  })

  it('shrinks the longer side to the maximum and keeps the aspect ratio', () => {
    expect(fitLongSide(4096, 3072, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(fitLongSide(3000, 6000, 2048)).toEqual({ width: 1024, height: 2048 })
  })

  it('keeps at least one pixel per side', () => {
    expect(fitLongSide(100_000, 1, 2048).height).toBe(1)
  })
})

describe('nextAttempt', () => {
  it('walks the quality ladder at the fitted size first', () => {
    const first = [0, 1, 2, 3].map(n => nextAttempt(4000, 3000, n)!)
    expect(first.map(a => a.quality)).toEqual([...QUALITY_LADDER])
    expect(first.every(a => a.width === 2048 && a.height === 1536)).toBe(true)
  })

  it('then reduces the long side by a quarter and walks the ladder again', () => {
    const second = nextAttempt(4000, 3000, 4)!
    expect(second).toEqual({ width: 1536, height: 1152, quality: QUALITY_LADDER[0] })
    const third = nextAttempt(4000, 3000, 8)!
    expect(third.width).toBe(1152)
  })

  it('gives up after a bounded number of attempts, for any start size', () => {
    for (const [w, h] of [[100_000, 100_000], [1, 1], [2048, 2048], [100_000, 1]] as const) {
      let count = 0
      while (nextAttempt(w, h, count)) count++
      expect(count).toBe(MAX_ATTEMPTS)
    }
  })
})
