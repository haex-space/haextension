import type { PageElement, TextElement } from "~/types/document";
import { computeBbox } from "./bbox";
import { mutateElements, type Command, type PageDoc } from "./commands";
import { sizeOf, type Rendered } from "./math";
import { alignText, type PaperRows } from "./paperRows";
import { cellsOf } from "./tableActions";

/**
 * Bearbeitungen von Text, Zellen, Bildern und Tabellen, je als Kommando für den Undo-Stack.
 * Elemente auf gesperrten Ebenen (das Original eines Fotos) ändert keine davon: dann gibt es
 * kein Kommando. Höhen von Texten misst der Aufrufer, weil das einen Canvas braucht.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ElementOf<K extends PageElement["type"]> = Extract<PageElement, { type: K }>;

/** Das Element, wenn es auf einer Ebene liegt, die man bearbeiten darf. */
export function editableElement(page: PageDoc, id: string): PageElement | null {
  for (const layer of page.layers) {
    if (layer.locked) continue;
    const element = layer.elements.find((e) => e.id === id);
    if (element) return element;
  }
  return null;
}

function editAs<K extends PageElement["type"]>(
  page: PageDoc,
  id: string,
  kinds: readonly K[],
  label: string,
  mutate: (element: ElementOf<K>) => void,
  mergeKey?: string,
): Command | null {
  const isKind = (element: PageElement): element is ElementOf<K> => (kinds as readonly string[]).includes(element.type);
  const target = editableElement(page, id);
  if (!target || !isKind(target)) return null;
  return mutateElements(page, [id], (element) => {
    if (!isKind(element)) return;
    mutate(element);
    element.bbox = computeBbox(element);
  }, label, mergeKey);
}

export const editText = (page: PageDoc, id: string, text: string, height: number) =>
  editAs(page, id, ["text"], "Text ändern", (element) => {
    element.text = text;
    element.height = height;
  });

export const editCell = (page: PageDoc, id: string, row: number, column: number, text: string) =>
  editAs(page, id, ["table"], "Zelle ändern", (table) => {
    if (row >= table.rows || column >= table.columns) return;
    const cells = cellsOf(table);
    cells[row]![column] = text;
    table.cells = cells;
  });

export const setFontFamily = (page: PageDoc, id: string, fontFamily: string, height: number) =>
  editAs(page, id, ["text"], "Handschrift ändern", (element) => {
    element.fontFamily = fontFamily;
    element.height = height;
  });

export const setTextColor = (page: PageDoc, id: string, color: string) =>
  editAs(page, id, ["text"], "Farbe ändern", (element) => {
    element.color = color;
  });

/** Schriftgröße, Zeilenhöhe und Oberkante eines Textblocks; ohne `lineHeight` hängt er wieder frei. */
export interface TextLayoutChange {
  fontSize: number;
  lineHeight?: number;
  y: number;
}

/** Misst die Höhe eines Textblocks, so umbrochen, wie er gezeichnet wird (braucht einen Canvas). */
export type MeasureText = (text: TextElement) => number;

function layOut(element: TextElement, change: TextLayoutChange, measure: MeasureText) {
  element.fontSize = change.fontSize;
  if (change.lineHeight === undefined) delete element.lineHeight;
  else element.lineHeight = change.lineHeight;
  element.y = change.y;
  element.height = measure(element);
}

export const setTextLayout = (page: PageDoc, id: string, change: TextLayoutChange, measure: MeasureText) =>
  editAs(page, id, ["text"], "Zeilenhöhe ändern", (element) => layOut(element, change, measure));

/**
 * Setzt jeden Textblock der Seite auf die Zeilen ihres Papiers, im Vielfachen, das seiner Größe am nächsten
 * kommt (Überschriften bleiben groß). `null`, wenn die Seite keinen bearbeitbaren Text hat.
 */
export function alignAllText(page: PageDoc, rows: PaperRows, measure: MeasureText): Command | null {
  const ids = page.layers
    .filter((layer) => !layer.locked)
    .flatMap((layer) => layer.elements)
    .filter((element) => element.type === "text")
    .map((element) => element.id);
  if (ids.length === 0) return null;
  return mutateElements(page, ids, (element) => {
    if (element.type !== "text") return;
    layOut(element, alignText(rows, element), measure);
    element.bbox = computeBbox(element);
  }, "Schrift an Papier anpassen");
}

/**
 * Verschiebt oder skaliert ein Element. Alle Aufrufe einer Geste teilen sich den mergeKey und
 * werden ein Undo-Schritt. Eine Tabelle wird nur verschoben; ihre Größe folgt ihren Linien.
 */
export const placeElement = (page: PageDoc, id: string, box: Box, mergeKey: string) =>
  editAs(page, id, ["text", "image", "table", "latex"], "Verschieben", (element) => {
    element.x = box.x;
    element.y = box.y;
    if (element.type === "table") return;
    element.width = box.width;
    element.height = box.height;
  }, mergeKey);

/**
 * Ändert die Quelle einer Formel und setzt ihr neues SVG ein. Die Schriftgröße bleibt, in der die Formel
 * stand, auch wenn ihre Höhe sich ändert (ein Bruch ist höher als ein Buchstabe); die Breite bleibt, wenn der
 * Schüler sie von Hand gezogen hat, nicht erhalten.
 */
export const editLatex = (page: PageDoc, id: string, source: string, rendered: Rendered) =>
  editAs(page, id, ["latex"], "Formel ändern", (element) => {
    const before = sizeOf(element.svg);
    const em = before ? element.height / before.height : 16;
    element.source = source;
    element.svg = rendered.svg;
    element.width = rendered.width * em;
    element.height = rendered.height * em;
  });
