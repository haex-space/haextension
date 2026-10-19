import { describe, expect, it } from "vitest";
import { emojiRasterSize } from "./stencilRenderer";

describe("emojiRasterSize", () => {
  it("never rasterizes below the minimum size", () => {
    expect(emojiRasterSize(40, 80)).toBe(128);
    expect(emojiRasterSize(128, 128)).toBe(128);
  });

  it("rounds up to the next power of two so resizing reuses a few rasters", () => {
    expect(emojiRasterSize(129, 400)).toBe(256);
    expect(emojiRasterSize(300, 500)).toBe(512);
    expect(emojiRasterSize(700, 701)).toBe(1024);
  });

  it("caps the raster size for huge stencils", () => {
    expect(emojiRasterSize(5000, 5000)).toBe(1024);
  });

  it("maps every size of a continuous resize to at most four rasters", () => {
    const sizes = new Set<number>();
    for (let s = 10; s <= 5000; s++) sizes.add(emojiRasterSize(s, s));
    expect([...sizes].sort((a, b) => a - b)).toEqual([128, 256, 512, 1024]);
  });
});
