import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("uses the message of Error instances and host error objects", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage({ code: 1002, message: "Permission denied" })).toBe("Permission denied");
  });

  it("never renders [object Object]", () => {
    expect(getErrorMessage({ code: 7 })).toBe('{"code":7}');
    expect(getErrorMessage("plain")).toBe("plain");
  });
});
