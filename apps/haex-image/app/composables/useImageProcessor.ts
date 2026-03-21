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

  async function applyAdjustments(adjustments: ImageAdjustments) {
    const img = await loadImageFromDataUrl(editor.imageDataUrl!);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;

    // Build CSS filter string
    const brightness = 1 + adjustments.brightness / 100;
    const contrast = 1 + adjustments.contrast / 100;
    const saturate = 1 + adjustments.saturation / 100;
    ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`;
    ctx.drawImage(img, 0, 0);
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

    switch (filter) {
      case "grayscale":
        ctx.filter = "grayscale(1)";
        ctx.drawImage(img, 0, 0);
        break;
      case "sepia":
        ctx.filter = "sepia(1)";
        ctx.drawImage(img, 0, 0);
        break;
      case "invert":
        ctx.filter = "invert(1)";
        ctx.drawImage(img, 0, 0);
        break;
      case "warm":
        ctx.filter = "sepia(0.3) saturate(1.4) brightness(1.05)";
        ctx.drawImage(img, 0, 0);
        break;
      case "cool":
        ctx.filter = "saturate(0.8) brightness(1.05) hue-rotate(20deg)";
        ctx.drawImage(img, 0, 0);
        break;
      case "vintage":
        ctx.filter = "sepia(0.4) contrast(1.2) brightness(0.9) saturate(0.8)";
        ctx.drawImage(img, 0, 0);
        break;
      default:
        ctx.drawImage(img, 0, 0);
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
