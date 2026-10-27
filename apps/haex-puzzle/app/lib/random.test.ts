import { describe, expect, it } from 'vitest'
import { platformRandom, seededRandom, shuffle } from './random'

describe('seededRandom', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    const c = seededRandom(43)
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect([c(), c(), c()]).not.toEqual(first)
  })

  it('stays in [0, 1)', () => {
    const random = seededRandom(7)
    for (let i = 0; i < 10_000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('platformRandom', () => {
  it('returns values in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const value = platformRandom()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  it('returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5]
    const output = shuffle(input, seededRandom(1))
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect([...output].sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('reaches all 720 permutations of six items over 5000 seeded shuffles', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 5000; seed++) seen.add(shuffle([1, 2, 3, 4, 5, 6], seededRandom(seed)).join(''))
    expect(seen.size).toBe(720)
  })
})
