import { describe, expect, it } from "vitest";
import { assetRelPath, extensionFor, sha256Hex } from "./assetPath";

describe("sha256Hex", () => {
  it("hashes empty input to the known SHA-256 of the empty string", async () => {
    await expect(sha256Hex(new Uint8Array())).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is stable for the same bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await expect(sha256Hex(bytes)).resolves.toBe(await sha256Hex(bytes));
  });
});

describe("extensionFor", () => {
  it("maps known mime types", () => {
    expect(extensionFor("application/pdf")).toBe("pdf");
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("IMAGE/PNG")).toBe("png");
  });

  it("falls back to the file name", () => {
    expect(extensionFor("application/octet-stream", "scan.tiff")).toBe("tiff");
  });

  it("falls back to bin for unusable input", () => {
    expect(extensionFor("application/octet-stream")).toBe("bin");
    expect(extensionFor("application/octet-stream", "no-extension")).toBe("bin");
    expect(extensionFor("application/octet-stream", "weird.this-is-not-an-ext")).toBe("bin");
  });
});

const HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("assetRelPath", () => {
  it("shards by the first two hash characters", () => {
    expect(assetRelPath(HASH, "pdf")).toBe(`e3/${HASH}.pdf`);
  });

  it("rejects a hash that is not 64 lowercase hex characters", () => {
    // Asset-Zeilen kommen auch aus Shared Spaces; der Hash darf den Pfad nicht verlassen.
    expect(() => assetRelPath("../../../../home/u/secret", "txt")).toThrow();
    expect(() => assetRelPath(HASH.toUpperCase(), "pdf")).toThrow();
    expect(() => assetRelPath("abcdef1234", "pdf")).toThrow();
  });
});
