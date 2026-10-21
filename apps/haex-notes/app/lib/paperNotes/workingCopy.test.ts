import { describe, expect, it } from "vitest";
import { MAX_EDGE, qualityOf, stretchLevels, toBase64, workingSize } from "./workingCopy";

/** An RGBA image from a gray value per pixel. */
function image(width: number, height: number, gray: (x: number, y: number) => number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = gray(x, y);
      pixels.set([value, value, value, 255], i);
    }
  }
  return pixels;
}

describe("workingSize", () => {
  it("swaps the sides of a quarter turn and shrinks to the longest edge", () => {
    expect(workingSize(4000, 3000, 90)).toEqual({ width: 1536, height: 2048, scale: MAX_EDGE / 4000 });
    expect(workingSize(4000, 3000, 180)).toEqual({ width: 2048, height: 1536, scale: MAX_EDGE / 4000 });
  });

  it("never enlarges a small photo", () => {
    expect(workingSize(800, 600, 0)).toEqual({ width: 800, height: 600, scale: 1 });
  });
});

describe("qualityOf", () => {
  it("finds nothing wrong with sharp handwriting on white paper", () => {
    const page = image(64, 64, (x, y) => ((x + y) % 7 === 0 ? 20 : 235));
    expect(qualityOf(page, 64, 64)).toEqual([]);
  });

  it("says when a photo is dark, flat or blurred", () => {
    expect(qualityOf(image(32, 32, (x) => (x % 4 === 0 ? 10 : 50)), 32, 32)).toContain("dark");
    expect(qualityOf(image(32, 32, () => 128), 32, 32)).toContain("lowContrast");
    const blurred = image(64, 64, (x) => 60 + x * 2);
    expect(qualityOf(blurred, 64, 64)).toEqual(["blurry"]);
  });
});

describe("stretchLevels", () => {
  it("stretches a grey photo to black and white", () => {
    const pixels = image(10, 10, (x) => 100 + x * 5);
    stretchLevels(pixels);
    const values = [...pixels].filter((_, i) => i % 4 === 0);
    expect(Math.min(...values)).toBe(0);
    expect(Math.max(...values)).toBe(255);
  });

  it("leaves an even photo as it is", () => {
    const pixels = image(4, 4, () => 128);
    stretchLevels(pixels);
    expect(pixels[0]).toBe(128);
  });
});

describe("toBase64", () => {
  it("encodes bytes, also beyond one chunk", () => {
    expect(toBase64(new Uint8Array([65, 66, 67]))).toBe("QUJD");
    const large = new Uint8Array(0x8000 * 2 + 3).fill(65);
    expect(atob(toBase64(large))).toHaveLength(large.length);
  });
});
