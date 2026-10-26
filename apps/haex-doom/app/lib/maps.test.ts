import { describe, expect, it } from "vitest";
import { mapsFor } from "./maps";

describe("mapsFor", () => {
  it("lists 32 maps for DOOM II games", () => {
    const maps = mapsFor({ family: "doom2", title: "Freedoom: Phase 2" });
    expect(maps).toHaveLength(32);
    expect(maps[0]).toBe("MAP01");
    expect(maps[31]).toBe("MAP32");
  });

  it("lists only the first episode of the shareware game", () => {
    const maps = mapsFor({ family: "doom1", title: "DOOM (shareware)" });
    expect(maps).toHaveLength(9);
    expect(maps[8]).toBe("E1M9");
  });

  it("lists three episodes for DOOM and four for the Ultimate DOOM and Freedoom", () => {
    expect(mapsFor({ family: "doom1", title: "DOOM" })).toHaveLength(27);
    expect(mapsFor({ family: "doom1", title: "The Ultimate DOOM" })).toHaveLength(36);
    expect(mapsFor({ family: "doom1", title: "Freedoom: Phase 1" })).toHaveLength(36);
  });
});
