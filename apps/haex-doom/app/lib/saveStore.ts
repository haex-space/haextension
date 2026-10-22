/** Where the engine keeps the saves of one game (contracts/engine-bridge.md). */
export function saveDirectory(fingerprint: string): string {
  return `/saves/${fingerprint}/`;
}

export function savePath(fingerprint: string, slot: number): string {
  return `${saveDirectory(fingerprint)}doomsav${slot}.dsg`;
}

/** The row id of a save; the same slot on two devices is one row (FR-046). */
export function saveId(fingerprint: string, slot: number): string {
  return `${fingerprint}:${slot}`;
}

const SAVE_PATH = /^\/saves\/([0-9a-f]{64})\/+doomsav([0-7])\.dsg$/;

/** The game and slot of a save file the engine wrote, or null for any other file. */
export function parseSavePath(path: string): { fingerprint: string; slot: number } | null {
  const match = SAVE_PATH.exec(path);
  if (!match) return null;
  return { fingerprint: match[1]!, slot: Number(match[2]) };
}

/** Length of the description at the start of a save (SAVESTRINGSIZE in upstream src/doom). */
const SAVESTRINGSIZE = 24;

/** The name the player typed when saving, read from the save's header. */
export function saveDescription(data: Uint8Array): string {
  const header = data.subarray(0, SAVESTRINGSIZE);
  const end = header.indexOf(0);
  return new TextDecoder("latin1").decode(end === -1 ? header : header.subarray(0, end)).trim();
}
