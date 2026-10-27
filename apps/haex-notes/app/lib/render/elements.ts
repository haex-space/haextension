import getStroke from "perfect-freehand";
import { formulaOfCell, FORMULA_EM_PX, paint, svgDataUrl } from "../math";
import { BASELINE_SHARE, LINE_HEIGHT, lineStepOf } from "../paperRows";
import type {
  BBox,
  ImageElement,
  ImageSource,
  LatexElement,
  PageElement,
  StrokeElement,
  TableElement,
  TextElement,
} from "~/types/document";

/**
 * Pfade committeter Striche, damit Pan, Zoom und jeder neue Strich nicht alle
 * Umrisse neu berechnen. Ein Eintrag gilt, solange `bbox` dasselbe Array ist:
 * jede Geometrieänderung setzt per Vertrag eine neue Hülle (computeBbox).
 */
export type StrokePathCache = WeakMap<StrokeElement, { bbox: BBox; path: Path2D }>;

/**
 * Eine Formel, die der Aufrufer zu einem Bild setzt (Spec 046, FR-029): Der Renderer kennt MathJax nicht.
 * Sie wird nicht gespeichert, sondern nur für die Tabellenzellen `$…$` beim Zeichnen angefragt.
 */
export interface FormulaSource {
  kind: "formula";
  source: string;
  color: string;
}

/** Was der Renderer als Bild anfragt: ein Bild der Seite oder eine zu setzende Formel. */
export type RenderSource = ImageSource | FormulaSource;

/**
 * Das geladene Bild einer Quelle, oder null, solange es lädt oder fehlt. Laden ist
 * Sache des Aufrufers (asynchron); der Renderer zeichnet nur, was schon da ist.
 */
export type ImageLookup = (source: RenderSource) => CanvasImageSource | null;

/** Die Tinte des Zelltexts. */
export const CELL_INK = "#1f2937";
const latexSources = new Map<string, { svg: string; color: string; width: number; height: number; source: ImageSource }>();

/**
 * Die Bildquelle eines Formel-Elements: sein gesetztes SVG in der Tintenfarbe. Ohne MathJax; die Quelle
 * bleibt für ein unverändertes Element dieselbe, damit das Bild nur einmal geladen wird.
 */
export function latexImageSource(element: LatexElement): ImageSource {
  const cached = latexSources.get(element.id);
  if (cached && cached.svg === element.svg && cached.color === element.color
    && cached.width === element.width && cached.height === element.height) return cached.source;
  if (latexSources.size > 500) latexSources.clear();
  const source: ImageSource = {
    kind: "inline",
    dataUrl: svgDataUrl(paint(element.svg, element.color, element.width, element.height)),
  };
  latexSources.set(element.id, { svg: element.svg, color: element.color, width: element.width, height: element.height, source });
  return source;
}

/** Schrift und Innenabstand des Zelltexts. */
export const CELL_FONT_SIZE = 14;
export const CELL_PADDING = 4;

/** Wandelt den Umriss aus perfect-freehand in einen geschlossenen SVG-Pfad. */
export function strokeOutlineToPath(outline: [number, number][]): string {
  if (outline.length < 2) return "";
  const parts: string[] = [];
  const first = outline[0]!;
  parts.push(`M ${first[0]} ${first[1]}`);
  for (let i = 1; i < outline.length; i++) {
    const point = outline[i]!;
    if (i === 1) {
      parts.push(`L ${point[0]} ${point[1]}`);
    } else {
      const prev = outline[i - 1]!;
      parts.push(`Q ${prev[0]} ${prev[1]} ${(prev[0] + point[0]) / 2} ${(prev[1] + point[1]) / 2}`);
    }
  }
  parts.push("Z");
  return parts.join(" ");
}

/** SVG-Pfad eines Strichs. Wird in Phase 4 auch vom PDF-Export genutzt. */
export function strokeToPath(stroke: StrokeElement): string {
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: stroke.tool === "eraser" ? 0 : 0.3,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
  });
  return strokeOutlineToPath(outline as [number, number][]);
}

function strokePath(stroke: StrokeElement, cache?: StrokePathCache): Path2D | null {
  const cached = cache?.get(stroke);
  if (cached && cached.bbox === stroke.bbox) return cached.path;
  const d = strokeToPath(stroke);
  if (!d) return null;
  const path = new Path2D(d);
  cache?.set(stroke, { bbox: stroke.bbox, path });
  return path;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeElement, cache?: StrokePathCache) {
  const path = strokePath(stroke, cache);
  if (!path) return;
  ctx.save();
  if (stroke.brushPreset === "marker" || stroke.brushPreset === "highlighter") {
    ctx.globalAlpha = 0.35;
  }
  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
  } else {
    ctx.fillStyle = stroke.color;
  }
  ctx.fill(path);
  ctx.restore();
}

/** Bricht Text an Wörtern auf `width` um; Zeilenumbrüche im Text bleiben. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > width) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function fillLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, step: number) {
  lines.forEach((line, i) => {
    if (line) ctx.fillText(line, x, y + i * step);
  });
}

/** Dreht um die Mitte einer Box; der Aufrufer klammert mit save/restore. */
function rotateAround(ctx: CanvasRenderingContext2D, box: { x: number; y: number; width: number; height: number; rotation: number }) {
  if (!box.rotation) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate(box.rotation);
  ctx.translate(-cx, -cy);
}

type TextLayout = Pick<TextElement, "text" | "width" | "fontFamily" | "fontSize" | "lineHeight">;

const fontOf = (text: TextLayout) => `${text.fontSize}px ${text.fontFamily}, sans-serif`;

/** Höhe eines Textblocks, so umbrochen, wie drawText ihn zeichnet. */
export function measureTextHeight(ctx: CanvasRenderingContext2D, text: TextLayout): number {
  ctx.save();
  ctx.font = fontOf(text);
  const lines = wrapLines(ctx, text.text, text.width).length;
  ctx.restore();
  return lines * lineStepOf(text);
}

function drawText(ctx: CanvasRenderingContext2D, text: TextElement) {
  ctx.save();
  rotateAround(ctx, text);
  ctx.font = fontOf(text);
  ctx.fillStyle = text.color;
  // Auf den Zeilen des Papiers sitzt die Grundlinie, sonst hängt der Text an seiner Oberkante.
  ctx.textBaseline = text.lineHeight ? "alphabetic" : "top";
  const y = text.lineHeight ? text.y + BASELINE_SHARE * text.lineHeight : text.y;
  fillLines(ctx, wrapLines(ctx, text.text, text.width), text.x, y, lineStepOf(text));
  ctx.restore();
}

function drawImage(ctx: CanvasRenderingContext2D, image: ImageElement, images?: ImageLookup) {
  ctx.save();
  rotateAround(ctx, image);
  const loaded = images?.(image.source) ?? null;
  if (loaded) {
    ctx.globalAlpha = image.opacity;
    ctx.drawImage(loaded, image.x, image.y, image.width, image.height);
  } else {
    // Lädt noch oder liegt nicht auf diesem Gerät: Platz zeigen, nicht verschwinden.
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(image.x, image.y, image.width, image.height);
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.strokeRect(image.x, image.y, image.width, image.height);
  }
  ctx.restore();
}

/**
 * Eine Zelle, die nur eine Formel ist, als gesetzte Formel in der Schriftgröße der Zelle, höchstens so groß wie
 * die Zelle. false, solange die Formel nicht gesetzt ist oder sich nicht setzen lässt: Dann zeigt die Zelle
 * ihren Text, die Quelle geht nicht verloren.
 */
function drawCellFormula(
  ctx: CanvasRenderingContext2D, cell: string, box: { x: number; y: number; width: number; height: number }, images?: ImageLookup,
): boolean {
  const formula = formulaOfCell(cell);
  const loaded = formula ? images?.({ kind: "formula", source: formula, color: CELL_INK }) : null;
  if (!loaded) return false;
  const natural = loaded as HTMLImageElement;
  const factor = CELL_FONT_SIZE / FORMULA_EM_PX;
  let width = natural.width * factor;
  let height = natural.height * factor;
  const room = { width: box.width - 2 * CELL_PADDING, height: box.height - 2 * CELL_PADDING };
  const shrink = Math.min(1, room.width / width, room.height / height);
  width *= shrink;
  height *= shrink;
  ctx.drawImage(loaded, box.x + CELL_PADDING, box.y + (box.height - height) / 2, width, height);
  return true;
}

/** Eine gesetzte Formel; solange ihr Bild lädt, bleibt ihr Platz leer. */
function drawLatex(ctx: CanvasRenderingContext2D, latex: LatexElement, images?: ImageLookup) {
  const loaded = images?.(latexImageSource(latex)) ?? null;
  if (!loaded) return;
  ctx.save();
  rotateAround(ctx, latex);
  ctx.drawImage(loaded, latex.x, latex.y, latex.width, latex.height);
  ctx.restore();
}

/** Schreibt den Text jeder Zelle in ihre Zelle; ungültige Zellen (von fremden Geräten) bleiben leer. */
function drawCells(ctx: CanvasRenderingContext2D, table: TableElement, images?: ImageLookup) {
  if (!Array.isArray(table.cells)) return;
  ctx.font = `${CELL_FONT_SIZE}px sans-serif`;
  ctx.fillStyle = CELL_INK;
  ctx.textBaseline = "top";
  let top = table.y;
  for (let r = 0; r < table.rows; r++) {
    const row = table.cells[r];
    let left = table.x;
    for (let c = 0; c < table.columns; c++) {
      const width = table.columnWidths[c]!;
      const cell = Array.isArray(row) ? row[c] : undefined;
      if (typeof cell === "string" && cell) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, width, table.rowHeights[r]!);
        ctx.clip();
        const box = { x: left, y: top, width, height: table.rowHeights[r]! };
        if (!drawCellFormula(ctx, cell, box, images)) {
          const lines = wrapLines(ctx, cell, width - 2 * CELL_PADDING);
          fillLines(ctx, lines, left + CELL_PADDING, top + CELL_PADDING, CELL_FONT_SIZE * LINE_HEIGHT);
        }
        ctx.restore();
      }
      left += width;
    }
    top += table.rowHeights[r]!;
  }
}

function drawTable(ctx: CanvasRenderingContext2D, table: TableElement, images?: ImageLookup) {
  ctx.save();
  ctx.strokeStyle = "rgba(100, 120, 150, 0.5)";
  ctx.lineWidth = 1;

  const totalWidth = table.columnWidths.reduce((a, b) => a + b, 0);
  const totalHeight = table.rowHeights.reduce((a, b) => a + b, 0);

  ctx.strokeRect(table.x, table.y, totalWidth, totalHeight);

  let cx = table.x;
  for (let c = 0; c < table.columns - 1; c++) {
    cx += table.columnWidths[c]!;
    ctx.beginPath();
    ctx.moveTo(cx, table.y);
    ctx.lineTo(cx, table.y + totalHeight);
    ctx.stroke();
  }

  let cy = table.y;
  for (let r = 0; r < table.rows - 1; r++) {
    cy += table.rowHeights[r]!;
    ctx.beginPath();
    ctx.moveTo(table.x, cy);
    ctx.lineTo(table.x + totalWidth, cy);
    ctx.stroke();
  }

  drawCells(ctx, table, images);
  ctx.restore();
}

/**
 * Zeichnet ein Element. Formen kommen in Phase 6 dazu — bis dahin werden
 * sie still übersprungen, damit eine von einem neueren Gerät synchronisierte
 * Seite nicht den ganzen Renderer wirft.
 */
export function drawElement(
  ctx: CanvasRenderingContext2D,
  element: PageElement,
  cache?: StrokePathCache,
  images?: ImageLookup,
) {
  switch (element.type) {
    case "stroke":
      drawStroke(ctx, element, cache);
      return;
    case "table":
      drawTable(ctx, element, images);
      return;
    case "latex":
      drawLatex(ctx, element, images);
      return;
    case "text":
      drawText(ctx, element);
      return;
    case "image":
      drawImage(ctx, element, images);
      return;
    default:
      return;
  }
}

export function drawElements(
  ctx: CanvasRenderingContext2D,
  elements: readonly PageElement[],
  cache?: StrokePathCache,
  images?: ImageLookup,
) {
  for (const element of elements) drawElement(ctx, element, cache, images);
}
