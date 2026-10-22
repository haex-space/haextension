import { blob, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
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

/**
 * Game files the user imported (FR-021). They stay on this device: they are large and
 * copyrighted, so `_no_sync` keeps them out of the sync.
 */
export const gameFiles = sqliteTable(tableName("game_files_no_sync"), {
  fingerprint: text().primaryKey(),
  title: text().notNull(),
  family: text().notNull(),
  fileName: text("file_name").notNull(),
  size: integer().notNull(),
  chunkCount: integer("chunk_count").notNull(),
  importedAt: text("imported_at").notNull(),
});

/** The imported file in 1 MiB pieces, read one at a time to stay under the bridge's response limit. */
export const gameFileChunks = sqliteTable(
  tableName("game_file_chunks_no_sync"),
  {
    fingerprint: text().notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    data: blob().notNull(),
  },
  (table) => [primaryKey({ columns: [table.fingerprint, table.chunkIndex] })],
);
