import { describe, expect, it } from "vitest";
import type { ImageElement, PageLayer, TableElement, TextElement } from "~/types/document";
import { clonePlain } from "./clone";
import type { PageDoc } from "./commands";
import { editCell, editText, placeElement, setFontFamily } from "./elementEdits";
import { createUndoStack } from "./undoStack";

const text = (id: string): TextElement => ({
  id, type: "text", x: 40, y: 40, width: 200, height: 30, rotation: 0,
  text: "Säurelösungen", fontFamily: "Caveat", fontSize: 24, color: "#1f2937", bbox: [40, 40, 200, 30],
});
const image = (id: string): ImageElement => ({
  id, type: "image", x: 40, y: 100, width: 300, height: 200, rotation: 0,
  source: { kind: "asset", assetId: `asset-${id}` }, opacity: 1, bbox: [40, 100, 300, 200],
});
const table: TableElement = {
  id: "table", type: "table", x: 40, y: 320, columns: 2, rows: 2, columnWidths: [80, 80], rowHeights: [30, 30],
  cells: [["Tag", "Fach"], ["Mo", ""]], bbox: [40, 320, 160, 60],
};

const layer = (id: string, elements: PageLayer["elements"], locked = false): PageLayer => ({
  id, name: id, visible: true, locked, elements,
});

/** A photo page: the original locked at the bottom, the draft above it. */
const photoPage = (): PageDoc => ({
  id: "p1",
  layers: [
    layer("original", [image("original")], true),
    layer("text", [text("text")]),
    layer("objects", [clonePlain(table), image("drawing")]),
  ],
  background: { paperColor: "#ffffff", template: "blank" },
  width: 794,
  height: 1123,
});

const find = <T>(page: PageDoc, id: string) =>
  page.layers.flatMap((l) => l.elements).find((e) => e.id === id) as T;

describe("element edits", () => {
  it("change a text, a cell, the handwriting and an image, and undo each", () => {
    const page = photoPage();
    const before = clonePlain(page);
    const stack = createUndoStack();

    stack.push(editText(page, "text", "Säurelösung", 32)!);
    stack.push(editCell(page, "table", 1, 1, "Chemie")!);
    stack.push(setFontFamily(page, "text", "Kalam", 34)!);
    stack.push(placeElement(page, "drawing", { x: 60, y: 120, width: 450, height: 300 }, "g1")!);

    expect(find<TextElement>(page, "text")).toMatchObject({ text: "Säurelösung", fontFamily: "Kalam", height: 34 });
    expect(find<TableElement>(page, "table").cells).toEqual([["Tag", "Fach"], ["Mo", "Chemie"]]);
    expect(find<ImageElement>(page, "drawing")).toMatchObject({ x: 60, y: 120, width: 450, height: 300 });
    expect(find<ImageElement>(page, "drawing").bbox).toEqual([60, 120, 450, 300]);

    while (stack.undo());
    expect(page).toEqual(before);
  });

  it("make one undo step of a whole drag", () => {
    const page = photoPage();
    const stack = createUndoStack();
    for (const x of [50, 60, 70]) stack.push(placeElement(page, "text", { x, y: 40, width: 200, height: 30 }, "drag")!);
    expect(find<TextElement>(page, "text").x).toBe(70);
    stack.undo();
    expect(find<TextElement>(page, "text").x).toBe(40);
    expect(stack.undo()).toBeNull();
  });

  it("move a table but leave its size to its lines", () => {
    const page = photoPage();
    placeElement(page, "table", { x: 10, y: 20, width: 999, height: 999 }, "g")!.apply();
    expect(find<TableElement>(page, "table")).toMatchObject({ x: 10, y: 20, columnWidths: [80, 80], rowHeights: [30, 30] });
  });

  it("never touch the original layer", () => {
    const page = photoPage();
    const original = clonePlain(page.layers[0]);
    expect(placeElement(page, "original", { x: 0, y: 0, width: 10, height: 10 }, "g")).toBeNull();
    expect(editText(page, "original", "x", 10)).toBeNull();
    expect(page.layers[0]).toEqual(original);
  });

  it("skip a cell outside the table and an element of the wrong kind", () => {
    const page = photoPage();
    editCell(page, "table", 5, 0, "x")!.apply();
    expect(find<TableElement>(page, "table").cells).toEqual(table.cells);
    expect(editText(page, "drawing", "x", 10)).toBeNull();
    expect(editCell(page, "text", 0, 0, "x")).toBeNull();
  });
});
