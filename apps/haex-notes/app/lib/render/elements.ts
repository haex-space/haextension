import getStroke from "perfect-freehand";
import type { PageElement, StrokeElement, TableElement } from "~/types/document";

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

function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeElement) {
  const path = strokeToPath(stroke);
  if (!path) return;
  ctx.save();
  if (stroke.brushPreset === "marker" || stroke.brushPreset === "highlighter") {
    ctx.globalAlpha = 0.35;
  }
  ctx.fillStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
  ctx.fill(new Path2D(path));
  ctx.restore();
}

function drawTable(ctx: CanvasRenderingContext2D, table: TableElement) {
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

  ctx.restore();
}

/**
 * Zeichnet ein Element. Text, Bild, Form und LaTeX kommen in den Phasen 3 und 6
 * dazu — bis dahin werden sie still übersprungen, damit eine von einem neueren
 * Gerät synchronisierte Seite nicht den ganzen Renderer wirft.
 */
export function drawElement(ctx: CanvasRenderingContext2D, element: PageElement) {
  switch (element.type) {
    case "stroke":
      drawStroke(ctx, element);
      return;
    case "table":
      drawTable(ctx, element);
      return;
    default:
      return;
  }
}

export function drawElements(ctx: CanvasRenderingContext2D, elements: readonly PageElement[]) {
  for (const element of elements) drawElement(ctx, element);
}
