import { describe, expect, it } from "vitest";
import { boxToRect, fitImage, fitInRect, fontSizeFor, MAX_FONT_SIZE, MIN_FONT_SIZE, PAGE_MARGIN, tidy } from "./layout";

describe("fitInRect", () => {
  it("fits a photo into a rectangle, centred across and at its top", () => {
    expect(fitInRect(1000, 500, { x: 100, y: 300, width: 400, height: 400 })).toEqual({ x: 100, y: 300, width: 400, height: 200, scale: 0.4 });
    expect(fitInRect(500, 1000, { x: 100, y: 300, width: 400, height: 400 })).toEqual({ x: 200, y: 300, width: 200, height: 400, scale: 0.4 });
  });
});

describe("fitImage", () => {
  it("fits a photo into the page with a margin, centred and at the top", () => {
    const fit = fitImage(1000, 2000, 794, 1123);
    const scale = (1123 - 2 * PAGE_MARGIN) / 2000;
    expect(fit.scale).toBeCloseTo(scale);
    expect(fit.y).toBe(PAGE_MARGIN);
    expect(fit.x).toBeCloseTo((794 - 1000 * scale) / 2);
  });
});

describe("boxToRect", () => {
  const fit = { x: 40, y: 40, width: 700, height: 1000, scale: 1 };

  it("maps a box of 0–1000 onto the fitted photo", () => {
    expect(boxToRect([100, 200, 600, 300], fit)).toEqual({ x: 110, y: 240, width: 350, height: 100 });
  });

  it("skips a box without area or with the wrong length", () => {
    expect(boxToRect([500, 200, 500, 300], fit)).toBeNull();
    expect(boxToRect([600, 200, 100, 300], fit)).toBeNull();
    expect(boxToRect([1, 2, 3], fit)).toBeNull();
  });
});

describe("tidy", () => {
  it("aligns left edges that are almost the same", () => {
    const rects = tidy([
      { x: 100, y: 0, width: 50, height: 10 },
      { x: 110, y: 20, width: 50, height: 10 },
      { x: 300, y: 40, width: 50, height: 10 },
    ], 794);
    expect(rects.map((r) => r.x)).toEqual([100, 100, 300]);
  });

  it("moves an overlapping region below the one before it, in reading order", () => {
    const rects = tidy([
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 20, y: 40, width: 100, height: 50 },
      { x: 300, y: 10, width: 50, height: 50 },
    ], 794);
    expect(rects[1]!.y).toBe(58);
    expect(rects[2]!.y).toBe(10);
  });

  it("does not change its input", () => {
    const input = [{ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 5, width: 10, height: 10 }];
    tidy(input, 794);
    expect(input[1]!.y).toBe(5);
  });
});

describe("fontSizeFor", () => {
  it("follows the height per line within readable bounds", () => {
    expect(fontSizeFor(50, 2)).toBe(20);
    expect(fontSizeFor(5, 1)).toBe(MIN_FONT_SIZE);
    expect(fontSizeFor(500, 1)).toBe(MAX_FONT_SIZE);
  });
});
