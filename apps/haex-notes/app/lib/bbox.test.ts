import { describe, expect, it } from "vitest";
import type { ImageElement, StrokeElement, TableElement } from "~/types/document";
import { computeBbox, rotatedRectBbox } from "./bbox";

const stroke = (points: [number, number, number][], size: number): StrokeElement => ({
  id: "s1",
  type: "stroke",
  points,
  color: "#000000",
  size,
  tool: "brush",
  bbox: [0, 0, 0, 0],
});

describe("rotatedRectBbox", () => {
  it("returns the rect itself when there is no rotation", () => {
    expect(rotatedRectBbox(10, 20, 100, 50, 0)).toEqual([10, 20, 100, 50]);
  });

  it("swaps width and height at 90 degrees", () => {
    const [x, y, w, h] = rotatedRectBbox(0, 0, 100, 50, Math.PI / 2);
    expect(w).toBeCloseTo(50);
    expect(h).toBeCloseTo(100);
    // Rotation um den eigenen Mittelpunkt (50, 25).
    expect(x).toBeCloseTo(25);
    expect(y).toBeCloseTo(-25);
  });
});

describe("computeBbox", () => {
  it("pads a stroke by half its width on every side", () => {
    const el = stroke([[10, 10, 0.5], [30, 40, 0.5]], 4);
    expect(computeBbox(el)).toEqual([8, 8, 24, 34]);
  });

  it("returns an empty box for a stroke without points", () => {
    expect(computeBbox(stroke([], 4))).toEqual([0, 0, 0, 0]);
  });

  it("sums column widths and row heights for a table", () => {
    const table: TableElement = {
      id: "t1",
      type: "table",
      x: 80,
      y: 100,
      columns: 3,
      rows: 2,
      columnWidths: [80, 60, 40],
      rowHeights: [30, 20],
      bbox: [0, 0, 0, 0],
    };
    expect(computeBbox(table)).toEqual([80, 100, 180, 50]);
  });

  it("uses the rotated hull for an image", () => {
    const image: ImageElement = {
      id: "i1",
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: Math.PI / 2,
      source: { kind: "inline", dataUrl: "data:," },
      opacity: 1,
      bbox: [0, 0, 0, 0],
    };
    const [, , w, h] = computeBbox(image);
    expect(w).toBeCloseTo(50);
    expect(h).toBeCloseTo(100);
  });
});
