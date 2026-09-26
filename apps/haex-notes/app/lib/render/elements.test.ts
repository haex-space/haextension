import { describe, expect, it } from "vitest";
import { strokeOutlineToPath } from "./elements";

describe("strokeOutlineToPath", () => {
  it("returns an empty string for fewer than two points", () => {
    expect(strokeOutlineToPath([])).toBe("");
    expect(strokeOutlineToPath([[0, 0]])).toBe("");
  });

  it("starts with a move and closes the path", () => {
    const path = strokeOutlineToPath([[0, 0], [10, 0], [10, 10]]);
    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });
});
