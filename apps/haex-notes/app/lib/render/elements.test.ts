import { describe, expect, it, vi } from "vitest";
import type { StrokeElement } from "~/types/document";
import { drawElement, drawElements, strokeOutlineToPath, type StrokePathCache } from "./elements";

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

describe("drawElements with a path cache", () => {
  const context = () => ({
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    save: vi.fn(),
    restore: vi.fn(),
    fill: vi.fn(),
  }) as unknown as CanvasRenderingContext2D;

  const brush = (): StrokeElement => ({
    id: "s1",
    type: "stroke",
    points: [[0, 0, 0.5], [10, 10, 0.5]],
    color: "#000000",
    size: 4,
    tool: "brush",
    bbox: [-2, -2, 14, 14],
  });

  it("builds a stroke path once while its geometry is unchanged", () => {
    const Path2D = vi.fn();
    vi.stubGlobal("Path2D", Path2D);
    const cache: StrokePathCache = new WeakMap();
    const stroke = brush();

    drawElements(context(), [stroke], cache);
    drawElements(context(), [stroke], cache);
    expect(Path2D).toHaveBeenCalledTimes(1);

    // Jede Geometrieänderung setzt eine neue Hülle.
    stroke.points.push([20, 20, 0.5]);
    stroke.bbox = [-2, -2, 24, 24];
    drawElements(context(), [stroke], cache);
    expect(Path2D).toHaveBeenCalledTimes(2);
  });
});
