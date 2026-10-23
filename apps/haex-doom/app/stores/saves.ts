import { arrayBufferToBase64, base64ToArrayBuffer } from "@haex-space/vault-sdk";
import { tableName } from "~/database/schemas";
import { saveId } from "~/lib/saveStore";

const SAVES = tableName("saves");

/** Save games in the synced `saves` table (FR-018, FR-046). Binary data goes over the bridge as `$bytes`. */
export const useSavesStore = defineStore("saves", () => {
  const vault = useHaexVaultStore();

  /** The saves of one game by slot, ready to be written into the engine's file system. */
  async function listForGame(fingerprint: string): Promise<Map<number, Uint8Array>> {
    await vault.initializeAsync();
    // The host returns each row as an array of column values, in SELECT order.
    const rows = await vault.client.database.query<[number, string]>(
      `SELECT slot, data FROM "${SAVES}" WHERE game_fingerprint = ?`,
      [fingerprint],
    );
    return new Map(rows.map(([slot, data]) => [slot, base64ToArrayBuffer(data)]));
  }

  /**
   * Writes one save as a single statement, so a failure leaves the previous save of the slot as it
   * was (FR-020) and a sync conflict keeps one whole save, never a mix.
   */
  async function upsert(fingerprint: string, slot: number, name: string, data: Uint8Array): Promise<void> {
    await vault.initializeAsync();
    await vault.client.database.execute(
      `INSERT INTO "${SAVES}" (id, game_fingerprint, slot, name, data, saved_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         game_fingerprint = excluded.game_fingerprint, slot = excluded.slot, name = excluded.name,
         data = excluded.data, saved_at = excluded.saved_at`,
      [saveId(fingerprint, slot), fingerprint, slot, name, { $bytes: arrayBufferToBase64(data) }, new Date().toISOString()],
    );
  }

  async function remove(fingerprint: string, slot: number): Promise<void> {
    await vault.initializeAsync();
    await vault.client.database.execute(`DELETE FROM "${SAVES}" WHERE id = ?`, [saveId(fingerprint, slot)]);
  }

  return { listForGame, upsert, remove };
});
