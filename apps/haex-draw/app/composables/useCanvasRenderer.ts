import getStroke from "perfect-freehand";
import type { StrokeData } from "~/database/schemas";
import type { BrushPreset } from "~/types";
import type { Stencil } from "~/types/stencil";
import { BRUSH_PRESETS } from "~/utils/brushPresets";
import { getStencilClipPath } from "~/utils/stencilPresets";

// Seeded random for consistent texture per stroke
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function getSvgPathFromStroke(stroke: [number, number][]) {
  if (stroke.length < 2) return "";

  const d: string[] = [];
  const first = stroke[0]!;
  d.push(`M ${first[0]} ${first[1]}`);

  for (let i = 1; i < stroke.length; i++) {
    const pt = stroke[i]!;
    if (i === 1) {
      d.push(`L ${pt[0]} ${pt[1]}`);
    } else {
      const prev = stroke[i - 1]!;
      const cpX = (prev[0] + pt[0]) / 2;
      const cpY = (prev[1] + pt[1]) / 2;
      d.push(`Q ${prev[0]} ${prev[1]} ${cpX} ${cpY}`);
    }
  }

  d.push("Z");
  return d.join(" ");
}

function getPreset(presetId?: string): BrushPreset {
  return BRUSH_PRESETS.find((p) => p.id === presetId) ?? BRUSH_PRESETS[0]!;
}

/** Get the centerline of a stroke (average of input points, smoothed) */
function getCenterline(points: [number, number, number][]): [number, number, number][] {
  return points;
}

/** Returns the effective fill color — white for eraser presets, otherwise the stroke color */
function getStrokeColor(stroke: StrokeData, preset: BrushPreset): string {
  return preset.isEraser ? "#ffffff" : stroke.color;
}

function renderFillStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
  const hasPressure = stroke.points.some(p => p[2] !== 0.5);
  const outlinePoints = getStroke(stroke.points, {
    size: stroke.size,
    ...preset.options,
    simulatePressure: preset.options.simulatePressure && !hasPressure,
  });
  if (outlinePoints.length < 2) return;
  const pathData = getSvgPathFromStroke(outlinePoints as [number, number][]);
  if (!pathData) return;
  const path = new Path2D(pathData);

  ctx.save();
  if (preset.opacity !== undefined && preset.opacity < 1) {
    ctx.globalAlpha = preset.opacity;
  }
  ctx.fillStyle = getStrokeColor(stroke, preset);
  ctx.fill(path);
  ctx.restore();
}

function renderLineStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
  const pts = getCenterline(stroke.points);
  if (pts.length < 2) return;

  ctx.save();
  ctx.strokeStyle = getStrokeColor(stroke, preset);
  ctx.lineWidth = stroke.size * 0.4;
  ctx.lineCap = preset.lineCap ?? "round";
  ctx.lineJoin = preset.lineJoin ?? "round";

  const first = pts[0]!;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < pts.length; i++) {
    const pt = pts[i]!;
    ctx.lineTo(pt[0], pt[1]);
  }
  ctx.stroke();
  ctx.restore();
}

function renderDashedStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
  const pts = getCenterline(stroke.points);
  if (pts.length < 2) return;

  ctx.save();
  ctx.strokeStyle = getStrokeColor(stroke, preset);
  ctx.lineWidth = stroke.size * 0.4;
  ctx.lineCap = preset.lineCap ?? "round";
  ctx.lineJoin = preset.lineJoin ?? "round";
  ctx.setLineDash(preset.dashPattern ?? [8, 6]);

  const first = pts[0]!;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < pts.length; i++) {
    const pt = pts[i]!;
    ctx.lineTo(pt[0], pt[1]);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function renderDotsStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
  const pts = stroke.points;
  if (pts.length < 1) return;

  const density = preset.dotDensity ?? 3;
  const [minR, maxR] = preset.dotRadiusRange ?? [0.1, 0.4];
  const opacity = preset.opacity ?? 0.6;
  const size = stroke.size;

  const firstPt = pts[0]!;
  const seed = Math.abs(Math.round(firstPt[0] * 1000 + firstPt[1] * 7));
  const rng = seededRandom(seed);

  ctx.save();
  ctx.fillStyle = getStrokeColor(stroke, preset);

  for (let i = 0; i < pts.length; i++) {
    const [px, py, pressure] = pts[i]!;
    const pFactor = pressure ?? 0.5;
    const spread = size * (0.5 + pFactor);

    for (let d = 0; d < density; d++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * spread;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const baseR = size * (minR + rng() * (maxR - minR));

      ctx.globalAlpha = opacity * (0.3 + rng() * 0.7);

      // Irregular splatter shapes instead of perfect circles
      const vertices = 5 + Math.floor(rng() * 4); // 5-8 vertices
      ctx.beginPath();
      for (let v = 0; v < vertices; v++) {
        const va = (v / vertices) * Math.PI * 2;
        const vr = baseR * (0.5 + rng() * 0.8); // irregular radius
        const vx = px + dx + Math.cos(va) * vr;
        const vy = py + dy + Math.sin(va) * vr;
        if (v === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function renderSprayStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
  const pts = stroke.points;
  if (pts.length < 1) return;

  const color = getStrokeColor(stroke, preset);
  const opacity = preset.opacity ?? 0.8;
  const size = stroke.size;

  // Parse color to RGB for gradient
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  ctx.save();

  // For each point, draw a radial gradient circle:
  // dense opaque center → transparent edges
  const step = Math.max(1, Math.floor(size * 0.05));
  for (let i = 0; i < pts.length; i += step) {
    const [px, py, pressure] = pts[i]!;
    const p = pressure > 0 ? pressure : 0.5;
    const radius = size * (1.5 + p * 0.5);

    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},${opacity * p * 0.7})`);
    grad.addColorStop(0.3, `rgba(${r},${g},${b},${opacity * p * 0.4})`);
    grad.addColorStop(0.6, `rgba(${r},${g},${b},${opacity * p * 0.12})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Add fine speckle particles at the outer edges for texture
  const firstPt = pts[0]!;
  const seed = Math.abs(Math.round(firstPt[0] * 1000 + firstPt[1] * 7));
  const rng = seededRandom(seed);

  ctx.fillStyle = color;
  for (let i = 0; i < pts.length; i += step * 2) {
    const [px, py, pressure] = pts[i]!;
    const p = pressure > 0 ? pressure : 0.5;
    const spread = size * 1.8;

    for (let d = 0; d < 6; d++) {
      const angle = rng() * Math.PI * 2;
      const dist = (size * 0.5) + rng() * spread;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const pr = size * (0.02 + rng() * 0.06);

      // Fade opacity with distance from center
      const distFactor = 1 - Math.min(dist / (spread + size * 0.5), 1);
      ctx.globalAlpha = opacity * p * distFactor * (0.2 + rng() * 0.3);
      ctx.beginPath();
      ctx.arc(px + dx, py + dy, pr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function renderChalkStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
  const hasPressure = stroke.points.some(p => p[2] !== 0.5);
  const opacity = preset.opacity ?? 0.85;
  const jitter = preset.jitter ?? 1.0;

  const seedPt = stroke.points[0]!;
  const seed = Math.abs(Math.round(seedPt[0] * 100 + seedPt[1] * 7));
  const rng = seededRandom(seed);

  // Main filled stroke body
  const outlinePoints = getStroke(stroke.points, {
    size: stroke.size,
    ...preset.options,
    simulatePressure: preset.options.simulatePressure && !hasPressure,
  });
  if (outlinePoints.length < 2) return;
  const pathData = getSvgPathFromStroke(outlinePoints as [number, number][]);
  if (!pathData) return;
  const path = new Path2D(pathData);

  // Draw the solid chalk body
  ctx.save();
  ctx.globalAlpha = opacity * 0.7;
  ctx.fillStyle = getStrokeColor(stroke, preset);
  ctx.fill(path);
  ctx.restore();

  // Grain texture: many tiny micro-holes for a dusty chalk surface
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const pts = stroke.points;
  for (let i = 0; i < pts.length; i += 2) {
    const [px, py] = pts[i]!;
    const grainCount = Math.ceil(jitter * 5);
    for (let g = 0; g < grainCount; g++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * stroke.size * 0.4;
      const gx = px + Math.cos(angle) * dist;
      const gy = py + Math.sin(angle) * dist;
      // Very tiny holes — just 1-2px effective
      const gr = stroke.size * (0.005 + rng() * 0.015);
      ctx.globalAlpha = 0.15 + rng() * 0.25;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function renderMultiStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
  const count = preset.multiStrokeCount ?? 3;
  const spread = preset.multiStrokeSpread ?? 2;
  const opacity = preset.opacity ?? 0.15;
  const hasPressure = stroke.points.some(p => p[2] !== 0.5);

  const seedPt = stroke.points[0]!;
  const seed = Math.abs(Math.round(seedPt[0] * 100 + seedPt[1] * 7));
  const rng = seededRandom(seed);

  ctx.save();
  ctx.globalAlpha = opacity;

  for (let s = 0; s < count; s++) {
    const offsetX = (rng() - 0.5) * spread * stroke.size;
    const offsetY = (rng() - 0.5) * spread * stroke.size;
    const sizeJitter = 0.8 + rng() * 0.4;

    const shiftedPoints = stroke.points.map(p => [
      p[0] + offsetX + (rng() - 0.5) * spread * 0.5,
      p[1] + offsetY + (rng() - 0.5) * spread * 0.5,
      p[2],
    ]);

    const outlinePoints = getStroke(shiftedPoints, {
      size: stroke.size * sizeJitter,
      ...preset.options,
      simulatePressure: preset.options.simulatePressure && !hasPressure,
    });
    if (outlinePoints.length < 2) continue;

    const pathData = getSvgPathFromStroke(outlinePoints as [number, number][]);
    if (!pathData) continue;

    ctx.fillStyle = getStrokeColor(stroke, preset);
    ctx.fill(new Path2D(pathData));
  }
  ctx.restore();
}

function renderWatercolorStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
  const hasPressure = stroke.points.some(p => p[2] !== 0.5);
  const opacity = preset.opacity ?? 0.35;
  const baseOpts = {
    ...preset.options,
    simulatePressure: preset.options.simulatePressure && !hasPressure,
  };

  // Outer bleed: large, very soft, barely visible — simulates water spreading
  const outerBleed = getStroke(stroke.points, {
    ...baseOpts,
    size: stroke.size * 1.6,
    thinning: 0.02,
  });
  if (outerBleed.length >= 2) {
    const path = getSvgPathFromStroke(outerBleed as [number, number][]);
    if (path) {
      ctx.save();
      ctx.globalAlpha = opacity * 0.08;
      ctx.fillStyle = getStrokeColor(stroke, preset);
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = stroke.size * 1.2;
      ctx.fill(new Path2D(path));
      ctx.restore();
    }
  }

  // Inner bleed: medium, soft
  const innerBleed = getStroke(stroke.points, {
    ...baseOpts,
    size: stroke.size * 1.2,
    thinning: 0.05,
  });
  if (innerBleed.length >= 2) {
    const path = getSvgPathFromStroke(innerBleed as [number, number][]);
    if (path) {
      ctx.save();
      ctx.globalAlpha = opacity * 0.15;
      ctx.fillStyle = getStrokeColor(stroke, preset);
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = stroke.size * 0.5;
      ctx.fill(new Path2D(path));
      ctx.restore();
    }
  }

  // Main body: the core pigment — no shadow, just a soft transparent fill
  const bodyPoints = getStroke(stroke.points, {
    ...baseOpts,
    size: stroke.size,
  });
  if (bodyPoints.length < 2) return;
  const bodyPath = getSvgPathFromStroke(bodyPoints as [number, number][]);
  if (!bodyPath) return;

  ctx.save();
  ctx.globalAlpha = opacity * 0.45;
  ctx.fillStyle = getStrokeColor(stroke, preset);
  ctx.fill(new Path2D(bodyPath));
  ctx.restore();
}

function renderTexturedStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
  const hasPressure = stroke.points.some(p => p[2] !== 0.5);
  const jitter = preset.jitter ?? 0.5;
  const opacity = preset.opacity ?? 0.85;

  const seedPt = stroke.points[0]!;
  const seed = Math.abs(Math.round(seedPt[0] * 100 + seedPt[1] * 7));
  const rng = seededRandom(seed);

  // Main fill stroke
  const outlinePoints = getStroke(stroke.points, {
    size: stroke.size,
    ...preset.options,
    simulatePressure: preset.options.simulatePressure && !hasPressure,
  });
  if (outlinePoints.length < 2) return;
  const pathData = getSvgPathFromStroke(outlinePoints as [number, number][]);
  if (!pathData) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = getStrokeColor(stroke, preset);
  ctx.fill(new Path2D(pathData));

  // Add texture dots along the edges for roughness
  ctx.globalAlpha = opacity * 0.4;
  const pts = stroke.points;
  for (let i = 0; i < pts.length; i += 2) {
    const [px, py, pressure] = pts[i]!;
    const pFactor = pressure ?? 0.5;
    const texCount = Math.ceil(jitter * 3);
    for (let t = 0; t < texCount; t++) {
      const angle = rng() * Math.PI * 2;
      const dist = (stroke.size * 0.3) + rng() * (stroke.size * 0.3 * pFactor);
      const r = stroke.size * 0.05 + rng() * stroke.size * 0.08;
      ctx.beginPath();
      ctx.arc(px + Math.cos(angle) * dist, py + Math.sin(angle) * dist, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

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


function renderStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData) {
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

// Cache for loaded images (stencil id → HTMLImageElement)
const imageCache = new Map<string, HTMLImageElement>();
const imageLoading = new Set<string>();

// Cache for rendered emoji (emoji char → HTMLCanvasElement)
const emojiCache = new Map<string, HTMLCanvasElement>();

function getOrRenderEmoji(emoji: string, size: number): HTMLCanvasElement {
  const key = `${emoji}_${size}`;
  const cached = emojiCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${size * 0.85}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2);
  emojiCache.set(key, canvas);
  return canvas;
}

function getOrLoadImage(stencil: Stencil): HTMLImageElement | null {
  if (!stencil.imageData) return null;

  const cached = imageCache.get(stencil.id);
  if (cached && cached.complete && cached.naturalWidth > 0) return cached;

  // Already loading
  if (imageLoading.has(stencil.id)) return null;

  imageLoading.add(stencil.id);
  const img = new Image();
  img.onload = () => {
    imageCache.set(stencil.id, img);
    imageLoading.delete(stencil.id);
  };
  img.onerror = () => {
    imageLoading.delete(stencil.id);
  };
  img.src = stencil.imageData;
  imageCache.set(stencil.id, img);
  return img;
}

function renderStencil(ctx: CanvasRenderingContext2D, stencil: Stencil, isHovered: boolean, isSelected: boolean, zoom: number) {
  const hw = stencil.width / 2;
  const hh = stencil.height / 2;

  ctx.save();
  ctx.translate(stencil.x, stencil.y);
  ctx.rotate(stencil.rotation);

  // Emoji stencil: draw pre-rendered emoji image
  if (stencil.shapeType === "emoji" && stencil.emoji) {
    const renderSize = Math.max(128, Math.round(Math.min(stencil.width, stencil.height)));
    const emojiCanvas = getOrRenderEmoji(stencil.emoji, renderSize);
    if (stencil.opacity !== undefined && stencil.opacity < 1) {
      ctx.globalAlpha = stencil.opacity;
    }
    ctx.drawImage(emojiCanvas, -hw, -hh, stencil.width, stencil.height);

    // Selection border
    if (isSelected || isHovered) {
      ctx.strokeStyle = isSelected ? "rgba(100, 100, 255, 0.7)" : "rgba(100, 100, 255, 0.5)";
      ctx.lineWidth = (isSelected ? 2 : 1) / zoom;
      ctx.setLineDash(isSelected ? [] : [8 / zoom, 4 / zoom]);
      ctx.strokeRect(-hw, -hh, stencil.width, stencil.height);
      ctx.setLineDash([]);
    }

    // Rotation handles
    if (isSelected && !stencil.pinned) {
      const handleSize = 6 / zoom;
      const corners: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      ctx.fillStyle = "rgba(100, 100, 255, 0.8)";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5 / zoom;
      for (const [cx, cy] of corners) {
        ctx.beginPath();
        ctx.arc(cx, cy, handleSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
    return;
  }

  // Image stencil: draw the image as background
  if (stencil.shapeType === "image" && stencil.imageData) {
    const img = getOrLoadImage(stencil);
    if (img) {
      ctx.save();
      if (stencil.opacity !== undefined && stencil.opacity < 1) {
        ctx.globalAlpha = stencil.opacity;
      }
      // Apply CSS-like filters (saturation, brightness, contrast)
      const filters: string[] = [];
      if (stencil.saturation !== undefined && stencil.saturation !== 1) {
        filters.push(`saturate(${stencil.saturation})`);
      }
      if (stencil.brightness !== undefined && stencil.brightness !== 1) {
        filters.push(`brightness(${stencil.brightness})`);
      }
      if (stencil.contrast !== undefined && stencil.contrast !== 1) {
        filters.push(`contrast(${stencil.contrast})`);
      }
      if (filters.length > 0) {
        ctx.filter = filters.join(" ");
      }
      ctx.drawImage(img, -hw, -hh, stencil.width, stencil.height);
      ctx.restore();
    }

    // Border
    ctx.strokeStyle = isSelected ? "rgba(100, 100, 255, 0.7)" : isHovered ? "rgba(100, 100, 255, 0.5)" : "rgba(100, 100, 200, 0.15)";
    ctx.lineWidth = (isSelected || isHovered ? 2 : 1) / zoom;
    ctx.setLineDash(isSelected ? [] : [8 / zoom, 4 / zoom]);
    ctx.strokeRect(-hw, -hh, stencil.width, stencil.height);
    ctx.setLineDash([]);

    // Label
    const fontSize = Math.max(12, 14 / zoom);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = isHovered || isSelected ? "rgba(100, 100, 255, 0.7)" : "rgba(100, 100, 200, 0.35)";
    ctx.textAlign = "center";
    ctx.fillText(stencil.label.toUpperCase(), 0, -hh - 8 / zoom);

    // Rotation handles
    if (isSelected && !stencil.pinned) {
      const handleSize = 6 / zoom;
      const corners: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      ctx.fillStyle = "rgba(100, 100, 255, 0.8)";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5 / zoom;
      for (const [cx, cy] of corners) {
        ctx.beginPath();
        ctx.arc(cx, cy, handleSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
    return;
  }

  const clipPath = getStencilClipPath(stencil.shapeType, hw, hh, stencil.svgPath);

  // Semi-transparent white fill
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#000000";
  ctx.fill(clipPath);
  ctx.restore();

  // Border
  ctx.strokeStyle = isSelected ? "rgba(100, 100, 255, 0.7)" : isHovered ? "rgba(100, 100, 255, 0.5)" : "rgba(100, 100, 200, 0.25)";
  ctx.lineWidth = (isSelected || isHovered ? 2 : 1.5) / zoom;
  ctx.setLineDash(isSelected ? [] : [8 / zoom, 4 / zoom]);
  ctx.stroke(clipPath);
  ctx.setLineDash([]);

  // Label
  const fontSize = Math.max(12, 14 / zoom);
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = isHovered || isSelected ? "rgba(100, 100, 255, 0.7)" : "rgba(100, 100, 200, 0.35)";
  ctx.textAlign = "center";
  ctx.fillText(stencil.label.toUpperCase(), 0, -hh - 8 / zoom);

  // Rotation corner handles (only on selected, non-pinned)
  if (isSelected && !stencil.pinned) {
    const handleSize = 6 / zoom;
    const corners: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    ctx.fillStyle = "rgba(100, 100, 255, 0.8)";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5 / zoom;
    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, handleSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function useCanvasRenderer(canvasEl: Ref<HTMLCanvasElement | null>) {
  const canvas = useCanvasStore();
  const stencilStore = useStencilStore();
  const animFrameId = ref(0);

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const { x: panX, y: panY, zoom } = canvas.viewport;
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
  };

  const render = () => {
    const el = canvasEl.value;
    if (!el) return;

    const ctx = el.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = el.clientWidth;
    const height = el.clientHeight;

    // Size canvas to match display
    if (el.width !== width * dpr || el.height !== height * dpr) {
      el.width = width * dpr;
      el.height = height * dpr;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, el.width, el.height);

    // Apply DPR + viewport transform
    const { x: panX, y: panY, zoom } = canvas.viewport;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * panX, dpr * panY);

    // Grid (infinite, adaptive)
    drawGrid(ctx, width, height);

    // Render stencils first (below strokes — images/emojis as background to paint on)
    for (const stencil of stencilStore.sortedStencils) {
      const isHovered = stencil.id === stencilStore.hoveredId;
      const isSelected = stencilStore.isSelected(stencil.id);
      renderStencil(ctx, stencil, isHovered, isSelected, canvas.viewport.zoom);
    }

    // Render all strokes (on top of stencils — so you can paint on images)
    for (const stroke of canvas.strokes) {
      renderStroke(ctx, stroke);
    }

    // Render current stroke (while drawing)
    if (canvas.currentStroke) {
      renderStroke(ctx, canvas.currentStroke);
    }
  };

  const startRenderLoop = () => {
    const loop = () => {
      render();
      animFrameId.value = requestAnimationFrame(loop);
    };
    animFrameId.value = requestAnimationFrame(loop);
  };

  const stopRenderLoop = () => {
    cancelAnimationFrame(animFrameId.value);
  };

  return {
    render,
    startRenderLoop,
    stopRenderLoop,
  };
}
