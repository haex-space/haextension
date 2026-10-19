import { describe, expect, it } from "vitest";
import { adjustmentsPixelFn, filterPixel, hasAdjustments } from "./pixelOps";

const neutral = { brightness: 0, contrast: 0, saturation: 0 };

describe("hasAdjustments", () => {
  it("is false only when every slider is at zero", () => {
    expect(hasAdjustments(neutral)).toBe(false);
    expect(hasAdjustments({ ...neutral, contrast: -1 })).toBe(true);
  });
});

describe("adjustmentsPixelFn", () => {
  it("leaves pixels unchanged at neutral settings", () => {
    const [r, g, b] = adjustmentsPixelFn(neutral)(10, 128, 250);
    expect(r).toBeCloseTo(10);
    expect(g).toBeCloseTo(128);
    expect(b).toBeCloseTo(250);
  });

  it("shifts every channel by 2.55 per brightness step", () => {
    expect(adjustmentsPixelFn({ ...neutral, brightness: 10 })(100, 100, 100)).toEqual([125.5, 125.5, 125.5]);
  });

  it("turns a colour into its luminance at saturation -100", () => {
    const [r, g, b] = adjustmentsPixelFn({ ...neutral, saturation: -100 })(255, 0, 0);
    expect(r).toBeCloseTo(0.2126 * 255);
    expect(g).toBeCloseTo(r);
    expect(b).toBeCloseTo(r);
  });
});

describe("filterPixel", () => {
  it("keeps the pixel for 'none'", () => {
    expect(filterPixel("none", 1, 2, 3)).toEqual([1, 2, 3]);
  });

  it("inverts each channel", () => {
    expect(filterPixel("invert", 0, 100, 255)).toEqual([255, 155, 0]);
  });

  it("maps grayscale to the luminance on all channels", () => {
    const [r, g, b] = filterPixel("grayscale", 255, 255, 255);
    expect(r).toBeCloseTo(255);
    expect(g).toBe(r);
    expect(b).toBe(r);
  });
});
