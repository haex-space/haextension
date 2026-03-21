import type { CropRect, ImageAdjustments, FilterType } from "~/types";

export function useImageProcessor() {
  const editor = useEditorStore();

  function getCanvasFromCurrent(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.src = editor.imageDataUrl!;
    canvas.width = editor.imageWidth;
    canvas.height = editor.imageHeight;
    ctx.drawImage(img, 0, 0);
    return { canvas, ctx };
  }

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

  function manipulatePixels(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (r: number, g: number, b: number) => [number, number, number]) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = fn(d[i], d[i + 1], d[i + 2]);
      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  async function applyAdjustments(adjustments: ImageAdjustments) {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const br = adjustments.brightness * 2.55;
    const co = 1 + adjustments.contrast / 100;
    const sat = 1 + adjustments.saturation / 100;
    manipulatePixels(ctx, canvas.width, canvas.height, (r, g, b) => {
      r += br; g += br; b += br;
      r = ((r / 255 - 0.5) * co + 0.5) * 255;
      g = ((g / 255 - 0.5) * co + 0.5) * 255;
      b = ((b / 255 - 0.5) * co + 0.5) * 255;
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + (r - gray) * sat;
      g = gray + (g - gray) * sat;
      b = gray + (b - gray) * sat;
      return [r, g, b];
    });

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
      manipulatePixels(ctx, canvas.width, canvas.height, (r, g, b) => {
        if (filter === "grayscale") {
          const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          return [gray, gray, gray];
        } else if (filter === "sepia") {
          return [r * 0.393 + g * 0.769 + b * 0.189, r * 0.349 + g * 0.686 + b * 0.168, r * 0.272 + g * 0.534 + b * 0.131];
        } else if (filter === "invert") {
          return [255 - r, 255 - g, 255 - b];
        } else if (filter === "warm") {
          return [Math.min(255, r * 1.1 + 10), g, Math.max(0, b * 0.9 - 5)];
        } else if (filter === "cool") {
          return [Math.max(0, r * 0.9 - 5), g, Math.min(255, b * 1.1 + 10)];
        } else if (filter === "vintage") {
          const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          return [(gray * 0.6 + r * 0.4 + 20) * 0.95, (gray * 0.5 + g * 0.5 + 5) * 0.9, (gray * 0.6 + b * 0.4 - 10) * 0.85];
        }
        return [r, g, b];
      });
    }

    const dataUrl = canvas.toDataURL("image/png");
    editor.pushHistory(dataUrl, canvas.width, canvas.height);
    editor.activeFilter = "none";
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
    applyResize, applyAdjustments, applyFilter, exportImage,
  };
}
