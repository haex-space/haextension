import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "./url";

describe("safeExternalUrl", () => {
  it("keeps web and mail links", () => {
    expect(safeExternalUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeExternalUrl("mailto:a@b.de")).toBe("mailto:a@b.de");
  });

  it("drops script, data and unparsable URLs", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});
