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
export interface PageBackground {
  paperColor: string;
  template: PageTemplate;
  overlay?: ImageOverlay | PdfOverlay;
}
