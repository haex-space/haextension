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
    uiScale: text("ui_scale").notNull().default("default"),
    editorTheme: text("editor_theme").notNull().default("vs-dark"),
    editorFontSize: integer("editor_font_size").notNull().default(14),
    editorFontFamily: text("editor_font_family").notNull().default("'JetBrains Mono', monospace"),
    editorTabSize: integer("editor_tab_size").notNull().default(2),
    editorWordWrap: text("editor_word_wrap").notNull().default("off"),
    editorMinimap: integer("editor_minimap", { mode: "boolean" }).notNull().default(true),
    editorLineNumbers: text("editor_line_numbers").notNull().default("on"),
    terminalFontSize: integer("terminal_font_size").notNull().default(14),
    terminalFontFamily: text("terminal_font_family").notNull().default("'JetBrains Mono', monospace"),
    ...timestamps,
  }
);
export type InsertSettings = typeof settings.$inferInsert;
export type SelectSettings = typeof settings.$inferSelect;
