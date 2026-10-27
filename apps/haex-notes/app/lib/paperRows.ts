import { marginsOf } from "~/lib/pageBackground";
import type { PageBackground, PageTemplate, TextElement } from "~/types/document";

/**
 * Die Zeilen eines Papiers, in die Schrift passt: eine Zeile kariertes Papier ist ein Kästchen, eine Zeile
 * Schreiblern-Lineatur ein Band. Blanko und Notenlinien haben keine; dort bleibt die Schrift frei.
 */
export interface PaperRows {
  /** Oberkante der ersten Zeile (Seitenpixel). */
  top: number;
  /** Abstand von Zeile zu Zeile. */
  pitch: number;
  /** Lage der Grundlinie in einer Zeile, von deren Oberkante gemessen. */
  baseline: number;
  /** Schriftgröße, die in eine einzelne Zeile passt. */
  fontSize: number;
}

/** Wie viele Papierzeilen ein Textblock je Schriftzeile höchstens belegt. */
export const MAX_MULTIPLE = 6;
/** Anteil der Zeilenhöhe über der Grundlinie, wo ein Textblock sie hat. */
export const BASELINE_SHARE = 0.8;

/** Zeilenhöhe frei hängender Schrift relativ zur Schriftgröße. */
export const LINE_HEIGHT = 1.25;
/** Lage der Grundlinie frei hängender Schrift unter ihrer Oberkante, in Schriftgrößen. */
const FREE_BASELINE = 0.85;

type Template = { pitch: number; baseline: number; fontSize: number };

// Maße wie in renderPageTemplate: ein Kästchen ist 19 Pixel, die Grundlinie liegt unten im Kästchen.
const TEMPLATES: Partial<Record<PageTemplate, Template>> = {
  lined: { pitch: 30, baseline: 30, fontSize: 21 },
  grid: { pitch: 19, baseline: 19, fontSize: 13 },
  "grid-large": { pitch: 38, baseline: 38, fontSize: 27 },
  dotgrid: { pitch: 19, baseline: 19, fontSize: 13 },
  millimeter: { pitch: 18.9, baseline: 18.9, fontSize: 13 },
  // Band 80/60 mit 15/10 Abstand, Grundlinie in der Bandmitte.
  lineatur1: { pitch: 95, baseline: 40, fontSize: 40 },
  lineatur2: { pitch: 70, baseline: 30, fontSize: 30 },
  // Mittellinie und Grundlinie 30 auseinander, Zeile zu Zeile 60; die Zeile beginnt an der Mittellinie.
  lineatur3: { pitch: 60, baseline: 30, fontSize: 50 },
};

/** Die Zeilen des Papiers; `null`, wenn es keine hat. */
export function rowsOf(background: PageBackground): PaperRows | null {
  const template = TEMPLATES[background.template];
  if (!template) return null;
  return { top: marginsOf(background).top, ...template };
}

/** Wie viele Papierzeilen ein Textblock mit dieser Zeilenhöhe belegt, auf 1 bis `MAX_MULTIPLE` gerundet. */
export function multipleOf(rows: PaperRows, lineHeight: number): number {
  return Math.min(MAX_MULTIPLE, Math.max(1, Math.round(lineHeight / rows.pitch)));
}

export interface TextRows {
  fontSize: number;
  lineHeight: number;
}

/** Schriftgröße und Zeilenhöhe eines Textblocks, dessen Zeilen `multiple` Papierzeilen hoch sind. */
export function textRowsFor(rows: PaperRows, multiple: number): TextRows {
  return { fontSize: Math.round(rows.fontSize * multiple), lineHeight: rows.pitch * multiple };
}

/**
 * Oberkante eines Textblocks, dessen erste Grundlinie auf einer Linie des Papiers liegt, und zwar der,
 * die `y` am nächsten ist. Eine Zeile `multiple` Papierzeilen hoch liegt mit ihrer Grundlinie in der
 * letzten ihrer Papierzeilen.
 */
export function snapTop(rows: PaperRows, y: number, multiple: number): number {
  const lineHeight = rows.pitch * multiple;
  const offset = BASELINE_SHARE * lineHeight;
  const first = rows.top + (multiple - 1) * rows.pitch + rows.baseline;
  const index = Math.max(0, Math.round((y + offset - first) / rows.pitch));
  return first + index * rows.pitch - offset;
}

type TextPosition = Pick<TextElement, "y" | "fontSize" | "lineHeight">;

/** Abstand von Zeile zu Zeile eines Textblocks. */
export const lineStepOf = (text: Pick<TextElement, "fontSize" | "lineHeight">) => text.lineHeight ?? text.fontSize * LINE_HEIGHT;

/** Höhe der ersten Grundlinie eines Textblocks auf der Seite. */
const baselineOf = (text: TextPosition) =>
  text.y + (text.lineHeight ? BASELINE_SHARE * text.lineHeight : FREE_BASELINE * text.fontSize);

/**
 * Schrift, Zeilenhöhe und Oberkante eines Textblocks auf den Zeilen des Papiers. Ohne `multiple` gilt das
 * Vielfache, das seiner jetzigen Zeilenhöhe am nächsten kommt; die erste Grundlinie rückt auf die nächste Linie.
 */
export function alignText(rows: PaperRows, text: TextPosition, multiple = multipleOf(rows, lineStepOf(text))): TextRows & { y: number } {
  const next = textRowsFor(rows, multiple);
  return { ...next, y: snapTop(rows, baselineOf(text) - BASELINE_SHARE * next.lineHeight, multiple) };
}

/** Oberkante eines Textblocks, der frei hängt und seine erste Grundlinie dort lässt, wo sie jetzt ist. */
export const freeTop = (text: TextPosition) => baselineOf(text) - FREE_BASELINE * text.fontSize;
