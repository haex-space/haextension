import { blob, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";

export const tableName = (name: string) => getTableName(manifest.publicKey, packageJson.name, name);

/**
 * The picture library, synced between the user's devices. The id is the SHA-256 of the original
 * file, so the same file added on two devices is one row and a sync never meets two rows for one
 * picture. `data` is the re-encoded copy (at most 1 MiB), `thumbnail` a small copy for the grid.
 */
export const pictures = sqliteTable(tableName("pictures"), {
  id: text().primaryKey(),
  name: text().notNull(),
  width: integer().notNull(),
  height: integer().notNull(),
  mimeType: text("mime_type").notNull(),
  data: blob().notNull(),
  thumbnail: blob().notNull(),
  addedAt: text("added_at").notNull(),
});
