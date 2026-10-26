/**
 * Dokumentmodell einer Notizseite.
 *
 * Bewusst frei von Drizzle-, SDK- und Vue-Importen: Migration, Bounding-Box-
 * Berechnung und die Undo-Kommandos arbeiten auf diesen Typen und sollen ohne
 * DB und ohne Browser testbar bleiben.
 */

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

export type PageOrientation = "portrait" | "landscape";

/** [x, y, width, height] in Seitenkoordinaten. */
export type BBox = [number, number, number, number];

/**
 * Woher die Bytes eines Bildes kommen.
 *
 * `inline` gibt es für Altbestand (die frühere Spalte `background_image` war eine
 * Data-URL) und für kleine Bilder, die mit einer geteilten Seite mitreisen sollen.
 * Alles Große liegt als Asset auf dem Filesystem.
 */
export type ImageSource =
  | { kind: "asset"; assetId: string }
  | { kind: "inline"; dataUrl: string };

interface ElementBase {
  id: string;
  /** Gecachte achsenparallele Hülle. Nach jeder Geometrieänderung mit computeBbox() neu setzen. */
  bbox: BBox;
}

export interface StrokeElement extends ElementBase {
  type: "stroke";
  /** [x, y, pressure] */
  points: [number, number, number][];
  color: string;
  size: number;
  tool: "brush" | "eraser";
  brushPreset?: string;
}

export interface TextElement extends ElementBase {
  type: "text";
  x: number;
  y: number;
  /** Umbruchbreite. */
  width: number;
  /** Beim Committen aus der Textmessung gesetzt. */
  height: number;
  rotation: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
}

export interface ImageElement extends ElementBase {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  source: ImageSource;
  opacity: number;
}

export type ShapeKind = "line" | "arrow" | "rect" | "ellipse" | "polygon";

export interface ShapeElement extends ElementBase {
  type: "shape";
  kind: ShapeKind;
  points: [number, number][];
  rotation: number;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

export interface TableElement extends ElementBase {
  type: "table";
  x: number;
  y: number;
  columns: number;
  rows: number;
  columnWidths: number[];
  rowHeights: number[];
  /**
   * Zelltext, `rows` Zeilen zu je `columns` Zellen; eine leere Zelle ist `""`.
   * Fehlt bei Tabellen von älteren Versionen — dann ist jede Zelle leer.
   */
  cells?: string[][];
}

export interface LatexElement extends ElementBase {
  type: "latex";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** LaTeX-Quelle, bleibt editierbar. */
  source: string;
  /** Gerendertes SVG, damit die Anzeige ohne MathJax-Roundtrip auskommt. */
  svg: string;
  color: string;
}

export type PageElement =
  | StrokeElement
  | TextElement
  | ImageElement
  | ShapeElement
  | TableElement
  | LatexElement;

export interface PageLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  elements: PageElement[];
}

export interface ImageOverlay {
  type: "image";
  source: ImageSource;
  opacity: number;
}

export interface PdfOverlay {
  type: "pdf";
  assetId: string;
  pageIndex: number;
}

/**
 * Seitenhintergrund. Papierfarbe, Lineatur und ein optionales Overlay werden
 * übereinander gezeichnet — sie schließen sich nicht aus (so verhält sich der
 * heutige Renderer auch schon).
 */
/** Rand einer Notizseite in Seitenpixeln: bis dahin zeichnet die Vorlage und stehen neue Inhalte. */
export interface PageMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PageBackground {
  paperColor: string;
  template: PageTemplate;
  /** Fehlt es, gelten `DEFAULT_MARGINS`. */
  margins?: PageMargins;
  overlay?: ImageOverlay | PdfOverlay;
}

/** Wo ein Modell gelesen hat, aus Sicht des Geräts (holzi Spec 055). */
export type RecognitionPlace = "this_device" | "network" | "cloud";

/** Warum eine Erkennung nichts geliefert hat. */
export type RecognitionError =
  | "no_capable_model"
  | "consent_denied"
  | "unusable"
  | "timeout"
  | "unavailable"
  | "processing_failed";

/** Stand und Herkunft der Erkennung eines importierten Fotos. Adresse und Schlüssel des Modells kennt nur holzi. */
export interface PaperNoteProcessing {
  state: "manual" | "processing" | "ready" | "failed";
  /** Name des Modells, das die Seite gelesen hat. */
  model?: string;
  place?: RecognitionPlace;
  error?: RecognitionError;
  startedAt?: string;
  finishedAt?: string;
}

/** Eine übernommene Region: wo sie auf der Arbeitskopie stand und welche Elemente daraus wurden. */
export interface RecognizedRegion {
  id: string;
  kind: "text" | "table" | "image" | "formula";
  /** `[x1, y1, x2, y2]`, je 0–1000 relativ zur gelesenen Aufnahme. */
  sourceBox: [number, number, number, number];
  elementIds: string[];
  /** Gesetzt, wenn die Region aus einem Nahfoto stammt. */
  closeUpId?: string;
}

/** Ein Nahfoto einer Stelle, das die erzeugten Elemente in seinem Rechteck ersetzt hat. */
export interface PaperNoteCloseUp {
  id: string;
  /** Das unveränderte Nahfoto. */
  assetId: string;
  rotation: 0 | 90 | 180 | 270;
  /** Das Rechteck auf der Seite, `[x, y, width, height]` in Seitenkoordinaten. */
  pageBox: [number, number, number, number];
  model?: string;
  place?: RecognitionPlace;
  createdAt: string;
}

/**
 * Eine Datei, die an einer Seite hängt (holzi Spec 046, FR-022). Das Original eines importierten
 * Fotos ist der Anhang der Art `original`: unverändert, ungedreht und gegen Entfernen geschützt.
 * Anhänge liegen nicht auf der Seite und sind keine Ebene.
 */
export interface PageAttachment {
  id: string;
  kind: "original" | "file";
  assetId: string;
  name: string;
  mimeType: string;
  /** Bytes; fehlt bei einem Anhang, der aus einer Seite vor den Anhängen abgeleitet wurde. */
  size?: number;
  addedAt: string;
}

/** Herkunft einer Seite, die aus einem Foto entstand (holzi Spec 046). */
export interface PaperNoteImport {
  version: number;
  originalAssetId: string;
  /** Die entzerrte, gedrehte Kopie, die gelesen wurde; fehlt bei frühem Verarbeitungsfehler. */
  workingAssetId?: string;
  /** Drehung der Arbeitskopie gegenüber dem Original, im Uhrzeigersinn. */
  rotation: 0 | 90 | 180 | 270;
  sourceMimeType: string;
  sourceWidth: number;
  sourceHeight: number;
  processing: PaperNoteProcessing;
  regions: RecognizedRegion[];
  closeUps?: PaperNoteCloseUp[];
  createdAt: string;
  updatedAt: string;
}
