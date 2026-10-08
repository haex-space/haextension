import type { Stencil } from "~/types/stencil";
import { getStencilClipPath } from "~/utils/stencilPresets";

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

export function renderStencil(ctx: CanvasRenderingContext2D, stencil: Stencil, isHovered: boolean, isSelected: boolean, zoom: number) {
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
