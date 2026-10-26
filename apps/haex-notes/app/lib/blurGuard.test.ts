import { describe, expect, it } from "vitest";
import { createBlurGuard } from "./blurGuard";

describe("createBlurGuard", () => {
  it("lets the blur of the opening click pass without ending the input", () => {
    const guard = createBlurGuard();
    expect(guard.endsInput()).toBe(false);
  });

  it("ends the input on a blur once the field has taken the focus back", () => {
    const guard = createBlurGuard();
    guard.arm();
    expect(guard.endsInput()).toBe(true);
  });
});
