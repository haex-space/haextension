import { describe, expect, it } from "vitest";
import { setConfigValue, widescreenFor, WIDESCREEN } from "./engineConfig";

describe("widescreenFor", () => {
  it("keeps 4:3 for areas narrower than 16:10", () => {
    expect(widescreenFor(1024, 768)).toBe(WIDESCREEN.off);
  });

  it("picks the widest ratio that fits", () => {
    expect(widescreenFor(1280, 800)).toBe(WIDESCREEN.ratio16x10);
    expect(widescreenFor(1920, 1080)).toBe(WIDESCREEN.ratio16x9);
    expect(widescreenFor(2560, 1080)).toBe(WIDESCREEN.ratio21x9);
  });

  it("falls back to 4:3 for an area without a size", () => {
    expect(widescreenFor(0, 0)).toBe(WIDESCREEN.off);
    expect(widescreenFor(800, Number.NaN)).toBe(WIDESCREEN.off);
  });
});

describe("setConfigValue", () => {
  it("replaces an existing value and keeps the other lines", () => {
    const text = "fullscreen                    0\ncrispy_widescreen             1\n";
    expect(setConfigValue(text, "crispy_widescreen", 3)).toBe(
      "fullscreen                    0\ncrispy_widescreen             3\n",
    );
  });

  it("does not match a name that only starts with the wanted one", () => {
    const text = "crispy_widescreen_x           1\n";
    expect(setConfigValue(text, "crispy_widescreen", 2)).toBe(
      "crispy_widescreen_x           1\ncrispy_widescreen             2\n",
    );
  });

  it("appends to a file without a trailing newline", () => {
    expect(setConfigValue("novert 1", "grabmouse", 0)).toBe("novert 1\ngrabmouse                     0\n");
  });
});
