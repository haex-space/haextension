import { describe, expect, it } from "vitest";
import { formatBytes } from "./fileSize";

describe("formatBytes", () => {
  it("writes bytes without a fraction and larger sizes with one decimal", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536, "de")).toBe("1,5 KB");
    expect(formatBytes(1536, "en")).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024, "en")).toBe("2.0 MB");
  });

  it("names nothing for a size nobody knows", () => {
    expect(formatBytes(-1)).toBe("");
    expect(formatBytes(Number.NaN)).toBe("");
  });
});
