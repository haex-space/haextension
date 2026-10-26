import { describe, expect, it } from "vitest";
import type { ImageElement, LatexElement, PageLayer, StrokeElement, TableElement, TextElement } from "~/types/document";
import { cellAt, draggedBox, elementAt, MIN_SIZE, onResizeHandle } from "./selection";

const text: TextElement = {
  id: "text", type: "text", x: 0, y: 0, width: 200, height: 40, rotation: 0,
  text: "Satz", fontFamily: "Caveat", fontSize: 24, color: "#000", bbox: [0, 0, 200, 40],
};
const image: ImageElement = {
  id: "image", type: "image", x: 100, y: 20, width: 200, height: 100, rotation: 0,
  source: { kind: "asset", assetId: "a" }, opacity: 1, bbox: [100, 20, 200, 100],
};
const table: TableElement = {
  id: "table", type: "table", x: 0, y: 200, columns: 2, rows: 2, columnWidths: [80, 120], rowHeights: [30, 40],
  bbox: [0, 200, 200, 70],
};
const stroke: StrokeElement = {
  id: "stroke", type: "stroke", points: [[0, 0, 0.5], [300, 300, 0.5]], color: "#000", size: 2, tool: "brush",
  bbox: [0, 0, 300, 300],
};
const layer = (id: string, elements: PageLayer["elements"], extra: Partial<PageLayer> = {}): PageLayer => ({
  id, name: id, visible: true, locked: false, elements, ...extra,
});

describe("elementAt", () => {
  it("finds the topmost text, image or table and skips strokes", () => {
    const layers = [layer("a", [text, table]), layer("b", [image, stroke])];
    expect(elementAt(layers, { x: 150, y: 30 })?.id).toBe("image");
    expect(elementAt(layers, { x: 50, y: 30 })?.id).toBe("text");
    expect(elementAt(layers, { x: 150, y: 260 })?.id).toBe("table");
    expect(elementAt(layers, { x: 290, y: 290 })).toBeNull();
  });

  it("ignores locked and hidden layers", () => {
    expect(elementAt([layer("original", [image], { locked: true })], { x: 150, y: 30 })).toBeNull();
    expect(elementAt([layer("text", [text], { visible: false })], { x: 50, y: 30 })).toBeNull();
  });
});

describe("onResizeHandle", () => {
  it("hits the bottom right corner, in screen pixels, but never on a table", () => {
    expect(onResizeHandle(image, { x: 303, y: 118 }, 1)).toBe(true);
    expect(onResizeHandle(image, { x: 303, y: 118 }, 4)).toBe(false);
    expect(onResizeHandle(image, { x: 200, y: 70 }, 1)).toBe(false);
    expect(onResizeHandle(table, { x: 200, y: 270 }, 1)).toBe(false);
  });
});

describe("draggedBox", () => {
  const start = { x: 10, y: 10, width: 200, height: 100 };

  it("moves without changing the size", () => {
    expect(draggedBox(start, 5, -5, "move", false)).toEqual({ x: 15, y: 5, width: 200, height: 100 });
  });

  it("resizes freely, or keeping the aspect of an image, and never below the minimum", () => {
    expect(draggedBox(start, 100, 10, "resize", false)).toEqual({ x: 10, y: 10, width: 300, height: 110 });
    expect(draggedBox(start, 100, 10, "resize", true)).toEqual({ x: 10, y: 10, width: 300, height: 150 });
    expect(draggedBox(start, -500, -500, "resize", false)).toMatchObject({ width: MIN_SIZE, height: MIN_SIZE });
  });
});

describe("cellAt", () => {
  it("finds row, column and box of the cell under the point", () => {
    expect(cellAt(table, { x: 100, y: 240 })).toEqual({ row: 1, column: 1, box: { x: 80, y: 230, width: 120, height: 40 } });
    expect(cellAt(table, { x: 300, y: 240 })).toBeNull();
  });
});

describe("selecting a formula", () => {
  const formula: LatexElement = {
    id: "formula", type: "latex", x: 300, y: 300, width: 120, height: 40, rotation: 0,
    source: "x^2", svg: "<svg/>", color: "#000", bbox: [300, 300, 120, 40],
  };

  it("finds a formula like a text, and skips it on a locked layer", () => {
    expect(elementAt([layer("f", [formula])], { x: 310, y: 310 })?.id).toBe("formula");
    expect(elementAt([layer("f", [formula], { locked: true })], { x: 310, y: 310 })).toBeNull();
  });

  it("has a handle at its bottom right corner and keeps its aspect when scaled by a caller that asks for it", () => {
    expect(onResizeHandle(formula, { x: 420, y: 340 }, 1)).toBe(true);
    const start = { x: 300, y: 300, width: 120, height: 40 };
    const scaled = draggedBox(start, 60, 0, "resize", true);
    expect(scaled.width / scaled.height).toBeCloseTo(3);
  });
});
