const MAX_SIDE = 10000;

/** Whole pixels within 1…10000; a canvas side of 0 cannot be encoded. */
export function clampSide(value: number): number {
  return Math.min(MAX_SIDE, Math.max(1, Math.round(value)));
}

/** A typed side length, or null for blank or non-numeric text. `min`/`max` of the input do not constrain it. */
export function parseSide(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? clampSide(value) : null;
}
