import type { Difficulty, DifficultyId } from '~/types/puzzle'

export const DIFFICULTIES: readonly Difficulty[] = [
  { id: 'easy', target: 12, minPieceSide: 24 },
  { id: 'medium', target: 48, minPieceSide: 24 },
  { id: 'hard', target: 108, minPieceSide: 24 },
  { id: 'expert', target: 192, minPieceSide: 24 },
]

export function difficultyById(id: DifficultyId): Difficulty {
  return DIFFICULTIES.find(d => d.id === id)!
}

/** The levels whose pieces would still be at least `minPieceSide` pixels wide for this picture. */
export function availableDifficulties(width: number, height: number): DifficultyId[] {
  return DIFFICULTIES
    .filter(d => Math.sqrt((width * height) / d.target) >= d.minPieceSide)
    .map(d => d.id)
}

/** True when not even the easiest level is available. */
export function isTooSmall(width: number, height: number): boolean {
  return availableDifficulties(width, height).length === 0
}
