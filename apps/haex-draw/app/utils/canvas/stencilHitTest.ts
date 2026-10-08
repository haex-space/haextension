import type { Stencil } from "~/types/stencil";

const BORDER_THRESHOLD = 15; // px in world space

const CORNER_THRESHOLD = 30;

export function isNearStencilCorner(worldX: number, worldY: number, stencil: Stencil): boolean {
  const dx = worldX - stencil.x;
  const dy = worldY - stencil.y;
  const cos = Math.cos(-stencil.rotation);
  const sin = Math.sin(-stencil.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const hw = stencil.width / 2;
  const hh = stencil.height / 2;

  // Check proximity to each corner (from outside the bounding box)
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];

  for (const c of corners) {
    const dist = Math.hypot(localX - c.x, localY - c.y);
    if (dist < CORNER_THRESHOLD) return true;
  }
  return false;
}

function isNearStencilBorder(worldX: number, worldY: number, stencil: Stencil): boolean {
  // Transform point into stencil's local (rotation-corrected) space
  const dx = worldX - stencil.x;
  const dy = worldY - stencil.y;
  const cos = Math.cos(-stencil.rotation);
  const sin = Math.sin(-stencil.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const hw = stencil.width / 2;
  const hh = stencil.height / 2;

  // Must be inside the bounding box
  if (localX < -hw || localX > hw || localY < -hh || localY > hh) return false;

  // Check if near any edge
  const distLeft = Math.abs(localX + hw);
  const distRight = Math.abs(localX - hw);
  const distTop = Math.abs(localY + hh);
  const distBottom = Math.abs(localY - hh);

  return Math.min(distLeft, distRight, distTop, distBottom) < BORDER_THRESHOLD;
}
