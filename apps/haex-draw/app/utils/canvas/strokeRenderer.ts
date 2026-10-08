import type { StrokeData } from "~/database/schemas";
import {
  renderChalkStroke,
  renderDashedStroke,
  renderDotsStroke,
  renderFillStroke,
  renderLineStroke,
  renderMultiStroke,
  renderSprayStroke,
  renderTexturedStroke,
  renderWatercolorStroke,
} from "./brushRenderers";
import { getPreset, getStrokeColor, getSvgPathFromStroke } from "./strokeHelpers";

/**
 * Build a stroke outline manually for flat/chisel brush tips.
 * Instead of using perfect-freehand (which always uses circular cross-sections),
 * we place flat rectangles along the path, oriented at a fixed tip angle.
 */
function buildFlatTipOutline(
  points: [number, number, number][],
  size: number,
  tip: "flat" | "chisel",
): [number, number][] | null {
  if (points.length < 2) return null;

  const tipAngle = Math.PI / 4; // 45° angle for the flat edge
  const halfW = size / 2;       // half-width along the flat axis
  const halfH = tip === "flat" ? size * 0.12 : size * 0.08; // half-height (narrow axis)

  // Perpendicular offsets for the flat tip shape
  const cosA = Math.cos(tipAngle);
  const sinA = Math.sin(tipAngle);

  const upper: [number, number][] = [];
  const lower: [number, number][] = [];

  for (let i = 0; i < points.length; i++) {
    const [px, py, pressure] = points[i]!;
    const p = pressure > 0 ? pressure : 0.5;

    // Calculate movement direction for smooth interpolation
    let dx = 0, dy = 0;
    if (i < points.length - 1) {
      const next = points[i + 1]!;
      dx = next[0] - px;
      dy = next[1] - py;
    } else if (i > 0) {
      const prev = points[i - 1]!;
      dx = px - prev[0];
      dy = py - prev[1];
    }

    const moveAngle = Math.atan2(dy, dx);
    // How much the movement aligns with the tip's flat axis
    const angleDiff = Math.abs(Math.sin(moveAngle - tipAngle));

    // Width along flat axis varies: full width when perpendicular, narrow when parallel
    const w = halfW * (0.3 + angleDiff * 0.7) * p;
    const h = halfH * p;

    // Place an ellipse-like cross-section rotated to the tip angle
    // Upper edge: offset perpendicular to tip angle
    upper.push([
      px + cosA * w - sinA * h,
      py + sinA * w + cosA * h,
    ]);
    // Lower edge
    lower.push([
      px - cosA * w + sinA * h,
      py - sinA * w - cosA * h,
    ]);
  }

  // Combine into a closed outline: upper forward, lower backward
  return [...upper, ...lower.reverse()];
}


export function renderStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData) {
  // Flat/chisel tip: use custom outline generator for fill-based render modes
  const tip = stroke.brushTip;
  if (tip && tip !== "round" && !getPreset(stroke.brushPreset).isEraser) {
    const preset = getPreset(stroke.brushPreset);
    // For fill-based modes, use the flat tip outline
    if (preset.renderMode === "fill" || preset.renderMode === "textured" || preset.renderMode === "chalk" || preset.renderMode === "watercolor") {
      const outline = buildFlatTipOutline(stroke.points, stroke.size, tip);
      if (!outline || outline.length < 3) return;
      const pathData = getSvgPathFromStroke(outline);
      if (!pathData) return;
      const path = new Path2D(pathData);

      ctx.save();
      if (preset.opacity !== undefined && preset.opacity < 1) {
        ctx.globalAlpha = preset.opacity;
      }
      ctx.fillStyle = getStrokeColor(stroke, preset);
      ctx.fill(path);
      ctx.restore();
      return;
    }
    // For stroke/dashed modes, use lineWidth modulation via the standard path
  }

  const preset = getPreset(stroke.brushPreset);
  switch (preset.renderMode) {
    case "stroke":
      renderLineStroke(ctx, stroke, preset);
      break;
    case "dashed":
      renderDashedStroke(ctx, stroke, preset);
      break;
    case "dots":
      renderDotsStroke(ctx, stroke, preset);
      break;
    case "multi-stroke":
      renderMultiStroke(ctx, stroke, preset);
      break;
    case "textured":
      renderTexturedStroke(ctx, stroke, preset);
      break;
    case "watercolor":
      renderWatercolorStroke(ctx, stroke, preset);
      break;
    case "chalk":
      renderChalkStroke(ctx, stroke, preset);
      break;
    case "spray":
      renderSprayStroke(ctx, stroke, preset);
      break;
    case "fill":
    default:
      renderFillStroke(ctx, stroke, preset);
      break;
  }
}
