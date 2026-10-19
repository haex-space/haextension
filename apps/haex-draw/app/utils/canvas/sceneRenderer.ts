import type { StrokeData } from "~/database/schemas";
import type { Stencil } from "~/types/stencil";
import { preloadStencilImagesAsync, renderStencil, type StencilDecoration } from "./stencilRenderer";
import { renderStroke } from "./strokeRenderer";

export interface SceneBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type LayerItem =
  | { kind: "stroke"; stroke: StrokeData; z: number }
  | { kind: "stencil"; stencil: Stencil; z: number };

/**
 * Draws strokes and stencils in z-order, in world coordinates.
 * `decorationOf` adds the editor overlays (guides, borders, handles); exports pass none.
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  strokes: readonly StrokeData[],
  stencils: readonly Stencil[],
  decorationOf?: (stencil: Stencil) => StencilDecoration,
) {
  const layers: LayerItem[] = [];
  for (const stroke of strokes) {
    layers.push({ kind: "stroke", stroke, z: stroke.zIndex ?? 0 });
  }
  for (const stencil of stencils) {
    layers.push({ kind: "stencil", stencil, z: stencil.zIndex ?? 0 });
  }
  layers.sort((a, b) => a.z - b.z);

  for (const item of layers) {
    if (item.kind === "stroke") {
      renderStroke(ctx, item.stroke);
    } else {
      renderStencil(ctx, item.stencil, decorationOf?.(item.stencil) ?? null);
    }
  }
}

// Spray, watercolor and sketch brushes paint up to about 2.5× the brush size beyond the path.
const STROKE_REACH_FACTOR = 2.5;

/** Whether a stencil shows up in exports; shape stencils are editor guides only. */
export function isContentStencil(stencil: Stencil): boolean {
  return (stencil.shapeType === "image" && !!stencil.imageData) || (stencil.shapeType === "emoji" && !!stencil.emoji);
}

/** World-space box around everything an export renders, or null for an empty scene. */
export function computeSceneBounds(strokes: readonly StrokeData[], stencils: readonly Stencil[]): SceneBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (x: number, y: number, reach: number) => {
    minX = Math.min(minX, x - reach);
    minY = Math.min(minY, y - reach);
    maxX = Math.max(maxX, x + reach);
    maxY = Math.max(maxY, y + reach);
  };

  for (const stroke of strokes) {
    const reach = stroke.size * STROKE_REACH_FACTOR;
    for (const [x, y] of stroke.points) include(x, y, reach);
  }

  for (const stencil of stencils) {
    if (!isContentStencil(stencil)) continue;
    const cos = Math.cos(stencil.rotation);
    const sin = Math.sin(stencil.rotation);
    const hw = stencil.width / 2;
    const hh = stencil.height / 2;
    for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const) {
      include(stencil.x + lx * cos - ly * sin, stencil.y + lx * sin + ly * cos, 0);
    }
  }

  return minX <= maxX ? { minX, minY, maxX, maxY } : null;
}

/**
 * Renders the scene's content onto a new white canvas cropped to its bounds (plus `padding`),
 * scaled down to fit `maxWidth`×`maxHeight` when given. Null when there is nothing to render.
 */
export async function rasterizeSceneAsync(
  strokes: readonly StrokeData[],
  stencils: readonly Stencil[],
  options: { padding: number; maxWidth?: number; maxHeight?: number },
): Promise<HTMLCanvasElement | null> {
  const bounds = computeSceneBounds(strokes, stencils);
  if (!bounds) return null;

  const minX = bounds.minX - options.padding;
  const minY = bounds.minY - options.padding;
  const fullW = Math.ceil(bounds.maxX + options.padding - minX);
  const fullH = Math.ceil(bounds.maxY + options.padding - minY);
  const scale = Math.min((options.maxWidth ?? fullW) / fullW, (options.maxHeight ?? fullH) / fullH, 1);

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(fullW * scale);
  canvas.height = Math.ceil(fullH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  await preloadStencilImagesAsync(stencils);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(-minX, -minY);
  renderScene(ctx, strokes, stencils);
  return canvas;
}
