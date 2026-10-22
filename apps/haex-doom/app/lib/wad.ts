import type { GameFamily } from "./bundledGames";

export type WadRejection = "too-small" | "not-wad" | "pwad" | "truncated" | "unknown-game";

export type WadCheck =
  | { ok: true; family: GameFamily; title: string; fileName: string }
  | { ok: false; reason: WadRejection };

/**
 * Base games by the file name the engine recognises them by. The engine picks the game (level
 * names, intermission texts) from the name, so an imported file keeps its known name; the lumps
 * only have to fit the family.
 */
const KNOWN_FILES: Record<string, { family: GameFamily; title: string }> = {
  "doom2.wad": { family: "doom2", title: "DOOM II" },
  "tnt.wad": { family: "doom2", title: "Final DOOM: TNT – Evilution" },
  "plutonia.wad": { family: "doom2", title: "Final DOOM: The Plutonia Experiment" },
  "freedoom2.wad": { family: "doom2", title: "Freedoom: Phase 2" },
  "doom.wad": { family: "doom1", title: "DOOM" },
  "doom1.wad": { family: "doom1", title: "DOOM (shareware)" },
  "freedoom1.wad": { family: "doom1", title: "Freedoom: Phase 1" },
};

const HEADER_SIZE = 12;
const DIRECTORY_ENTRY_SIZE = 16;

/** Lump names of the file's directory, or a rejection when the file is not a usable WAD. */
function readLumpNames(bytes: Uint8Array): Set<string> | WadRejection {
  if (bytes.length < HEADER_SIZE) return "too-small";
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic === "PWAD") return "pwad";
  if (magic !== "IWAD") return "not-wad";

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getInt32(4, true);
  const directory = view.getInt32(8, true);
  if (count <= 0 || directory < HEADER_SIZE || directory + count * DIRECTORY_ENTRY_SIZE > bytes.length) {
    return "truncated";
  }

  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    const entry = directory + i * DIRECTORY_ENTRY_SIZE;
    const offset = view.getInt32(entry, true);
    const size = view.getInt32(entry + 4, true);
    if (offset < 0 || size < 0 || offset + size > bytes.length) return "truncated";
    const raw = bytes.subarray(entry + 8, entry + 16);
    const end = raw.indexOf(0);
    names.add(String.fromCharCode(...(end === -1 ? raw : raw.subarray(0, end))).toUpperCase());
  }
  return names;
}

function familyOf(lumps: Set<string>): GameFamily | null {
  if (lumps.has("MAP01")) return "doom2";
  if (lumps.has("E1M1")) return "doom1";
  return null;
}

function doom1Title(lumps: Set<string>): string {
  if (lumps.has("E4M1")) return "The Ultimate DOOM";
  if (lumps.has("E2M1")) return "DOOM";
  return "DOOM (shareware)";
}

/**
 * Checks a file the user picked and names the game in it (FR-022, FR-023). Modification files
 * (PWADs) need a base game and are rejected as such.
 */
export function checkWad(bytes: Uint8Array, pickedName: string): WadCheck {
  const lumps = readLumpNames(bytes);
  if (typeof lumps === "string") return { ok: false, reason: lumps };

  const family = familyOf(lumps);
  if (!family) return { ok: false, reason: "unknown-game" };

  const known = KNOWN_FILES[pickedName.toLowerCase()];
  if (known && known.family === family) {
    const title = pickedName.toLowerCase() === "doom.wad" ? doom1Title(lumps) : known.title;
    return { ok: true, family, title, fileName: pickedName.toLowerCase() };
  }

  // Unknown or misleading name: the lumps decide, under the engine's generic name.
  return family === "doom2"
    ? { ok: true, family, title: "DOOM II (compatible)", fileName: "doom2.wad" }
    : { ok: true, family, title: doom1Title(lumps), fileName: lumps.has("E2M1") ? "doom.wad" : "doom1.wad" };
}

/** SHA-256 of the file, lowercase hex: identifies a game file across imports and players. */
export async function fingerprint(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
