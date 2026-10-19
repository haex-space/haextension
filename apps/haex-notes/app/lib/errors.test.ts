import { describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "./errors";

vi.mock("vue-sonner", () => ({ toast: { error: vi.fn() } }));

describe("getErrorMessage", () => {
  it("uses the message of an Error", () => {
    expect(getErrorMessage(new Error("kaputt"))).toBe("kaputt");
  });

  it("uses the message of a plain host error object", () => {
    expect(getErrorMessage({ code: 1002, message: "Permission denied" })).toBe("Permission denied");
  });

  it("stringifies anything else", () => {
    expect(getErrorMessage("offline")).toBe("offline");
  });
});
