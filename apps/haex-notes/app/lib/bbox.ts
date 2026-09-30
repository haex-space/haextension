import type { BBox, PageElement } from "~/types/document";

const EMPTY_BBOX: BBox = [0, 0, 0, 0];

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Achsenparallele Hülle eines Rechtecks, das um seinen eigenen Mittelpunkt gedreht ist. */
export function rotatedRectBbox(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): BBox {
  if (!rotation) return [x, y, width, height];

  const cx = x + width / 2;
  const cy = y + height / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [px, py] of [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ] as [number, number][]) {
    const dx = px - cx;
    const dy = py - cy;
    const rx = cx + dx * cos - dy * sin;
    const ry = cy + dx * sin + dy * cos;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }

  return [minX, minY, maxX - minX, maxY - minY];
}

function pointsBbox(points: readonly (readonly number[])[], pad: number): BBox {
  if (points.length === 0) return [...EMPTY_BBOX] as BBox;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    const px = point[0]!;
    const py = point[1]!;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }

  return [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2];
}

/** Hülle eines Elements. Nach jeder Geometrieänderung neu setzen. */
export function computeBbox(element: PageElement): BBox {
  switch (element.type) {
    case "stroke":
      return pointsBbox(element.points, element.size / 2);
    case "shape": {
      const raw = pointsBbox(element.points, element.strokeWidth / 2);
      return rotatedRectBbox(raw[0], raw[1], raw[2], raw[3], element.rotation);
    }
    case "table":
      return [element.x, element.y, sum(element.columnWidths), sum(element.rowHeights)];
    case "text":
    case "image":
    case "latex":
      return rotatedRectBbox(element.x, element.y, element.width, element.height, element.rotation);
  }
}
