import { describe, expect, it } from "vitest";
import { bytesToDataUrl, imageMimeType } from "./dataUrl";

describe("bytesToDataUrl", () => {
  it("base64-encodes the bytes with the given MIME type", () => {
    const bytes = new TextEncoder().encode("hello");
    expect(bytesToDataUrl(bytes, "image/png")).toBe("data:image/png;base64,aGVsbG8=");
  });

  it("handles files larger than one conversion chunk", () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(bytesToDataUrl(bytes, "image/jpeg")).toBe(`data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`);
  });
});

describe("imageMimeType", () => {
  it("maps known image extensions case-insensitively", () => {
    expect(imageMimeType("/a/b/photo.JPG")).toBe("image/jpeg");
    expect(imageMimeType("scan.webp")).toBe("image/webp");
  });

  it("defaults to PNG", () => {
    expect(imageMimeType("/a/b/file")).toBe("image/png");
  });
});
