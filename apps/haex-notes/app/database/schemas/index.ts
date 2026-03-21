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

/**
 * Notebooks — each notebook contains multiple pages.
 */
export const notebooks = sqliteTable(
  tableName("notebooks"),
  {
    id: text().primaryKey(),
    name: text().notNull().default("Notizbuch"),
    /** Default page template for new pages */
    defaultTemplate: text("default_template").notNull().default("lined"),
    /** Cover color (hex) */
    coverColor: text("cover_color").notNull().default("#3b82f6"),
    /** Cover image (base64 data URL) or freehand thumbnail */
    coverImage: text("cover_image"),
    ...timestamps,
  }
);
export type InsertNotebook = typeof notebooks.$inferInsert;
export type SelectNotebook = typeof notebooks.$inferSelect;

/**
 * Pages — individual pages within a notebook.
 */
export const pages = sqliteTable(
  tableName("pages"),
  {
    id: text().primaryKey(),
    notebookId: text("notebook_id").notNull(),
    pageNumber: integer("page_number").notNull().default(0),
    /** Page template type */
    template: text().notNull().default("lined"),
    /** Strokes as JSON */
    strokes: text({ mode: "json" }).$type<StrokeData[]>().notNull().default([]),
    /** Table objects on this page */
    tables: text({ mode: "json" }).$type<PageTable[]>().notNull().default([]),
    /** Background image (photo of worksheet etc.) */
    backgroundImage: text("background_image"),
    /** Small preview for page navigation */
    thumbnail: text(),
    /** Soft-delete timestamp (null = active, set = in trash) */
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    ...timestamps,
  }
);
export type InsertPage = typeof pages.$inferInsert;
export type SelectPage = typeof pages.$inferSelect;

/**
 * Pencil Case — user's customized pen slots.
 */
export const pencilCase = sqliteTable(
  tableName("pencil_case"),
  {
    id: text().primaryKey().default("default"),
    slots: text({ mode: "json" }).$type<PenSlot[]>().notNull().default([]),
    maxSlots: integer("max_slots").notNull().default(5),
    ...timestamps,
  }
);
export type InsertPencilCase = typeof pencilCase.$inferInsert;
export type SelectPencilCase = typeof pencilCase.$inferSelect;

/**
 * Color palettes — saved color collections.
 */
export const palettes = sqliteTable(
  tableName("palettes"),
  {
    id: text().primaryKey(),
    name: text().notNull(),
    colors: text({ mode: "json" }).$type<string[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  }
);
export type InsertPalette = typeof palettes.$inferInsert;
export type SelectPalette = typeof palettes.$inferSelect;

// Type definitions

export interface StrokeData {
  id: string;
  points: [number, number, number][]; // [x, y, pressure]
  color: string;
  size: number;
  tool: "brush" | "eraser";
  brushPreset?: string;
  brushTip?: "round" | "flat" | "chisel";
}

/** Page template types */
export type PageTemplate =
  | "blank"
  | "lined"          // Standard liniert (8mm)
  | "grid"           // Kariert (5mm)
  | "grid-large"     // Großkariert (10mm)
  | "dotgrid"        // Punktraster
  | "lineatur1"      // Schreiblern-Lineatur Klasse 1
  | "lineatur2"      // Schreiblern-Lineatur Klasse 2
  | "lineatur3"      // Schreiblern-Lineatur Klasse 3
  | "music"          // Notenlinien
  | "millimeter";    // Millimeterpapier

/** A configured pen in the pencil case */
export interface PenSlot {
  id: string;
  name: string;
  type: "fineliner" | "ballpoint" | "pencil" | "highlighter" | "eraser";
  color: string;
  size: number;
}

/** Table object on a page */
export interface PageTable {
  id: string;
  x: number;
  y: number;
  columns: number;
  rows: number;
  columnWidths: number[];
  rowHeights: number[];
}
