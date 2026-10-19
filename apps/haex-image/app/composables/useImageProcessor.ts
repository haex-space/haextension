import type { CropRect, ImageAdjustments, FilterType } from "~/types";
import { adjustmentsPixelFn, filterPixel, mapPixels } from "~/lib/pixelOps";

export function useImageProcessor() {
  const editor = useEditorStore();

  async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function applyCrop(rect: CropRect) {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    const dataUrl = canvas.toDataURL("image/png");
    editor.pushHistory(dataUrl, rect.width, rect.height);
    editor.activeTool = null;
  }

  async function applyRotate(degrees: number) {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const rad = (degrees * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const newW = Math.round(img.naturalWidth * cos + img.naturalHeight * sin);
    const newH = Math.round(img.naturalWidth * sin + img.naturalHeight * cos);

    const canvas = document.createElement("canvas");
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(newW / 2, newH / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const dataUrl = canvas.toDataURL("image/png");
    editor.pushHistory(dataUrl, newW, newH);
  }

  async function applyRotate90(direction: "cw" | "ccw") {
    await applyRotate(direction === "cw" ? 90 : -90);
  }

  async function applyFlip(axis: "horizontal" | "vertical") {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    if (axis === "horizontal") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    editor.pushHistory(dataUrl, canvas.width, canvas.height);
  }

  async function applyResize(width: number, height: number) {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/png");
    editor.pushHistory(dataUrl, width, height);
    editor.activeTool = null;
  }

  async function applyAdjustments(adjustments: ImageAdjustments) {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    mapPixels(ctx, canvas.width, canvas.height, adjustmentsPixelFn(adjustments));

    const dataUrl = canvas.toDataURL("image/png");
    editor.pushHistory(dataUrl, canvas.width, canvas.height);
    editor.adjustments = { brightness: 0, contrast: 0, saturation: 0 };
    editor.activeTool = null;
  }

  async function applyFilter(filter: FilterType) {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    if (filter !== "none") {
      mapPixels(ctx, canvas.width, canvas.height, (r, g, b) => filterPixel(filter, r, g, b));
    }

    const dataUrl = canvas.toDataURL("image/png");
    editor.pushHistory(dataUrl, canvas.width, canvas.height);
    editor.activeFilter = "none";
    editor.activeTool = null;
  }

  async function estimateCompressedSize(format: "jpeg" | "webp" | "png", quality: number): Promise<number> {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob?.size ?? 0),
        `image/${format}`,
        quality,
      );
    });
  }

  async function applyCompress(format: "jpeg" | "webp" | "png", quality: number) {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    // Fill white background for JPEG (no alpha support)
    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    const mimeType = `image/${format}`;
    const dataUrl = canvas.toDataURL(mimeType, quality);
    editor.pushHistory(dataUrl, canvas.width, canvas.height);
    editor.activeTool = null;
  }

  async function exportImage(format: "png" | "jpeg", quality = 0.92): Promise<Blob> {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob!),
        format === "jpeg" ? "image/jpeg" : "image/png",
        quality,
      );
    });
  }

  return {
    applyCrop, applyRotate, applyRotate90, applyFlip,
    applyResize, applyAdjustments, applyFilter,
    estimateCompressedSize, applyCompress, exportImage,
  };
}
