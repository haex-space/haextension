import type { Stencil } from "~/types/stencil";

/** Hit radius of the corner handles in screen pixels (the handles are drawn with radius 6). */
const CORNER_HIT_PX = 12;

/**
 * Whether a world point grabs one of the stencil's corner handles at the given zoom.
 * The radius shrinks on small stencils so their middle stays draggable.
 */
export function isNearStencilCorner(worldX: number, worldY: number, stencil: Stencil, zoom: number): boolean {
  const dx = worldX - stencil.x;
  const dy = worldY - stencil.y;
  const cos = Math.cos(-stencil.rotation);
  const sin = Math.sin(-stencil.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const hw = stencil.width / 2;
  const hh = stencil.height / 2;
  const threshold = Math.min(CORNER_HIT_PX / zoom, Math.min(hw, hh) / 2);

  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];

  for (const c of corners) {
    const dist = Math.hypot(localX - c.x, localY - c.y);
    if (dist < threshold) return true;
  }
  return false;
}
