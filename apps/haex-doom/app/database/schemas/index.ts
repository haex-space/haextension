import { blob, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";

export const tableName = (name: string) => getTableName(manifest.publicKey, packageJson.name, name);

/**
 * Save games, synced between the user's devices (FR-018). The id is `<fingerprint>:<slot>`, so
 * the same slot saved on two devices is one row and the sync keeps the later write (FR-046).
 */
export const saves = sqliteTable(
  tableName("saves"),
  {
    id: text().primaryKey(),
    gameFingerprint: text("game_fingerprint").notNull(),
    slot: integer().notNull(),
    name: text().notNull(),
    data: blob().notNull(),
    savedAt: text("saved_at").notNull(),
  },
  (table) => [uniqueIndex(`${tableName("saves")}_game_slot`).on(table.gameFingerprint, table.slot)],
);
