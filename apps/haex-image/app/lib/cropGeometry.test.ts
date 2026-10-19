import { describe, expect, it } from "vitest";
import { resizeCropRect } from "./cropGeometry";

const rect = { x: 100, y: 100, width: 200, height: 200 };
const bounds = { width: 1000, height: 1000 };

describe("resizeCropRect", () => {
  it("moves only the dragged corner without a ratio", () => {
    expect(resizeCropRect(rect, "br", 350, 320, null, bounds)).toEqual({ x: 100, y: 100, width: 250, height: 220 });
  });

  it("keeps the opposite corner fixed when a ratio shrinks a top-left drag", () => {
    expect(resizeCropRect(rect, "tl", 50, 80, 1, bounds)).toEqual({ x: 80, y: 80, width: 220, height: 220 });
  });

  it("keeps a bottom-edge drag with a wide ratio inside a portrait image", () => {
    const result = resizeCropRect({ x: 0, y: 0, width: 320, height: 180 }, "b", 0, 900, 16 / 9, { width: 1000, height: 2000 });
    expect(result).toEqual({ x: 0, y: 0, width: 1000, height: 563 });
  });

  it("keeps a left-edge drag with a tall ratio inside a landscape image", () => {
    const result = resizeCropRect({ x: 1800, y: 0, width: 180, height: 320 }, "l", 100, 0, 9 / 16, { width: 2000, height: 1000 });
    expect(result.height).toBe(1000);
    expect(result.width).toBe(562);
    expect(result.x + result.width).toBe(1980);
    expect(result.y).toBe(0);
  });

  it("never lets an edge pass its opposite edge", () => {
    expect(resizeCropRect(rect, "l", 900, 0, null, bounds)).toEqual({ x: 299, y: 100, width: 1, height: 200 });
  });
});
