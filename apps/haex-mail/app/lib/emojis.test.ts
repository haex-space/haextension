import { describe, expect, it } from "vitest";
import { EMOJI_GROUPS } from "./emojis";

describe("EMOJI_GROUPS", () => {
  const all = EMOJI_GROUPS.flatMap((g) => g.emojis);

  it("holds whole emojis, never a lone variation selector or joiner", () => {
    for (const e of all) {
      expect(e.replace(/[\uFE0F\u200D]/g, "")).not.toBe("");
      expect(/\p{Extended_Pictographic}/u.test(e)).toBe(true);
    }
  });

  it("lists each emoji once", () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it("has a group icon for every group", () => {
    for (const g of EMOJI_GROUPS) expect(g.icon).toBeTruthy();
  });
});
