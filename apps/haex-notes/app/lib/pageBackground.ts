import { DEFAULT_PAPER_COLOR } from "~/lib/migratePage";
import { DEFAULT_MARGINS } from "~/utils/pageTemplates";
import type { PageBackground, PageMargins, PageTemplate } from "~/types/document";

/** Die Papierfarben, die das Menü anbietet; die erste ist das Standardpapier. */
export const PAPER_COLORS: { id: string; color: string; i18n: { de: string; en: string } }[] = [
  { id: "white", color: DEFAULT_PAPER_COLOR, i18n: { de: "Weiß", en: "White" } },
  { id: "cream", color: "#fef3c7", i18n: { de: "Creme", en: "Cream" } },
  { id: "mint", color: "#dcfce7", i18n: { de: "Mint", en: "Mint" } },
  { id: "sky", color: "#dbeafe", i18n: { de: "Hellblau", en: "Light blue" } },
  { id: "rose", color: "#ffe4e6", i18n: { de: "Rosa", en: "Rose" } },
];

export type BackgroundChange = { template: PageTemplate } | { paperColor: string };

/**
 * Der Hintergrund nach einer Änderung; `null`, wenn sich nichts ändert, damit die Wahl des
 * schon gewählten Eintrags keinen Undo-Schritt anlegt. Das Hintergrundbild einer PDF- oder
 * Bildseite (`overlay`) bleibt.
 */
export function changedBackground(current: PageBackground, change: BackgroundChange): PageBackground | null {
  const next = { ...current, ...change };
  const same = next.template === current.template && next.paperColor === current.paperColor;
  return same ? null : next;
}

export type MarginEdge = keyof PageMargins;

export const MARGIN_EDGES: MarginEdge[] = ["top", "bottom", "left", "right"];

const PX_PER_MM = 96 / 25.4;

/** Der größte Rand je Seite in Seitenpixeln (80 mm); darüber bliebe auf einer Querseite zu wenig Fläche. */
export const MARGIN_MAX = Math.round(80 * PX_PER_MM);

/** Seitenpixel (96 dpi) in ganze Millimeter, in denen der Schüler den Rand sieht. */
export function pxToMm(px: number): number {
  return Math.round(px / PX_PER_MM);
}

export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

function validMargin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MARGIN_MAX;
}

/** Der Rand der Seite; fehlt er oder ist eine Kante unbrauchbar, gilt dort der Standard. */
export function marginsOf(background: PageBackground): PageMargins {
  const own: Partial<PageMargins> = background.margins ?? {};
  const margins = { ...DEFAULT_MARGINS };
  for (const edge of MARGIN_EDGES) {
    const value = own[edge];
    if (validMargin(value)) margins[edge] = value;
  }
  return margins;
}

/**
 * Der Hintergrund mit einer geänderten Kante; `null`, wenn sich nichts ändert (auch bei
 * einer Eingabe, die keine Zahl ist). Der Wert wird auf ganze Pixel zwischen 0 und
 * `MARGIN_MAX` gebracht.
 */
export function changedMargin(current: PageBackground, edge: MarginEdge, value: number): PageBackground | null {
  if (!Number.isFinite(value)) return null;
  const clamped = Math.min(MARGIN_MAX, Math.max(0, Math.round(value)));
  const margins = marginsOf(current);
  if (margins[edge] === clamped) return null;
  return { ...current, margins: { ...margins, [edge]: clamped } };
}

/** Der Hintergrund ohne eigenen Rand; `null`, wenn die Seite keinen hat. */
export function resetMargins(current: PageBackground): PageBackground | null {
  if (!current.margins) return null;
  const { margins: _margins, ...rest } = current;
  return rest;
}
