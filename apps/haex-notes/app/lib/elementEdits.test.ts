import { describe, expect, it } from "vitest";
import type { ImageElement, LatexElement, PageLayer, TableElement, TextElement } from "~/types/document";
import { clonePlain } from "./clone";
import type { PageDoc } from "./commands";
import { alignAllText, editCell, editLatex, editText, placeElement, setFontFamily, setTextColor, setTextLayout } from "./elementEdits";
import { rowsOf } from "./paperRows";
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
    stack.redo();
    expect(find<TextElement>(page, "text").x).toBe(70);
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

describe("formula edits", () => {
  const svg = (widthEm: number, heightEm: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -883.9 ${widthEm * 1000} ${heightEm * 1000}"><g fill="currentColor"/></svg>`;
  const formula = (): LatexElement => ({
    id: "formula", type: "latex", x: 40, y: 40, width: 120, height: 40, rotation: 0,
    source: "x^2", svg: svg(3, 1), color: "#1f2937", bbox: [40, 40, 120, 40],
  });
  const page = (locked = false): PageDoc => ({
    id: "p1", layers: [layer("text", [formula()], locked)],
    background: { paperColor: "#ffffff", template: "blank" }, width: 794, height: 1123,
  });

  it("changes the source and the svg, keeps the font size when the height changes, and undoes it", () => {
    const doc = page();
    const before = clonePlain(doc);
    const stack = createUndoStack();
    // Before: 3 em wide and 1 em high at 40 px, so 40 px per em. A fraction is 2 em high and 4 em wide.
    stack.push(editLatex(doc, "formula", "\\frac{a}{b}", { svg: svg(4, 2), width: 4, height: 2 })!);

    expect(find<LatexElement>(doc, "formula")).toMatchObject({ source: "\\frac{a}{b}", width: 160, height: 80, x: 40, y: 40 });
    expect(find<LatexElement>(doc, "formula").svg).toContain("4000 2000");
    expect(find<LatexElement>(doc, "formula").bbox).toEqual([40, 40, 160, 80]);
    stack.undo();
    expect(doc).toEqual(before);
  });

  it("moves and scales like text and image, as one undo step of a drag", () => {
    const doc = page();
    const stack = createUndoStack();
    stack.push(placeElement(doc, "formula", { x: 60, y: 90, width: 150, height: 50 }, "g1")!);
    stack.push(placeElement(doc, "formula", { x: 70, y: 95, width: 180, height: 60 }, "g1")!);
    expect(find<LatexElement>(doc, "formula")).toMatchObject({ x: 70, y: 95, width: 180, height: 60 });
    stack.undo();
    expect(find<LatexElement>(doc, "formula")).toMatchObject({ x: 40, y: 40, width: 120, height: 40 });
    expect(stack.canUndo.value).toBe(false);
  });

  it("does not touch a formula on a locked layer or an element of another kind", () => {
    expect(editLatex(page(true), "formula", "y", { svg: svg(1, 1), width: 1, height: 1 })).toBeNull();
    expect(editLatex(photoPage(), "text", "y", { svg: svg(1, 1), width: 1, height: 1 })).toBeNull();
  });
});

describe("text on the paper rows", () => {
  const grid = rowsOf({ paperColor: "#ffffff", template: "grid" })!;
  const measure = (element: TextElement) => (element.lineHeight ?? element.fontSize * 1.25) * 2;

  it("sets the layout of one text, frees it again and undoes both", () => {
    const page = photoPage();
    const before = clonePlain(page);
    const stack = createUndoStack();

    stack.push(setTextLayout(page, "text", { fontSize: 13, lineHeight: 19, y: 41 }, measure)!);
    expect(find<TextElement>(page, "text")).toMatchObject({ fontSize: 13, lineHeight: 19, y: 41, height: 38, bbox: [40, 41, 200, 38] });

    stack.push(setTextLayout(page, "text", { fontSize: 13, y: 41 }, measure)!);
    expect(find<TextElement>(page, "text")).not.toHaveProperty("lineHeight");

    while (stack.undo());
    expect(page).toEqual(before);
  });

  it("changes the colour of a text and undoes it", () => {
    const page = photoPage();
    const stack = createUndoStack();
    stack.push(setTextColor(page, "text", "#dc2626")!);
    expect(find<TextElement>(page, "text").color).toBe("#dc2626");
    stack.undo();
    expect(find<TextElement>(page, "text").color).toBe("#1f2937");
  });

  it("fits every text of the page in one undo step and leaves the locked original alone", () => {
    const page = photoPage();
    page.layers[1]!.elements.push({ ...text("headline"), y: 200, fontSize: 40 });
    const before = clonePlain(page);
    const stack = createUndoStack();

    stack.push(alignAllText(page, grid, measure)!);
    expect(find<TextElement>(page, "text")).toMatchObject({ lineHeight: 38, fontSize: 26 });
    expect(find<TextElement>(page, "headline")).toMatchObject({ lineHeight: 57, fontSize: 39 });
    expect(find<ImageElement>(page, "original")).toEqual(before.layers[0]!.elements[0]);

    stack.undo();
    expect(stack.undo()).toBeFalsy();
    expect(page).toEqual(before);
  });

  it("gives no command for a page without text", () => {
    const page = photoPage();
    page.layers[1]!.elements = [];
    expect(alignAllText(page, grid, measure)).toBeNull();
  });

  it("does not touch a text on a locked layer", () => {
    const page = photoPage();
    page.layers[1]!.locked = true;
    expect(setTextColor(page, "text", "#dc2626")).toBeNull();
    expect(alignAllText(page, grid, measure)).toBeNull();
  });
});
