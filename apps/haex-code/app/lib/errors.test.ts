import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("uses the message of an Error", () => {
    expect(errorMessage(new Error("disk full"))).toBe("disk full");
  });

  it("uses the message of a plain error object from the host", () => {
    expect(errorMessage({ code: 1002, message: "permission denied" })).toBe("permission denied");
  });

  it("falls back to the string form", () => {
    expect(errorMessage("timeout")).toBe("timeout");
    expect(errorMessage({ code: 1 })).toBe("[object Object]");
  });
});
