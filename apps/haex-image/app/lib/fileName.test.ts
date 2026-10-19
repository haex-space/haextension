import { describe, expect, it } from "vitest";
import { extensionForType, withExtension } from "./fileName";

describe("withExtension", () => {
  it("replaces the extension of a file name", () => {
    expect(withExtension("photo.webp", "png")).toBe("photo.png");
  });

  it("replaces only the last extension of a path", () => {
    expect(withExtension("/home/me/my.pics/photo.tar.gif", "png")).toBe("/home/me/my.pics/photo.tar.png");
  });

  it("appends an extension when there is none", () => {
    expect(withExtension("/home/me/my.pics/photo", "jpg")).toBe("/home/me/my.pics/photo.jpg");
  });

  it("handles Windows paths", () => {
    expect(withExtension("C:\\Bilder.alt\\scan.bmp", "png")).toBe("C:\\Bilder.alt\\scan.png");
  });

  it("keeps a leading dot of a hidden file", () => {
    expect(withExtension("/tmp/.cover", "png")).toBe("/tmp/.cover.png");
  });
});

describe("extensionForType", () => {
  it("maps the encodable image types to their usual extension", () => {
    expect(extensionForType("image/jpeg")).toBe("jpg");
    expect(extensionForType("image/webp")).toBe("webp");
    expect(extensionForType("image/png")).toBe("png");
  });
});
