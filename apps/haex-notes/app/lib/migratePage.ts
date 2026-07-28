import type {
  PageBackground,
  PageLayer,
  PageTemplate,
  StrokeElement,
  TableElement,
} from "~/types/document";
import { getPageSize } from "~/utils/pageTemplates";
import { computeBbox } from "./bbox";

/** Strichform der Spalte `pages.strokes` vor dem Element-Modell. */
interface LegacyStroke {
  id?: string;
  points: [number, number, number][];
  color: string;
  size: number;
  tool: "brush" | "eraser";
  brushPreset?: string;
}

/** Tabellenform der Spalte `pages.tables` vor dem Element-Modell. */
interface LegacyTable {
  id?: string;
  x: number;
  y: number;
  columns: number;
  rows: number;
  columnWidths: number[];
  rowHeights: number[];
}

/**
 * Eine `pages`-Zeile, wie sie auf der Platte liegen kann — alt, neu oder gemischt.
 * Alle Felder optional, weil die Zeile von einem Gerät mit älterer Extension-Version
 * stammen kann.
 */
export interface LegacyPageRow {
  layers?: PageLayer[] | null;
  background?: PageBackground | null;
  width?: number | null;
  height?: number | null;
  strokes?: LegacyStroke[] | null;
  tables?: LegacyTable[] | null;
  template?: string | null;
  backgroundImage?: string | null;
  orientation?: string | null;
}

export interface MigratedPage {
  layers: PageLayer[];
  background: PageBackground;
  width: number;
  height: number;
}

/** Fester Layer-Name für alles, was aus der Zeit vor den Layern stammt. */
export const DEFAULT_LAYER_NAME = "Ebene 1";
export const DEFAULT_LAYER_ID = "layer-0";
export const DEFAULT_PAPER_COLOR = "#ffffff";
export const DEFAULT_TEMPLATE: PageTemplate = "lined";

/** Deckkraft, die der alte Renderer für Hintergrundbilder fest verdrahtet hatte. */
export const LEGACY_BACKGROUND_OPACITY = 0.3;

export function emptyLayer(): PageLayer {
  return { id: DEFAULT_LAYER_ID, name: DEFAULT_LAYER_NAME, visible: true, locked: false, elements: [] };
}

function toStrokeElement(stroke: LegacyStroke, index: number): StrokeElement {
  const element: StrokeElement = {
    id: stroke.id ?? `legacy-stroke-${index}`,
    type: "stroke",
    points: stroke.points,
    color: stroke.color,
    size: stroke.size,
    tool: stroke.tool,
    brushPreset: stroke.brushPreset,
    bbox: [0, 0, 0, 0],
  };
  element.bbox = computeBbox(element);
  return element;
}

function toTableElement(table: LegacyTable, index: number): TableElement {
  const element: TableElement = {
    id: table.id ?? `legacy-table-${index}`,
    type: "table",
    x: table.x,
    y: table.y,
    columns: table.columns,
    rows: table.rows,
    columnWidths: table.columnWidths,
    rowHeights: table.rowHeights,
    bbox: [0, 0, 0, 0],
  };
  element.bbox = computeBbox(element);
  return element;
}

function buildLegacyBackground(row: LegacyPageRow): PageBackground {
  const background: PageBackground = {
    paperColor: DEFAULT_PAPER_COLOR,
    template: (row.template as PageTemplate | null) ?? DEFAULT_TEMPLATE,
  };
  if (row.backgroundImage) {
    background.overlay = {
      type: "image",
      source: { kind: "inline", dataUrl: row.backgroundImage },
      opacity: LEGACY_BACKGROUND_OPACITY,
    };
  }
  return background;
}

function buildLegacyLayer(row: LegacyPageRow): PageLayer {
  return {
    ...emptyLayer(),
    elements: [
      ...(row.strokes ?? []).map(toStrokeElement),
      ...(row.tables ?? []).map(toTableElement),
    ],
  };
}

/**
 * Übersetzt eine gespeicherte Seitenzeile ins Dokumentmodell.
 *
 * Rein und idempotent: eine bereits migrierte Zeile kommt unverändert zurück.
 * Wird beim Laden aufgerufen, nicht als Datenmigration — geschrieben wird das
 * Ergebnis erst, wenn die Seite ohnehin gespeichert wird.
 */
export function migratePageRow(row: LegacyPageRow): MigratedPage {
  const size = getPageSize(row.orientation ?? "portrait");
  const width = row.width ?? size.width;
  const height = row.height ?? size.height;
  const background = row.background ?? buildLegacyBackground(row);

  // Ein leeres Layer-Array ist kein "noch nicht migriert", sondern eine leergeräumte
  // Seite. Trotzdem braucht sie einen Layer, sonst kann niemand darauf zeichnen.
  const layers = row.layers
    ? (row.layers.length > 0 ? row.layers : [emptyLayer()])
    : [buildLegacyLayer(row)];

  return { layers, background, width, height };
}
