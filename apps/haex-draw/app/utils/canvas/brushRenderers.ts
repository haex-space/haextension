import getStroke from "perfect-freehand";
import type { StrokeData } from "~/database/schemas";
import type { BrushPreset } from "~/types";
import { getCenterline, getStrokeColor, getSvgPathFromStroke, seededRandom } from "./strokeHelpers";

export function renderFillStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
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

export function renderLineStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
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

export function renderDashedStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
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

export function renderDotsStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
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

export function renderSprayStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
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

export function renderChalkStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
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

export function renderMultiStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
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

export function renderWatercolorStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
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

export function renderTexturedStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, preset: BrushPreset) {
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
