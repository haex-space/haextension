import type { PageElement, PageLayer, TableElement } from "~/types/document";
import type { Box } from "./elementEdits";

/**
 * Auswahl von Text, Bild und Tabelle auf der Seite: was unter dem Zeiger liegt, ob er auf dem
 * Griff zum Skalieren steht und wohin ein Ziehen das Element bringt. Rein, damit es ohne Canvas
 * testbar ist; Koordinaten sind Seitenkoordinaten.
 */

export interface Point {
  x: number;
  y: number;
}

export type Selectable = Extract<PageElement, { type: "text" | "image" | "table" | "latex" }>;

/** Kleinste Seitenlänge beim Skalieren. */
export const MIN_SIZE = 16;
/** Halbe Kantenlänge des Griffs unten rechts. */
export const HANDLE_RADIUS = 8;

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function isSelectable(element: PageElement): element is Selectable {
  return element.type === "text" || element.type === "image" || element.type === "table" || element.type === "latex";
}

export function boxOf(element: Selectable): Box {
  if (element.type === "table") {
    return { x: element.x, y: element.y, width: sum(element.columnWidths), height: sum(element.rowHeights) };
  }
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

const contains = (box: Box, point: Point) =>
  point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;

/** Das oberste auswählbare Element unter dem Punkt; gesperrte und verborgene Ebenen zählen nicht. */
export function elementAt(layers: readonly PageLayer[], point: Point): Selectable | null {
  for (let l = layers.length - 1; l >= 0; l--) {
    const layer = layers[l]!;
    if (!layer.visible || layer.locked) continue;
    for (let e = layer.elements.length - 1; e >= 0; e--) {
      const element = layer.elements[e]!;
      if (isSelectable(element) && contains(boxOf(element), point)) return element;
    }
  }
  return null;
}

/** Tabellen haben keinen Griff; ihre Größe folgt ihren Linien. */
export function onResizeHandle(element: Selectable, point: Point, zoom: number): boolean {
  if (element.type === "table") return false;
  const box = boxOf(element);
  const radius = HANDLE_RADIUS / zoom;
  return Math.abs(point.x - (box.x + box.width)) <= radius && Math.abs(point.y - (box.y + box.height)) <= radius;
}

/** Die Box nach einem Ziehen um `dx`/`dy`; ein Bild oder eine Formel behält beim Skalieren sein Seitenverhältnis. */
export function draggedBox(start: Box, dx: number, dy: number, mode: "move" | "resize", keepAspect: boolean): Box {
  if (mode === "move") return { ...start, x: start.x + dx, y: start.y + dy };
  let width = Math.max(MIN_SIZE, start.width + dx);
  let height = Math.max(MIN_SIZE, start.height + dy);
  if (keepAspect) {
    const scale = Math.max(width / start.width, height / start.height);
    width = Math.max(MIN_SIZE, start.width * scale);
    height = width * (start.height / start.width);
  }
  return { ...start, width, height };
}

/** Die Zelle unter dem Punkt, oder null außerhalb der Tabelle. */
export function cellAt(table: TableElement, point: Point): { row: number; column: number; box: Box } | null {
  let top = table.y;
  for (let row = 0; row < table.rows; row++) {
    const height = table.rowHeights[row]!;
    let left = table.x;
    for (let column = 0; column < table.columns; column++) {
      const box = { x: left, y: top, width: table.columnWidths[column]!, height };
      if (contains(box, point)) return { row, column, box };
      left += box.width;
    }
    top += height;
  }
  return null;
}
