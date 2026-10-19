import { describe, expect, it } from "vitest";
import { clampSide, parseSide } from "./dimensions";

describe("parseSide", () => {
  it("rejects blank and non-numeric input", () => {
    expect(parseSide("")).toBeNull();
    expect(parseSide("  ")).toBeNull();
    expect(parseSide("abc")).toBeNull();
  });

  it("rounds to whole pixels and clamps to 1…10000", () => {
    expect(parseSide("12.6")).toBe(13);
    expect(parseSide("0")).toBe(1);
    expect(parseSide("-40")).toBe(1);
    expect(parseSide("25000")).toBe(10000);
  });
});

describe("clampSide", () => {
  it("never returns less than one pixel", () => {
    expect(clampSide(0.2)).toBe(1);
  });
});
