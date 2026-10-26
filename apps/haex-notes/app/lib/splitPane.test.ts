import { describe, expect, it } from "vitest";
import { clampFraction, SPLIT, splitFraction } from "./splitPane";

describe("splitFraction", () => {
  const area = { left: 100, right: 1100 };

  it("gives the attachment everything to the right of the line", () => {
    expect(splitFraction(600, area)).toBeCloseTo(0.5);
    expect(splitFraction(800, area)).toBeCloseTo(0.3);
  });

  it("keeps both the page and the attachment visible", () => {
    expect(splitFraction(110, area)).toBe(SPLIT.max);
    expect(splitFraction(1090, area)).toBe(SPLIT.min);
    expect(splitFraction(5000, area)).toBe(SPLIT.min);
    expect(splitFraction(-5000, area)).toBe(SPLIT.max);
  });

  it("falls back to the default for an area without width", () => {
    expect(splitFraction(10, { left: 50, right: 50 })).toBe(SPLIT.default);
    expect(splitFraction(10, { left: 80, right: 20 })).toBe(SPLIT.default);
  });
});

describe("clampFraction", () => {
  it("keeps a value in the limits and takes the default for anything else", () => {
    expect(clampFraction(0.5)).toBe(0.5);
    expect(clampFraction(0.01)).toBe(SPLIT.min);
    expect(clampFraction(3)).toBe(SPLIT.max);
    for (const bad of [undefined, null, "0.5", Number.NaN, Infinity]) expect(clampFraction(bad)).toBe(SPLIT.default);
  });
});
