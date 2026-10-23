import { sql } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { assets, type InsertAsset } from "~/database/schemas";

/**
 * Legt ein Asset an, es sei denn, es gibt schon eines mit demselben Hash.
 *
 * Das Konfliktziel ist ein einfacher Spaltenname: der SQL-Check des Tresors liest nur diese Form,
 * und eine Spalte als Ziel rendert drizzle mit Tabellenname (`"tabelle"."sha256"`), was ihn als
 * Syntaxfehler abweist. Dann würde kein Foto je gespeichert.
 */
export const insertAssetIfNew = <TSchema extends Record<string, unknown>>(
  db: SqliteRemoteDatabase<TSchema>,
  values: InsertAsset,
) => db.insert(assets).values(values).onConflictDoNothing({ target: sql`${sql.identifier(assets.sha256.name)}` });
