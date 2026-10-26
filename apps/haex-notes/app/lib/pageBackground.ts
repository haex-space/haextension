import { DEFAULT_PAPER_COLOR } from "~/lib/migratePage";
import type { PageBackground, PageTemplate } from "~/types/document";

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
