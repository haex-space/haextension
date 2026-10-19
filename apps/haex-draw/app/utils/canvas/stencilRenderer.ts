import type { Stencil } from "~/types/stencil";
import { getStencilClipPath } from "~/utils/stencilPresets";

interface CachedImage {
  /** Source the image was loaded from; a crop replaces the stencil's source under the same id. */
  src: string;
  img: HTMLImageElement;
  failed: boolean;
}

// Cache for loaded images (stencil id → image of its current source)
const imageCache = new Map<string, CachedImage>();

// Cache for rendered emoji (emoji char + raster size → HTMLCanvasElement), least recently used first
const emojiCache = new Map<string, HTMLCanvasElement>();
const EMOJI_CACHE_MAX = 32;
const EMOJI_RASTER_MIN = 128;
const EMOJI_RASTER_MAX = 1024;

/**
 * Raster size for an emoji stencil. Power-of-two buckets keep a continuous resize
 * from allocating one canvas per pixel size.
 */
export function emojiRasterSize(width: number, height: number): number {
  const target = Math.min(Math.max(Math.min(width, height), EMOJI_RASTER_MIN), EMOJI_RASTER_MAX);
  return 2 ** Math.ceil(Math.log2(target));
}

function getOrRenderEmoji(emoji: string, size: number): HTMLCanvasElement {
  const key = `${emoji}_${size}`;
  const cached = emojiCache.get(key);
  if (cached) {
    emojiCache.delete(key);
    emojiCache.set(key, cached);
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${size * 0.85}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2);
  emojiCache.set(key, canvas);
  if (emojiCache.size > EMOJI_CACHE_MAX) {
    const oldest = emojiCache.keys().next().value;
    if (oldest !== undefined) emojiCache.delete(oldest);
  }
  return canvas;
}

function getOrLoadImageEntry(stencil: Stencil): CachedImage | null {
  if (!stencil.imageData) return null;

  const cached = imageCache.get(stencil.id);
  if (cached && cached.src === stencil.imageData) {
    // Keep the stencil's own string so the next comparison is a cheap reference check.
    cached.src = stencil.imageData;
    return cached;
  }

  const entry: CachedImage = { src: stencil.imageData, img: new Image(), failed: false };
  entry.img.onerror = () => {
    entry.failed = true;
  };
  entry.img.src = stencil.imageData;
  imageCache.set(stencil.id, entry);
  return entry;
}

function getOrLoadImage(stencil: Stencil): HTMLImageElement | null {
  const entry = getOrLoadImageEntry(stencil);
  return entry && !entry.failed && entry.img.complete && entry.img.naturalWidth > 0 ? entry.img : null;
}

/** Drops cached images of stencils that no longer exist. */
export function retainStencilImages(stencils: readonly Stencil[]) {
  if (imageCache.size === 0) return;
  const ids = new Set(stencils.map((s) => s.id));
  for (const id of imageCache.keys()) {
    if (!ids.has(id)) imageCache.delete(id);
  }
}

/** Waits until the images of the given stencils are decoded, so an export does not miss them. */
export async function preloadStencilImagesAsync(stencils: readonly Stencil[]): Promise<void> {
  await Promise.all(stencils.map(async (stencil) => {
    if (stencil.shapeType !== "image") return;
    // A broken image is left out, exactly as on the canvas.
    await getOrLoadImageEntry(stencil)?.img.decode().catch(() => undefined);
  }));
}

/** Editor-only overlay state of a stencil; exports render without it. */
export interface StencilDecoration {
  hovered: boolean;
  selected: boolean;
  zoom: number;
}

function applyImageAdjustments(ctx: CanvasRenderingContext2D, stencil: Stencil) {
  if (stencil.opacity !== undefined && stencil.opacity < 1) {
    ctx.globalAlpha = stencil.opacity;
  }
  // CSS-like filters (saturation, brightness, contrast)
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
}

function drawLabel(ctx: CanvasRenderingContext2D, stencil: Stencil, decoration: StencilDecoration) {
  const { hovered, selected, zoom } = decoration;
  const fontSize = Math.max(12, 14 / zoom);
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = hovered || selected ? "rgba(100, 100, 255, 0.7)" : "rgba(100, 100, 200, 0.35)";
  ctx.textAlign = "center";
  ctx.fillText(stencil.label.toUpperCase(), 0, -stencil.height / 2 - 8 / zoom);
}

function drawCornerHandles(ctx: CanvasRenderingContext2D, stencil: Stencil, decoration: StencilDecoration) {
  if (!decoration.selected || stencil.pinned) return;
  const hw = stencil.width / 2;
  const hh = stencil.height / 2;
  const handleSize = 6 / decoration.zoom;
  const corners: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  ctx.fillStyle = "rgba(100, 100, 255, 0.8)";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5 / decoration.zoom;
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, handleSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Draws a stencil in world coordinates. Without `decoration` only its visible content
 * (image or emoji) is drawn; shape stencils are editor guides and stay invisible.
 */
export function renderStencil(ctx: CanvasRenderingContext2D, stencil: Stencil, decoration: StencilDecoration | null) {
  const hw = stencil.width / 2;
  const hh = stencil.height / 2;

  ctx.save();
  ctx.translate(stencil.x, stencil.y);
  ctx.rotate(stencil.rotation);

  if (stencil.shapeType === "emoji" && stencil.emoji) {
    const emojiCanvas = getOrRenderEmoji(stencil.emoji, emojiRasterSize(stencil.width, stencil.height));
    ctx.save();
    if (stencil.opacity !== undefined && stencil.opacity < 1) {
      ctx.globalAlpha = stencil.opacity;
    }
    ctx.drawImage(emojiCanvas, -hw, -hh, stencil.width, stencil.height);
    ctx.restore();

    if (decoration && (decoration.selected || decoration.hovered)) {
      const { selected, zoom } = decoration;
      ctx.strokeStyle = selected ? "rgba(100, 100, 255, 0.7)" : "rgba(100, 100, 255, 0.5)";
      ctx.lineWidth = (selected ? 2 : 1) / zoom;
      ctx.setLineDash(selected ? [] : [8 / zoom, 4 / zoom]);
      ctx.strokeRect(-hw, -hh, stencil.width, stencil.height);
      ctx.setLineDash([]);
    }
  } else if (stencil.shapeType === "image" && stencil.imageData) {
    const img = getOrLoadImage(stencil);
    if (img) {
      ctx.save();
      applyImageAdjustments(ctx, stencil);
      ctx.drawImage(img, -hw, -hh, stencil.width, stencil.height);
      ctx.restore();
    }

    if (decoration) {
      const { hovered, selected, zoom } = decoration;
      ctx.strokeStyle = selected ? "rgba(100, 100, 255, 0.7)" : hovered ? "rgba(100, 100, 255, 0.5)" : "rgba(100, 100, 200, 0.15)";
      ctx.lineWidth = (selected || hovered ? 2 : 1) / zoom;
      ctx.setLineDash(selected ? [] : [8 / zoom, 4 / zoom]);
      ctx.strokeRect(-hw, -hh, stencil.width, stencil.height);
      ctx.setLineDash([]);
      drawLabel(ctx, stencil, decoration);
    }
  } else if (decoration) {
    const { hovered, selected, zoom } = decoration;
    const clipPath = getStencilClipPath(stencil.shapeType, hw, hh, stencil.svgPath);

    // Faint fill so the guide area stays visible
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#000000";
    ctx.fill(clipPath);
    ctx.restore();

    ctx.strokeStyle = selected ? "rgba(100, 100, 255, 0.7)" : hovered ? "rgba(100, 100, 255, 0.5)" : "rgba(100, 100, 200, 0.25)";
    ctx.lineWidth = (selected || hovered ? 2 : 1.5) / zoom;
    ctx.setLineDash(selected ? [] : [8 / zoom, 4 / zoom]);
    ctx.stroke(clipPath);
    ctx.setLineDash([]);
    drawLabel(ctx, stencil, decoration);
  }

  if (decoration) drawCornerHandles(ctx, stencil, decoration);
  ctx.restore();
}
