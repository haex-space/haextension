import type { SvgViewBox } from "~/types/stencil";

type Matrix = [number, number, number, number, number, number];

/**
 * Affine matrix `[a, b, c, d, e, f]` that maps SVG path coordinates into a stencil's local
 * space (centered at the origin, `2·hw` × `2·hh`), so the shape follows every resize.
 * Stencils saved before the view box was recorded keep their path units and are only centered.
 */
export function svgPathMatrix(hw: number, hh: number, viewBox?: SvgViewBox): Matrix {
  if (!viewBox) return [1, 0, 0, 1, -hw, -hh];
  const sx = (2 * hw) / viewBox.width;
  const sy = (2 * hh) / viewBox.height;
  return [sx, 0, 0, sy, -hw - sx * viewBox.x, -hh - sy * viewBox.y];
}

/** Coordinate space of an imported SVG: its `viewBox`, else its `width`/`height`; null without a usable size. */
export function parseSvgViewBox(viewBox: string | null, width: string | null, height: string | null): SvgViewBox | null {
  const parts = viewBox?.trim().split(/[\s,]+/).map(Number) ?? [];
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    const [x, y, w, h] = parts as [number, number, number, number];
    if (w > 0 && h > 0) return { x, y, width: w, height: h };
  }

  const w = Number.parseFloat(width ?? "");
  const h = Number.parseFloat(height ?? "");
  return w > 0 && h > 0 ? { x: 0, y: 0, width: w, height: h } : null;
}
