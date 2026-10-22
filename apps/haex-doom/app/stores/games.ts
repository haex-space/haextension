import { arrayBufferToBase64, base64ToArrayBuffer } from "@haex-space/vault-sdk";
import { tableName } from "~/database/schemas";
import { BUNDLED_GAMES, type GameFamily } from "~/lib/bundledGames";
import { checkWad, fingerprint, type WadRejection } from "~/lib/wad";

const FILES = tableName("game_files_no_sync");
const CHUNKS = tableName("game_file_chunks_no_sync");
const CHUNK_SIZE = 1024 * 1024;

export interface PlayableGame {
  id: string;
  title: string;
  fileName: string;
  family: GameFamily;
  fingerprint: string;
  /** Bundled games load from this asset; imported ones from the vault. */
  asset?: string;
}

export type ImportResult =
  | { ok: true; title: string }
  | { ok: false; reason: WadRejection | "already-available" | "storage-failed" };

/** Bundled games plus the base games imported on this device (FR-004, FR-021–FR-025). */
export const useGamesStore = defineStore("games", () => {
  const vault = useHaexVaultStore();
  const imported = ref<PlayableGame[]>([]);

  const all = computed<PlayableGame[]>(() => [
    ...BUNDLED_GAMES.map((game) => ({ ...game })),
    ...imported.value,
  ]);

  async function load(): Promise<void> {
    await vault.initializeAsync();
    // The host returns each row as an array of column values, in SELECT order.
    const rows = await vault.client.database.query<[string, string, string, GameFamily]>(
      `SELECT fingerprint, title, file_name, family FROM "${FILES}" ORDER BY title`,
    );
    imported.value = rows.map(([fp, title, fileName, family]) => ({ id: fp, title, fileName, family, fingerprint: fp }));
  }

  async function importFile(file: File): Promise<ImportResult> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkWad(bytes, file.name);
    if (!check.ok) return check;

    const fp = await fingerprint(bytes);
    if (all.value.some((game) => game.fingerprint === fp)) return { ok: false, reason: "already-available" };

    try {
      await storeFile(fp, bytes, check);
    } catch (error) {
      console.error("[haex-doom] Could not store the game file:", error);
      await removeChunks(fp).catch(() => {});
      return { ok: false, reason: "storage-failed" };
    }
    await load();
    return { ok: true, title: check.title };
  }

  /**
   * Chunks first, the listing row last: a file only shows up once it is complete, and an
   * interrupted import leaves nothing the player can pick.
   */
  async function storeFile(fp: string, bytes: Uint8Array, check: { title: string; family: GameFamily; fileName: string }) {
    const count = Math.ceil(bytes.length / CHUNK_SIZE);
    for (let index = 0; index < count; index++) {
      const chunk = bytes.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      await vault.client.database.execute(
        `INSERT INTO "${CHUNKS}" (fingerprint, chunk_index, data) VALUES (?, ?, ?)
         ON CONFLICT (fingerprint, chunk_index) DO UPDATE SET data = excluded.data`,
        [fp, index, { $bytes: arrayBufferToBase64(chunk) }],
      );
    }
    await vault.client.database.execute(
      `INSERT INTO "${FILES}" (fingerprint, title, family, file_name, size, chunk_count, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fp, check.title, check.family, check.fileName, bytes.length, count, new Date().toISOString()],
    );
  }

  function removeChunks(fp: string) {
    return vault.client.database.execute(`DELETE FROM "${CHUNKS}" WHERE fingerprint = ?`, [fp]);
  }

  /** Removes an imported game; its saves stay until the player deletes them (FR-025). */
  async function remove(fp: string): Promise<void> {
    await vault.client.database.execute(`DELETE FROM "${FILES}" WHERE fingerprint = ?`, [fp]);
    await removeChunks(fp);
    await load();
  }

  /** Reassembles an imported file chunk by chunk and checks it is complete. */
  async function loadImported(fp: string): Promise<Uint8Array> {
    await vault.initializeAsync();
    const meta = await vault.client.database.query<[number, number]>(
      `SELECT size, chunk_count FROM "${FILES}" WHERE fingerprint = ?`,
      [fp],
    );
    const [size, count] = meta[0] ?? [];
    if (size === undefined || count === undefined) throw new Error(`Game file ${fp} is not imported`);

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (let index = 0; index < count; index++) {
      const rows = await vault.client.database.query<[string]>(
        `SELECT data FROM "${CHUNKS}" WHERE fingerprint = ? AND chunk_index = ?`,
        [fp, index],
      );
      const chunk = rows[0] ? base64ToArrayBuffer(rows[0][0]) : null;
      if (!chunk || offset + chunk.length > size) throw new Error(`Game file ${fp} is damaged at chunk ${index}`);
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (offset !== size) throw new Error(`Game file ${fp} is incomplete`);
    return bytes;
  }

  return { all, load, importFile, remove, loadImported };
});
