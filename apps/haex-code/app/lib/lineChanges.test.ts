import { describe, expect, it } from "vitest";
import { computeLineChanges } from "./lineChanges";

describe("computeLineChanges", () => {
  it("reports nothing for identical content", () => {
    expect(computeLineChanges("a\nb\n", "a\nb\n")).toEqual([]);
  });

  it("marks appended lines as added", () => {
    expect(computeLineChanges("a\n", "a\nb\nc\n")).toEqual([
      { line: 2, type: "added" },
      { line: 3, type: "added" },
    ]);
  });

  it("marks replaced lines as modified", () => {
    expect(computeLineChanges("a\nb\nc\n", "a\nB\nc\n")).toEqual([{ line: 2, type: "modified" }]);
  });

  it("marks removed lines at the following line", () => {
    expect(computeLineChanges("a\nb\nc\n", "a\nc\n")).toEqual([{ line: 2, type: "deleted" }]);
  });
});
