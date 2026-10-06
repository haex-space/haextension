import { describe, expect, it, vi } from "vitest";
import type { StrokeElement } from "~/types/document";
import { drawElement, strokeOutlineToPath } from "./elements";

describe("strokeOutlineToPath", () => {
  it("returns an empty string for fewer than two points", () => {
    expect(strokeOutlineToPath([])).toBe("");
    expect(strokeOutlineToPath([[0, 0]])).toBe("");
  });

  it("starts with a move and closes the path", () => {
    const path = strokeOutlineToPath([[0, 0], [10, 0], [10, 10]]);
    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });
});

describe("drawElement", () => {
  it("clears the content canvas for eraser strokes", () => {
    vi.stubGlobal("Path2D", vi.fn());
    const context = {
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "",
      save: vi.fn(),
      restore: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const eraser: StrokeElement = {
      id: "eraser",
      type: "stroke",
      points: [[0, 0, 0.5], [10, 10, 0.5]],
      color: "#000000",
      size: 4,
      tool: "eraser",
      bbox: [0, 0, 10, 10],
    };

    drawElement(context, eraser);

    expect(context.globalCompositeOperation).toBe("destination-out");
    expect(context.fillStyle).toBe("");
    expect(context.restore).toHaveBeenCalledOnce();
  });
});
