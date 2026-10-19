import type { CropRect } from "~/types";

export type CropEdge = "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";

/**
 * The crop rect after dragging `edge` to (`x`, `y`), both already clamped to the image. The opposite
 * edge or corner stays put; with an aspect `ratio`, the rect shrinks to fit it while staying inside `bounds`.
 */
export function resizeCropRect(
  rect: CropRect,
  edge: CropEdge,
  x: number,
  y: number,
  ratio: number | null,
  bounds: { width: number; height: number },
): CropRect {
  const movesLeft = edge.includes("l");
  const movesTop = edge.includes("t");
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (movesLeft) left = Math.min(x, right - 1);
  if (edge.includes("r")) right = Math.max(x, left + 1);
  if (movesTop) top = Math.min(y, bottom - 1);
  if (edge.includes("b")) bottom = Math.max(y, top + 1);

  if (ratio) {
    let width = right - left;
    let height = bottom - top;
    if (edge === "t" || edge === "b") {
      width = Math.min(height * ratio, bounds.width - left);
      height = width / ratio;
    } else if (edge === "l" || edge === "r") {
      height = Math.min(width / ratio, bounds.height - top);
      width = height * ratio;
    } else if (width / height > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
    if (movesLeft) left = right - width;
    else right = left + width;
    if (movesTop) top = bottom - height;
    else bottom = top + height;
  }

  // Rounding the edges, not the size, keeps the fixed edge exactly where it was
  const x0 = Math.round(left);
  const y0 = Math.round(top);
  return { x: x0, y: y0, width: Math.round(right) - x0, height: Math.round(bottom) - y0 };
}
