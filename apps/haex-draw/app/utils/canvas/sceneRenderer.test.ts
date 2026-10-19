import { describe, expect, it } from "vitest";
import type { StrokeData } from "~/database/schemas";
import type { Stencil } from "~/types/stencil";
import { computeSceneBounds, isContentStencil } from "./sceneRenderer";

const stroke = (points: [number, number][], size: number, tool: StrokeData["tool"] = "brush"): StrokeData => ({
  id: "s",
  points: points.map(([x, y]) => [x, y, 0.5]),
  color: "#000000",
  size,
  tool,
});

const stencil = (overrides: Partial<Stencil>): Stencil => ({
  id: "st",
  presetId: "image",
  shapeType: "image",
  label: "image",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  rotation: 0,
  pinned: false,
  imageData: "data:image/png;base64,AAAA",
  ...overrides,
});

describe("computeSceneBounds", () => {
  it("returns null for an empty scene", () => {
    expect(computeSceneBounds([], [])).toBeNull();
  });

  it("includes eraser strokes, which paint over the content", () => {
    expect(computeSceneBounds([stroke([[10, 20]], 4, "eraser")], [])).toEqual({ minX: 0, minY: 10, maxX: 20, maxY: 30 });
  });

  it("extends stroke bounds by the brush reach", () => {
    expect(computeSceneBounds([stroke([[0, 0], [100, 50]], 8)], [])).toEqual({ minX: -20, minY: -20, maxX: 120, maxY: 70 });
  });

  it("includes image stencils", () => {
    expect(computeSceneBounds([], [stencil({ x: 200, y: 100 })])).toEqual({ minX: 150, minY: 75, maxX: 250, maxY: 125 });
  });

  it("uses the rotated corners of a stencil", () => {
    const bounds = computeSceneBounds([], [stencil({ rotation: Math.PI / 2 })]);
    expect(bounds?.minX).toBeCloseTo(-25);
    expect(bounds?.maxX).toBeCloseTo(25);
    expect(bounds?.minY).toBeCloseTo(-50);
    expect(bounds?.maxY).toBeCloseTo(50);
  });

  it("ignores guide stencils, which exports do not render", () => {
    expect(computeSceneBounds([], [stencil({ shapeType: "rectangle", imageData: undefined })])).toBeNull();
  });
});

describe("isContentStencil", () => {
  it("treats images and emoji with content as visible", () => {
    expect(isContentStencil(stencil({}))).toBe(true);
    expect(isContentStencil(stencil({ shapeType: "emoji", emoji: "🙂", imageData: undefined }))).toBe(true);
  });

  it("treats shapes and empty content stencils as guides", () => {
    expect(isContentStencil(stencil({ shapeType: "star", imageData: undefined }))).toBe(false);
    expect(isContentStencil(stencil({ imageData: undefined }))).toBe(false);
    expect(isContentStencil(stencil({ shapeType: "emoji", imageData: undefined }))).toBe(false);
  });
});
