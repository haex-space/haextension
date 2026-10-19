import { describe, expect, it } from "vitest";
import { chunk } from "./utils";

describe("chunk", () => {
  it("splits into consecutive slices of at most `size`", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns no slices for an empty list", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("keeps a list that fits into one slice", () => {
    expect(chunk([1, 2], 1000)).toEqual([[1, 2]]);
  });
});
