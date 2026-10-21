/**
 * Handschriftstile für gelesene Texte (FR-008 in haex-space/haex-vault@d91e91721e4aca4e926fb6c32152c79f317b2d52:specs/046-paper-notes-canvas/spec.md).
 * Der Text bleibt Text; der Stil ist nur seine Darstellung. Die Dateien liegen frei lizenziert
 * unter `public/fonts/` (Herkunft und Lizenzen in `SOURCE.md`).
 */

export interface HandwritingStyle {
  family: string;
  /** Pfad relativ zur Seite; die Erweiterung läuft unter einer relativen Basis. */
  file: string;
}

export const HANDWRITING_STYLES: readonly HandwritingStyle[] = [
  { family: "Caveat", file: "fonts/Caveat.ttf" },
  { family: "Patrick Hand", file: "fonts/PatrickHand-Regular.ttf" },
  { family: "Kalam", file: "fonts/Kalam-Regular.ttf" },
];

/** Stil neuer Texte aus einem Foto. */
export const DEFAULT_HANDWRITING = HANDWRITING_STYLES[0]!.family;

/** Neutrale Schrift: wählbar, und Rückfall für einen Stil, der fehlt oder nicht lädt. */
export const NEUTRAL_FAMILY = "sans-serif";

let loading: Promise<void> | null = null;

/** Lädt die Handschriften einmal; ein Stil, der nicht lädt, wird neutral gezeichnet. */
export function loadHandwritingFontsAsync(baseUri: string): Promise<void> {
  loading ??= Promise.all(HANDWRITING_STYLES.map(async ({ family, file }) => {
    try {
      const face = new FontFace(family, `url("${new URL(file, baseUri).href}")`);
      document.fonts.add(await face.load());
    } catch (error) {
      console.warn(`[haex-notes] Could not load the handwriting ${family}:`, error);
    }
  })).then(() => undefined);
  return loading;
}
