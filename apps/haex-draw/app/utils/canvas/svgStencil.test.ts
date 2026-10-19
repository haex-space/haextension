import { describe, expect, it } from "vitest";
import { parseSvgViewBox, svgPathMatrix } from "./svgStencil";

const apply = ([a, b, c, d, e, f]: number[], x: number, y: number) => [a! * x + c! * y + e!, b! * x + d! * y + f!];

describe("svgPathMatrix", () => {
  it("maps the view box onto the stencil box centered at the origin", () => {
    const m = svgPathMatrix(150, 75, { x: 0, y: 0, width: 24, height: 12 });
    expect(apply(m, 0, 0)).toEqual([-150, -75]);
    expect(apply(m, 24, 12)).toEqual([150, 75]);
    expect(apply(m, 12, 6)).toEqual([0, 0]);
  });

  it("honours a view box origin other than zero", () => {
    const m = svgPathMatrix(50, 50, { x: -10, y: 20, width: 20, height: 20 });
    expect(apply(m, -10, 20)).toEqual([-50, -50]);
    expect(apply(m, 10, 40)).toEqual([50, 50]);
  });

  it("only centers paths of stencils saved without a view box", () => {
    expect(svgPathMatrix(12, 8)).toEqual([1, 0, 0, 1, -12, -8]);
  });
});

describe("parseSvgViewBox", () => {
  it("reads all four view box values", () => {
    expect(parseSvgViewBox("-5 10 24 48", null, null)).toEqual({ x: -5, y: 10, width: 24, height: 48 });
    expect(parseSvgViewBox("0,0,100,50", "10", "10")).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it("falls back to width and height", () => {
    expect(parseSvgViewBox(null, "32px", "16")).toEqual({ x: 0, y: 0, width: 32, height: 16 });
    expect(parseSvgViewBox("0 0 nope 5", "40", "20")).toEqual({ x: 0, y: 0, width: 40, height: 20 });
  });

  it("rejects SVGs without a usable size", () => {
    expect(parseSvgViewBox(null, null, null)).toBeNull();
    expect(parseSvgViewBox("0 0 0 10", "0", "10")).toBeNull();
  });
});
