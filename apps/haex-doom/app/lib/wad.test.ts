import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkWad, fingerprint } from "./wad";

/** A minimal WAD: header, one data byte per lump, then the directory. */
function buildWad(magic: string, lumps: string[]): Uint8Array {
  const directory = 12 + lumps.length;
  const bytes = new Uint8Array(directory + lumps.length * 16);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(magic), 0);
  view.setInt32(4, lumps.length, true);
  view.setInt32(8, directory, true);
  lumps.forEach((name, i) => {
    const entry = directory + i * 16;
    view.setInt32(entry, 12 + i, true);
    view.setInt32(entry + 4, 1, true);
    bytes.set(new TextEncoder().encode(name), entry + 8);
  });
  return bytes;
}

describe("checkWad", () => {
  it("names a known base game by its file name when the lumps fit", () => {
    expect(checkWad(buildWad("IWAD", ["MAP01", "MAP02"]), "TNT.WAD")).toEqual({
      ok: true, family: "doom2", title: "Final DOOM: TNT – Evilution", fileName: "tnt.wad",
    });
  });

  it("tells The Ultimate DOOM from registered DOOM by its fourth episode", () => {
    expect(checkWad(buildWad("IWAD", ["E1M1", "E2M1", "E4M1"]), "DOOM.WAD")).toMatchObject({ title: "The Ultimate DOOM" });
    expect(checkWad(buildWad("IWAD", ["E1M1", "E2M1"]), "doom.wad")).toMatchObject({ title: "DOOM" });
  });

  it("falls back to the lumps under the engine's generic name for an unknown file name", () => {
    expect(checkWad(buildWad("IWAD", ["MAP01"]), "DOOM2_steam.wad")).toEqual({
      ok: true, family: "doom2", title: "DOOM II (compatible)", fileName: "doom2.wad",
    });
    expect(checkWad(buildWad("IWAD", ["E1M1", "E2M1"]), "mydoom.wad")).toMatchObject({ fileName: "doom.wad" });
  });

  it("does not trust a known name whose lumps belong to the other family", () => {
    expect(checkWad(buildWad("IWAD", ["E1M1"]), "doom2.wad")).toMatchObject({ family: "doom1", fileName: "doom1.wad" });
  });

  it("rejects modification files, other files and broken WADs", () => {
    expect(checkWad(buildWad("PWAD", ["MAP01"]), "mod.wad")).toEqual({ ok: false, reason: "pwad" });
    expect(checkWad(new TextEncoder().encode("\x89PNG\r\n\x1a\n0000"), "x.png")).toEqual({ ok: false, reason: "not-wad" });
    expect(checkWad(new Uint8Array(4), "x.wad")).toEqual({ ok: false, reason: "too-small" });
    expect(checkWad(buildWad("IWAD", ["MAP01"]).subarray(0, 20), "doom2.wad")).toEqual({ ok: false, reason: "truncated" });
    expect(checkWad(buildWad("IWAD", ["PLAYPAL", "COLORMAP"]), "doom2.wad")).toEqual({ ok: false, reason: "unknown-game" });
  });

  it("rejects a lump that points past the end of the file", () => {
    const wad = buildWad("IWAD", ["MAP01"]);
    new DataView(wad.buffer).setInt32(13, 1_000_000, true);
    expect(checkWad(wad, "doom2.wad")).toEqual({ ok: false, reason: "truncated" });
  });

  it("rejects a header with no lumps, a directory inside the header or a lump count past the end", () => {
    for (const [field, value] of [[4, 0], [4, -1], [8, 4], [8, -16], [4, 0x7fffffff]] as const) {
      const wad = buildWad("IWAD", ["MAP01"]);
      new DataView(wad.buffer).setInt32(field, value, true);
      expect(checkWad(wad, "doom2.wad")).toEqual({ ok: false, reason: "truncated" });
    }
  });

  it("rejects a lump with a negative offset or size", () => {
    for (const field of [13, 17]) {
      const wad = buildWad("IWAD", ["MAP01"]);
      new DataView(wad.buffer).setInt32(field, -1, true);
      expect(checkWad(wad, "doom2.wad")).toEqual({ ok: false, reason: "truncated" });
    }
  });
});

describe("fingerprint", () => {
  it("is the SHA-256 of the file in lowercase hex", async () => {
    const bytes = buildWad("IWAD", ["MAP01"]);
    expect(await fingerprint(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});
