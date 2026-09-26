import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";
import type { PageBackground, PageLayer } from "../../types/document";

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
    /** Default page orientation */
    defaultOrientation: text("default_orientation").notNull().default("portrait"),
    /** Non-null = "entire notebook shared into this space; future pages inherit" */
    spaceId: text("space_id"),
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
    /** Page orientation (portrait or landscape) */
    orientation: text().notNull().default("portrait"),
    /** Layer mit Elementen — Quelle der Wahrheit ab dem Element-Modell. */
    layers: text({ mode: "json" }).$type<PageLayer[]>(),
    /** Papierfarbe, Lineatur und optionales Bild-/PDF-Overlay. */
    background: text({ mode: "json" }).$type<PageBackground>(),
    /** Seitenmaße in px. Null = aus `orientation` ableiten. */
    width: integer(),
    height: integer(),
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

/**
 * Assets — Metadaten zu Dateien auf dem Filesystem.
 *
 * Enthält bewusst keine Bytes: eine DB-Transaktion ist auf 100 MB begrenzt, und
 * Dateien gehören ins Dateisystem. Der Inhalt liegt unter
 * `<assetRoot>/<sha256[0:2]>/<sha256>.<ext>`.
 */
export const assets = sqliteTable(
  tableName("assets"),
  {
    id: text().primaryKey(),
    sha256: text().notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer().notNull(),
    ...timestamps,
  }
);
export type InsertAsset = typeof assets.$inferInsert;
export type SelectAsset = typeof assets.$inferSelect;

// Type definitions

/** A configured pen in the pencil case */
export interface PenSlot {
  id: string;
  name: string;
  type: "fineliner" | "ballpoint" | "pencil" | "highlighter" | "eraser";
  color: string;
  size: number;
}

// Dokumenttypen liegen in app/types/document.ts. Re-Export, damit bestehende
// Importe aus "~/database/schemas" weiter funktionieren.
export type {
  BBox,
  ImageElement,
  ImageOverlay,
  ImageSource,
  LatexElement,
  PageBackground,
  PageElement,
  PageLayer,
  PageOrientation,
  PageTemplate,
  PdfOverlay,
  ShapeElement,
  ShapeKind,
  StrokeElement,
  TableElement,
  TextElement,
} from "../../types/document";

/** @deprecated Altbestand der Spalte `strokes`. Neuer Code nutzt StrokeElement. */
export interface StrokeData {
  id: string;
  points: [number, number, number][];
  color: string;
  size: number;
  tool: "brush" | "eraser";
  brushPreset?: string;
  brushTip?: "round" | "flat" | "chisel";
}

/** @deprecated Altbestand der Spalte `tables`. Neuer Code nutzt TableElement. */
export interface PageTable {
  id: string;
  x: number;
  y: number;
  columns: number;
  rows: number;
  columnWidths: number[];
  rowHeights: number[];
}
