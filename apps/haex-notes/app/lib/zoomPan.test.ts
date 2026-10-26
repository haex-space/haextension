import { describe, expect, it } from "vitest";
import { fitView, panBy, zoomAt, ZOOM_RANGE } from "./zoomPan";

describe("fitView", () => {
  it("fits the whole image and centres it", () => {
    expect(fitView({ width: 400, height: 400 }, { width: 200, height: 100 })).toEqual({ scale: 2, x: 0, y: 100 });
    expect(fitView({ width: 400, height: 200 }, { width: 100, height: 200 })).toEqual({ scale: 1, x: 150, y: 0 });
  });

  it("keeps a neutral view for an empty image or box", () => {
    expect(fitView({ width: 400, height: 400 }, { width: 0, height: 0 })).toEqual({ scale: 1, x: 0, y: 0 });
    expect(fitView({ width: 0, height: 0 }, { width: 10, height: 10 })).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe("zoomAt", () => {
  const start = { scale: 1, x: 20, y: 30 };

  it("keeps the point under the pointer on the same spot of the image", () => {
    const at = { x: 120, y: 90 };
    const image = { x: (at.x - start.x) / start.scale, y: (at.y - start.y) / start.scale };
    const zoomed = zoomAt(start, 2, at, 1);
    expect(zoomed.scale).toBe(2);
    expect(image.x * zoomed.scale + zoomed.x).toBeCloseTo(at.x);
    expect(image.y * zoomed.scale + zoomed.y).toBeCloseTo(at.y);
  });

  it("stops at the limits around the fitted scale and still keeps the point", () => {
    expect(zoomAt(start, 1000, { x: 0, y: 0 }, 1).scale).toBe(ZOOM_RANGE.above);
    expect(zoomAt(start, 0.0001, { x: 0, y: 0 }, 1).scale).toBe(ZOOM_RANGE.below);
    const atLimit = zoomAt({ scale: ZOOM_RANGE.above, x: 5, y: 5 }, 2, { x: 50, y: 50 }, 1);
    expect(atLimit).toEqual({ scale: ZOOM_RANGE.above, x: 5, y: 5 });
  });
});

describe("panBy", () => {
  it("moves the image and keeps the scale", () => {
    expect(panBy({ scale: 3, x: 1, y: 2 }, 10, -4)).toEqual({ scale: 3, x: 11, y: -2 });
  });
});
