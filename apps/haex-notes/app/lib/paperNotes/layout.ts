/**
 * Wohin die erkannten Regionen auf der Seite kommen (research R11 in haex-space/haex-vault@74263d8c6e8e23831e4a5016797c3db4987d8697:specs/046-paper-notes-canvas/research.md): dorthin, wo sie
 * auf dem Foto standen, mit zwei Aufräumregeln — nahe linke Kanten fluchten, überlappende Regionen
 * rutschen in Lesereihenfolge nach unten.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Die Arbeitskopie, eingepasst in die Seite: Lage und Maßstab. */
export interface Fit extends Rect {
  scale: number;
}

/** Rand um das eingepasste Foto. */
export const PAGE_MARGIN = 40;
/** Linke Kanten, die näher als dieser Anteil der Seitenbreite beieinander liegen, fluchten. */
const ALIGN_SHARE = 0.02;
/** Abstand, um den eine überlappende Region unter die vorige rutscht. */
const GAP = 8;
/** Schriftgröße erkannter Texte: lesbar, aber nicht größer als eine Überschrift. */
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 32;
export const LINE_HEIGHT = 1.25;

/** Passt ein Bild der Größe `width` × `height` mit Rand in die Seite, oben bündig und mittig. */
export function fitImage(width: number, height: number, pageWidth: number, pageHeight: number): Fit {
  const scale = Math.min((pageWidth - 2 * PAGE_MARGIN) / width, (pageHeight - 2 * PAGE_MARGIN) / height);
  const fitted = { width: width * scale, height: height * scale };
  return { x: (pageWidth - fitted.width) / 2, y: PAGE_MARGIN, scale, ...fitted };
}

/** Eine Box `[x1, y1, x2, y2]` (0–1000 relativ zur Arbeitskopie) auf der Seite; null, wenn sie leer ist. */
export function boxToRect(box: readonly number[], fit: Fit): Rect | null {
  const [x1, y1, x2, y2] = box;
  if (box.length !== 4 || x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return null;
  if (!(x2 > x1) || !(y2 > y1)) return null;
  return {
    x: fit.x + (x1 / 1000) * fit.width,
    y: fit.y + (y1 / 1000) * fit.height,
    width: ((x2 - x1) / 1000) * fit.width,
    height: ((y2 - y1) / 1000) * fit.height,
  };
}

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Räumt die Regionen in Lesereihenfolge auf; gibt neue Rechtecke zurück. */
export function tidy(rects: readonly Rect[], pageWidth: number): Rect[] {
  const placed = rects.map((rect) => ({ ...rect }));
  const tolerance = pageWidth * ALIGN_SHARE;
  // Kanten fluchten an der kleinsten Kante ihrer Gruppe, damit nichts nach links aus dem Foto rutscht.
  const byLeft = [...placed].sort((a, b) => a.x - b.x);
  let groupStart = byLeft[0]?.x ?? 0;
  for (const rect of byLeft) {
    if (rect.x - groupStart < tolerance) rect.x = groupStart;
    else groupStart = rect.x;
  }
  // ponytail: O(n²) worst case, bounded by page-recognition's 512-region limit;
  // use a sweep-line layout if the model format ever permits substantially more regions.
  for (let i = 0; i < placed.length; i++) {
    const rect = placed[i]!;
    let moved = true;
    while (moved) {
      moved = false;
      for (const earlier of placed.slice(0, i)) {
        if (overlap(rect, earlier)) {
          rect.y = earlier.y + earlier.height + GAP;
          moved = true;
        }
      }
    }
  }
  return placed;
}

/** Schriftgröße eines Textblocks aus Höhe und Zeilenzahl. */
export function fontSizeFor(height: number, lines: number): number {
  const size = height / Math.max(lines, 1) / LINE_HEIGHT;
  return Math.round(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size)));
}
