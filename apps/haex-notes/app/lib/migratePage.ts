import { toRaw } from "vue";
import type {
  PageAttachment,
  PageBackground,
  PageLayer,
  PageTemplate,
  PaperNoteImport,
  StrokeElement,
  TableElement,
} from "~/types/document";
import { getPageSize } from "~/utils/pageTemplates";
import { computeBbox } from "./bbox";
import { clonePlain } from "./clone";
import { originalAttachment } from "./attachments";
import type { PageDoc } from "./commands";

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
  /** Ungeprüft: die Zeile kann von einem anderen Gerät oder Space-Mitglied stammen. */
  layers?: unknown;
  /** Ungeprüft, siehe `layers`. */
  background?: unknown;
  width?: number | null;
  height?: number | null;
  strokes?: LegacyStroke[] | null;
  tables?: LegacyTable[] | null;
  template?: string | null;
  backgroundImage?: string | null;
  orientation?: string | null;
  /** Ungeprüft, siehe `layers`. */
  paperImport?: unknown;
  /** Ungeprüft, siehe `layers`. */
  attachments?: unknown;
}

export interface MigratedPage {
  layers: PageLayer[];
  background: PageBackground;
  width: number;
  height: number;
  paperImport?: PaperNoteImport;
  attachments?: PageAttachment[];
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

/**
 * Die Ebene, auf die neue Striche gehen, wenn eine Seite geöffnet wird: die oberste
 * ungesperrte. Das gesperrte Original einer Fotoseite ist es nie.
 */
export function drawingLayerId(layers: readonly PageLayer[]): string | null {
  return [...layers].reverse().find((layer) => !layer.locked)?.id ?? layers[0]?.id ?? null;
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function isElement(value: unknown): boolean {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.type !== "string") return false;
  // Bekannte Typen muss der Renderer zeichnen können; unbekannte stammen von
  // einer neueren Version und werden nur durchgereicht.
  if (value.type === "stroke") return Array.isArray(value.points);
  if (value.type === "table") return Array.isArray(value.columnWidths) && Array.isArray(value.rowHeights);
  return true;
}

function isPageLayers(value: unknown): value is PageLayer[] {
  return Array.isArray(value) && value.every((layer) =>
    isObject(layer)
    && typeof layer.id === "string"
    && typeof layer.visible === "boolean"
    && Array.isArray(layer.elements)
    && layer.elements.every(isElement));
}

/**
 * Herkunft einer Seite aus einem Foto. Eine spätere Version wird unverändert
 * durchgereicht, damit ein älteres Gerät sie beim Speichern nicht verliert.
 */
function isPaperNoteImport(value: unknown): value is PaperNoteImport {
  return isObject(value)
    && typeof value.version === "number"
    && typeof value.originalAssetId === "string"
    && (value.workingAssetId === undefined || typeof value.workingAssetId === "string")
    && (value.closeUps === undefined || (Array.isArray(value.closeUps)
      && value.closeUps.every((closeUp) => isObject(closeUp) && typeof closeUp.assetId === "string")));
}

function isAttachments(value: unknown): value is PageAttachment[] {
  return Array.isArray(value) && value.every((item) => isObject(item)
    && typeof item.id === "string"
    && (item.kind === "original" || item.kind === "file")
    && typeof item.assetId === "string"
    && typeof item.name === "string"
    && typeof item.mimeType === "string"
    && (item.size === undefined || typeof item.size === "number")
    && typeof item.addedAt === "string");
}

/** Name und Zustand der Ebene mit dem Foto vor den Anhängen (Spec 046 data-model.md). */
const LEGACY_ORIGINAL_LAYER = "Original";
/** Die Ebene mit dem Foto auf einer Seite ohne Entwurf (FR-025). */
export const PHOTO_LAYER_NAME = "Foto";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Stellt eine Fotoseite aus der Zeit der Originalebene auf die Anhänge um: Der Anhang `original`
 * entsteht aus `paperImport`, und die gesperrte Ebene „Original“ entfällt, wenn es einen Entwurf
 * gibt, sonst wird sie zur ungesperrten Ebene „Foto“. Rein und idempotent: eine umgestellte Seite
 * hat keine gesperrte Ebene „Original“ mehr und kommt unverändert zurück.
 */
function withAttachments(
  layers: PageLayer[],
  paperImport: PaperNoteImport | undefined,
  stored: PageAttachment[] | undefined,
): { layers: PageLayer[]; attachments?: PageAttachment[] } {
  let attachments = stored;
  if (paperImport && !originalAttachment(attachments)) {
    const extension = EXTENSIONS[paperImport.sourceMimeType] ?? "bin";
    attachments = [
      {
        id: `original-${paperImport.originalAssetId}`,
        kind: "original",
        assetId: paperImport.originalAssetId,
        name: `${LEGACY_ORIGINAL_LAYER}.${extension}`,
        mimeType: paperImport.sourceMimeType,
        addedAt: paperImport.createdAt,
      },
      ...(attachments ?? []),
    ];
  }
  const holdsPhoto = (layer: PageLayer) => layer.locked && layer.name === LEGACY_ORIGINAL_LAYER
    && layer.elements.some((e) => e.type === "image" && e.source.kind === "asset" && e.source.assetId === paperImport?.originalAssetId);
  if (!paperImport || !layers.some(holdsPhoto)) return { layers, ...(attachments && { attachments }) };
  const ready = paperImport.processing.state === "ready";
  const next = ready
    ? layers.filter((layer) => !holdsPhoto(layer))
    : layers.map((layer) => (holdsPhoto(layer) ? { ...layer, name: PHOTO_LAYER_NAME, locked: false } : layer));
  return { layers: next.length ? next : [emptyLayer()], ...(attachments && { attachments }) };
}

function isPageBackground(value: unknown): value is PageBackground {
  return isObject(value) && typeof value.paperColor === "string" && typeof value.template === "string";
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
  const background = isPageBackground(row.background) ? row.background : buildLegacyBackground(row);

  // Kaputtes JSON nicht als leere Seite zeigen — der nächste Save würde es sonst
  // überschreiben. Die Legacy-Spalten werden parallel gepflegt und taugen als Ersatz.
  const storedLayers = isPageLayers(row.layers) ? row.layers : null;
  if (row.layers != null && !storedLayers) {
    console.warn("[haex-notes] Ignoring malformed page layers, using the legacy columns", row.layers);
  }

  // Ein leeres Layer-Array ist kein "noch nicht migriert", sondern eine leergeräumte
  // Seite. Trotzdem braucht sie einen Layer, sonst kann niemand darauf zeichnen.
  const layers = storedLayers
    ? (storedLayers.length > 0 ? storedLayers : [emptyLayer()])
    : [buildLegacyLayer(row)];

  if (row.paperImport != null && !isPaperNoteImport(row.paperImport)) {
    console.warn("[haex-notes] Ignoring a malformed paper import", row.paperImport);
  }
  const paperImport = isPaperNoteImport(row.paperImport) ? row.paperImport : undefined;

  if (row.attachments != null && !isAttachments(row.attachments)) {
    console.warn("[haex-notes] Ignoring malformed attachments", row.attachments);
  }
  const upgraded = withAttachments(layers, paperImport, isAttachments(row.attachments) ? row.attachments : undefined);

  return {
    layers: upgraded.layers, background, width, height,
    ...(paperImport && { paperImport }),
    ...(upgraded.attachments?.length && { attachments: upgraded.attachments }),
  };
}

/**
 * Gegenstück zu `migratePageRow`: die Spaltenwerte, mit denen eine Seite
 * gespeichert wird — Dokumentmodell plus die Legacy-Spalten.
 */
export function serializePageDoc(doc: PageDoc) {
  // Die Seite liegt im reaktiven Store-Zustand; auch unter toRaw() können noch
  // Proxies stecken (z.B. aus filter() auf einem reaktiven Array).
  const layers = clonePlain(toRaw(doc.layers));
  const background = clonePlain(toRaw(doc.background));
  const paperImport = doc.paperImport ? clonePlain(toRaw(doc.paperImport)) : null;
  const attachments = doc.attachments?.length ? clonePlain(toRaw(doc.attachments)) : null;
  const strokes = layers.flatMap((layer) =>
    layer.elements
      .filter((element): element is StrokeElement => element.type === "stroke")
      .map(({ id, points, color, size, tool, brushPreset }) => ({
        id,
        points,
        color,
        size,
        tool,
        brushPreset,
      })),
  );
  const tables = layers.flatMap((layer) =>
    layer.elements
      .filter((element): element is TableElement => element.type === "table")
      .map(({ id, x, y, columns, rows, columnWidths, rowHeights }) => ({
        id,
        x,
        y,
        columns,
        rows,
        columnWidths,
        rowHeights,
      })),
  );
  const overlay = background.overlay;
  const backgroundImage = overlay?.type === "image" && overlay.source.kind === "inline"
    ? overlay.source.dataUrl
    : null;
  const orientation = doc.width > doc.height ? "landscape" : "portrait";

  return {
    layers,
    background,
    width: doc.width,
    height: doc.height,
    paperImport,
    attachments,
    // Keep the legacy representation in sync during the rollout so older
    // clients do not render a page as empty after a new client saves it.
    strokes,
    tables,
    template: background.template,
    backgroundImage,
    orientation,
  };
}
