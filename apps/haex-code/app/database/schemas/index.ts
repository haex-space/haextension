import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";

const tableName = (name: string) => getTableName(manifest.publicKey, packageJson.name, name);

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
};

export const settings = sqliteTable(
  tableName("settings"),
  {
    id: text().primaryKey().default("default"),
    editorTheme: text("editor_theme").notNull().default("vs-dark"),
    editorFontSize: integer("editor_font_size").notNull().default(14),
    editorTabSize: integer("editor_tab_size").notNull().default(2),
    editorWordWrap: text("editor_word_wrap").notNull().default("off"),
    editorMinimap: integer("editor_minimap", { mode: "boolean" }).notNull().default(true),
    terminalFontSize: integer("terminal_font_size").notNull().default(14),
    defaultShell: text("default_shell"),
    ...timestamps,
  }
);
export type InsertSettings = typeof settings.$inferInsert;
export type SelectSettings = typeof settings.$inferSelect;
