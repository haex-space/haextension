import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { chunk, getErrorMessage } from "./utils";

describe("getErrorMessage", () => {
  it("reports a failed query by its cause, not by its SQL", () => {
    const err = new DrizzleQueryError("insert into messages values (?)", ["Subject"], {
      message: "database is locked",
    } as Error);
    expect(getErrorMessage(err)).toBe("database is locked");
  });

  it("keeps the query message when there is no cause", () => {
    const err = new DrizzleQueryError("select 1", []);
    expect(getErrorMessage(err)).toBe(err.message);
  });

  it("reads `message` from non-Error objects", () => {
    expect(getErrorMessage({ message: "nope" })).toBe("nope");
  });
});

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
