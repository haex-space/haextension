export const HIGH_SCORE_KEY = 'haex-tetris:high-score'

// Storage access itself can throw (blocked or sandboxed frame); the high score then lasts for the session only.

export function loadHighScore(storage: () => Pick<Storage, 'getItem'>): number {
  let raw: string | null
  try {
    raw = storage().getItem(HIGH_SCORE_KEY)
  } catch {
    return 0
  }
  if (!raw) return 0
  const score = Number(raw)
  return Number.isSafeInteger(score) && score >= 0 ? score : 0
}

export function saveHighScore(storage: () => Pick<Storage, 'setItem'>, score: number): void {
  try {
    storage().setItem(HIGH_SCORE_KEY, String(score))
  } catch (error) {
    console.warn('[haex-tetris] Could not store the high score:', error)
  }
}
