/** Limits for pictures going into the library (research R-2). */
export const MAX_LONG_SIDE = 2048
export const MAX_BYTES = 1024 * 1024
export const THUMBNAIL_LONG_SIDE = 256
/** Reading far larger files only to refuse them could exhaust a phone's memory (as the game files of haex-doom). */
export const MAX_FILE_BYTES = 64 * 1024 * 1024
export const MAX_PIXELS = 100_000_000

export const QUALITY_LADDER = [0.88, 0.78, 0.68, 0.58] as const
/** Each round walks the whole ladder, then the long side shrinks by a quarter. */
const SHRINK = 0.75
const ROUNDS = 3
export const MAX_ATTEMPTS = QUALITY_LADDER.length * ROUNDS

export interface Attempt {
  width: number
  height: number
  quality: number
}

/** The size with the longer side at most `max`; never enlarges, keeps the aspect ratio. */
export function fitLongSide(width: number, height: number, max: number): { width: number; height: number } {
  const longSide = Math.max(width, height)
  if (longSide <= max) return { width, height }
  const scale = max / longSide
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * The n-th size and quality to try when encoding a picture, or null once the attempts are used up
 * (the picture then cannot be brought under `MAX_BYTES`).
 */
export function nextAttempt(width: number, height: number, attempt: number): Attempt | null {
  if (attempt >= MAX_ATTEMPTS) return null
  const round = Math.floor(attempt / QUALITY_LADDER.length)
  const base = fitLongSide(width, height, MAX_LONG_SIDE)
  const scale = SHRINK ** round
  return {
    width: Math.max(1, Math.round(base.width * scale)),
    height: Math.max(1, Math.round(base.height * scale)),
    quality: QUALITY_LADDER[attempt % QUALITY_LADDER.length]!,
  }
}
