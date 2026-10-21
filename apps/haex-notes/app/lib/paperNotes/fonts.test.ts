import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_HANDWRITING, HANDWRITING_STYLES, NEUTRAL_FAMILY } from "./fonts";

const publicDir = fileURLToPath(new URL("../../../public/", import.meta.url));

describe("handwriting styles", () => {
  it("ship each font with its license", () => {
    for (const { file } of HANDWRITING_STYLES) {
      expect(existsSync(publicDir + file), file).toBe(true);
    }
    for (const license of ["Caveat-OFL.txt", "PatrickHand-OFL.txt", "Kalam-OFL.txt", "SOURCE.md"]) {
      expect(existsSync(`${publicDir}fonts/${license}`), license).toBe(true);
    }
  });

  it("have distinct names, a handwriting default and a neutral fallback", () => {
    const families = HANDWRITING_STYLES.map((style) => style.family);
    expect(new Set(families).size).toBe(families.length);
    expect(families).toContain(DEFAULT_HANDWRITING);
    expect(families).not.toContain(NEUTRAL_FAMILY);
  });
});
