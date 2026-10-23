import type { Box } from "~/lib/elementEdits";
import type { Point } from "~/lib/selection";

/** Kleiner ist kein gewolltes Rechteck, sondern ein Tippen (Bildschirmpixel). */
const MIN_SIDE = 12;

/**
 * Ein Rechteck auf der Seite aufziehen, über einer Stelle, die per Nahfoto neu gelesen werden soll
 * (FR-021 in haex-space/haex-vault@e4b28be9d22e8c0839f8652908b35b78e04c9c6e:specs/046-paper-notes-canvas/spec.md).
 */
export function useAreaPick(redrawOverlay: () => void, onPicked: (box: Box) => void) {
  let start: Point | null = null;
  let area: Box | null = null;
  let zoom = 1;

  const boxBetween = (a: Point, b: Point): Box => ({
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y),
  });

  function pointerDown(point: Point, currentZoom: number) {
    start = point;
    zoom = currentZoom;
    area = null;
  }

  /** true, solange ein Rechteck aufgezogen wird. */
  function pointerMove(point: Point): boolean {
    if (!start) return false;
    area = boxBetween(start, point);
    redrawOverlay();
    return true;
  }

  function pointerUp(): boolean {
    if (!start) return false;
    const picked = area;
    start = null;
    area = null;
    redrawOverlay();
    if (picked && Math.min(picked.width, picked.height) * zoom >= MIN_SIDE) onPicked(picked);
    return true;
  }

  function drawArea(ctx: CanvasRenderingContext2D, currentZoom: number) {
    if (!area) return;
    ctx.save();
    ctx.fillStyle = "rgba(59, 130, 246, 0.12)";
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5 / currentZoom;
    ctx.setLineDash([6 / currentZoom, 4 / currentZoom]);
    ctx.fillRect(area.x, area.y, area.width, area.height);
    ctx.strokeRect(area.x, area.y, area.width, area.height);
    ctx.restore();
  }

  return { pointerDown, pointerMove, pointerUp, drawArea };
}
