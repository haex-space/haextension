/**
 * Die Teilung zwischen der Seite und dem Anhang daneben (holzi Spec 046, FR-023): Der Schüler zieht die Trennlinie.
 * Der Anteil ist der Teil der Breite, den der Anhang bekommt; er bleibt in Grenzen, damit weder die Seite noch
 * der Anhang verschwindet.
 */

export const SPLIT = { default: 0.42, min: 0.2, max: 0.8 };

/** Ein gespeicherter oder berechneter Anteil in den Grenzen; alles, was keine Zahl ist, wird zum Standard. */
export function clampFraction(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return SPLIT.default;
  return Math.min(SPLIT.max, Math.max(SPLIT.min, value));
}

/**
 * Der Anteil des Anhangs, wenn die Trennlinie bei `pointerX` steht: Der Anhang liegt rechts, ihm gehört alles
 * rechts von der Linie. `rect` ist der Bereich, den Seite und Anhang zusammen füllen.
 */
export function splitFraction(pointerX: number, rect: { left: number; right: number }): number {
  const width = rect.right - rect.left;
  if (!(width > 0)) return SPLIT.default;
  return clampFraction((rect.right - pointerX) / width);
}
