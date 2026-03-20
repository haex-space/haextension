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
 * Drawings — each drawing is a canvas project with serialized stroke data.
 * Strokes are stored as JSON array for simplicity and atomicity.
 */
export const drawings = sqliteTable(
  tableName("drawings"),
  {
    id: text().primaryKey(),
    name: text().notNull().default("Untitled"),

    // Canvas state: serialized strokes + stencils + viewport
    strokes: text({ mode: "json" }).$type<StrokeData[]>().notNull().default([]),
    stencils: text({ mode: "json" }).$type<SerializedStencil[]>().notNull().default([]),
    viewport: text({ mode: "json" }).$type<ViewportState>().notNull().default({ x: 0, y: 0, zoom: 1 }),

    // Thumbnail for project list (base64 PNG, small)
    thumbnail: text(),

    ...timestamps,
  }
);
export type InsertDrawing = typeof drawings.$inferInsert;
export type SelectDrawing = typeof drawings.$inferSelect;

/**
 * Settings — user preferences for drawing tools.
 */
export const settings = sqliteTable(
  tableName("settings"),
  {
    id: text().primaryKey().default("default"),
    brushColor: text("brush_color").notNull().default("#000000"),
    brushSize: integer("brush_size").notNull().default(4),
    ...timestamps,
  }
);
export type InsertSettings = typeof settings.$inferInsert;
export type SelectSettings = typeof settings.$inferSelect;

/**
 * Palettes — user-defined color collections for quick access.
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

// Type definitions for JSON columns
export interface StrokeData {
  id: string;
  points: [number, number, number][]; // [x, y, pressure]
  color: string;
  size: number;
  tool: "brush" | "eraser";
  brushPreset?: string; // ID from BRUSH_PRESETS
  brushTip?: "round" | "flat" | "chisel";
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface SerializedStencil {
  id: string;
  presetId: string;
  shapeType: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  pinned: boolean;
  svgPath?: string;
  imageData?: string;
}
