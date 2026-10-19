import { describe, expect, it } from 'vitest'
import { HIGH_SCORE_KEY, loadHighScore, saveHighScore } from './highScore'

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
  }
}

function unavailable(): never {
  throw new DOMException('The operation is insecure.', 'SecurityError')
}

describe('loadHighScore', () => {
  it('reads a stored score', () => {
    expect(loadHighScore(() => memoryStorage({ [HIGH_SCORE_KEY]: '4200' }))).toBe(4200)
  })

  it('starts at 0 without a stored score', () => {
    expect(loadHighScore(() => memoryStorage())).toBe(0)
  })

  it.each(['abc', '-5', '12.5', '1e400', ''])('rejects the invalid value %j', (raw) => {
    expect(loadHighScore(() => memoryStorage({ [HIGH_SCORE_KEY]: raw }))).toBe(0)
  })

  it('starts at 0 when storage is unavailable', () => {
    expect(loadHighScore(unavailable)).toBe(0)
  })
})

describe('saveHighScore', () => {
  it('stores the score for the next load', () => {
    const storage = memoryStorage()
    saveHighScore(() => storage, 900)
    expect(loadHighScore(() => storage)).toBe(900)
  })

  it('does not throw when storage is unavailable', () => {
    expect(() => saveHighScore(unavailable, 900)).not.toThrow()
  })
})
