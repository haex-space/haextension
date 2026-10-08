import type { ViewportState } from "~/database/schemas";

/**
 * Calculates an adaptive grid spacing that looks good at any zoom level.
 * The grid subdivides/multiplies by 5 and 2 alternating, keeping
 * the screen-space spacing between ~40px and ~120px.
 */
function getAdaptiveGridSize(zoom: number): { major: number; minor: number } {
  const targetScreenSpacing = 60;
  const worldSpacing = targetScreenSpacing / zoom;

  // Snap to a "nice" number: powers of 10 * {1, 2, 5}
  const magnitude = Math.pow(10, Math.floor(Math.log10(worldSpacing)));
  const residual = worldSpacing / magnitude;

  let nice: number;
  if (residual <= 1.5) nice = 1;
  else if (residual <= 3.5) nice = 2;
  else if (residual <= 7.5) nice = 5;
  else nice = 10;

  const minor = nice * magnitude;
  const major = minor * 5;

  return { major, minor };
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: ViewportState,
) {
  const { x: panX, y: panY, zoom } = viewport;
  const { major, minor } = getAdaptiveGridSize(zoom);

  // Calculate visible world bounds
  const worldLeft = -panX / zoom;
  const worldTop = -panY / zoom;
  const worldRight = (width - panX) / zoom;
  const worldBottom = (height - panY) / zoom;

  ctx.save();

  // Minor grid lines
  ctx.strokeStyle = "rgba(128, 128, 128, 0.1)";
  ctx.lineWidth = 1 / zoom;

  const minorStartX = Math.floor(worldLeft / minor) * minor;
  const minorStartY = Math.floor(worldTop / minor) * minor;

  for (let x = minorStartX; x <= worldRight; x += minor) {
    ctx.beginPath();
    ctx.moveTo(x, worldTop);
    ctx.lineTo(x, worldBottom);
    ctx.stroke();
  }
  for (let y = minorStartY; y <= worldBottom; y += minor) {
    ctx.beginPath();
    ctx.moveTo(worldLeft, y);
    ctx.lineTo(worldRight, y);
    ctx.stroke();
  }

  // Major grid lines
  ctx.strokeStyle = "rgba(128, 128, 128, 0.2)";
  ctx.lineWidth = 1.5 / zoom;

  const majorStartX = Math.floor(worldLeft / major) * major;
  const majorStartY = Math.floor(worldTop / major) * major;

  for (let x = majorStartX; x <= worldRight; x += major) {
    ctx.beginPath();
    ctx.moveTo(x, worldTop);
    ctx.lineTo(x, worldBottom);
    ctx.stroke();
  }
  for (let y = majorStartY; y <= worldBottom; y += major) {
    ctx.beginPath();
    ctx.moveTo(worldLeft, y);
    ctx.lineTo(worldRight, y);
    ctx.stroke();
  }

  // Origin crosshair (always visible as reference)
  if (worldLeft <= 0 && worldRight >= 0 && worldTop <= 0 && worldBottom >= 0) {
    ctx.strokeStyle = "rgba(100, 100, 255, 0.3)";
    ctx.lineWidth = 2 / zoom;

    // Vertical axis
    ctx.beginPath();
    ctx.moveTo(0, worldTop);
    ctx.lineTo(0, worldBottom);
    ctx.stroke();

    // Horizontal axis
    ctx.beginPath();
    ctx.moveTo(worldLeft, 0);
    ctx.lineTo(worldRight, 0);
    ctx.stroke();
  }

  ctx.restore();
}
