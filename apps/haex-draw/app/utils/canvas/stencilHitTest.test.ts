import { describe, expect, it } from "vitest";
import type { Stencil } from "~/types/stencil";
import { isNearStencilCorner } from "./stencilHitTest";

const stencil = (width: number, height: number): Stencil => ({
  id: "s",
  presetId: "emoji",
  shapeType: "emoji",
  label: "🙂",
  x: 0,
  y: 0,
  width,
  height,
  rotation: 0,
  pinned: false,
});

describe("isNearStencilCorner", () => {
  it("uses a hit radius in screen pixels, independent of zoom", () => {
    const s = stencil(1000, 1000);
    expect(isNearStencilCorner(500 - 10, 500, s, 1)).toBe(true);
    expect(isNearStencilCorner(500 - 20, 500, s, 1)).toBe(false);
    // At zoom 4, 20 world units are 80 screen pixels away
    expect(isNearStencilCorner(500 - 20, 500, s, 4)).toBe(false);
    // At zoom 0.1, 20 world units are only 2 screen pixels away
    expect(isNearStencilCorner(500 - 20, 500, s, 0.1)).toBe(true);
  });

  it("keeps the middle of a small stencil draggable", () => {
    const s = stencil(10, 10);
    expect(isNearStencilCorner(0, 0, s, 1)).toBe(false);
    expect(isNearStencilCorner(5, 5, s, 1)).toBe(true);
  });

  it("respects the stencil rotation", () => {
    const s = { ...stencil(200, 100), rotation: Math.PI / 2 };
    expect(isNearStencilCorner(50, 100, s, 1)).toBe(true);
    expect(isNearStencilCorner(100, 50, s, 1)).toBe(false);
  });
});
