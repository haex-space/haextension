import type { CropRect, ImageAdjustments, FilterType } from "~/types";
import { canvasToBlob, decodeImage } from "~/lib/image";
import { adjustmentsPixelFn, filterPixel, mapPixels } from "~/lib/pixelOps";

export function useImageProcessor() {
  const editor = useEditorStore();

  function createCanvas(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx: canvas.getContext("2d")! };
  }

  function decodeCurrent() {
    if (!editor.current) throw new Error("No image loaded");
    return decodeImage(editor.current.blob);
  }

  /** The current image drawn 1:1 onto a new canvas, over `background` if given. */
  async function drawCurrent(background?: string) {
    const img = await decodeCurrent();
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    return { canvas, ctx };
  }

  async function commit(canvas: HTMLCanvasElement, type = "image/png", quality?: number) {
    const blob = await canvasToBlob(canvas, type, quality);
    editor.pushHistory({ blob, width: canvas.width, height: canvas.height });
  }

  async function applyCrop(rect: CropRect) {
    const img = await decodeCurrent();
    const { canvas, ctx } = createCanvas(rect.width, rect.height);
    ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    await commit(canvas);
    editor.activeTool = null;
  }

  async function applyRotate(degrees: number) {
    const img = await decodeCurrent();
    const rad = (degrees * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const newW = Math.round(img.naturalWidth * cos + img.naturalHeight * sin);
    const newH = Math.round(img.naturalWidth * sin + img.naturalHeight * cos);

    const { canvas, ctx } = createCanvas(newW, newH);
    ctx.translate(newW / 2, newH / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    await commit(canvas);
  }

  async function applyRotate90(direction: "cw" | "ccw") {
    await applyRotate(direction === "cw" ? 90 : -90);
  }

  async function applyFlip(axis: "horizontal" | "vertical") {
    const img = await decodeCurrent();
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    if (axis === "horizontal") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(img, 0, 0);
    await commit(canvas);
  }

  async function applyResize(width: number, height: number) {
    const img = await decodeCurrent();
    const { canvas, ctx } = createCanvas(width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    await commit(canvas);
    editor.activeTool = null;
  }

  async function applyAdjustments(adjustments: ImageAdjustments) {
    const { canvas, ctx } = await drawCurrent();
    mapPixels(ctx, canvas.width, canvas.height, adjustmentsPixelFn(adjustments));
    await commit(canvas);
    editor.adjustments = { brightness: 0, contrast: 0, saturation: 0 };
    editor.activeTool = null;
  }

  async function applyFilter(filter: FilterType) {
    const { canvas, ctx } = await drawCurrent();
    if (filter !== "none") {
      mapPixels(ctx, canvas.width, canvas.height, (r, g, b) => filterPixel(filter, r, g, b));
    }
    await commit(canvas);
    editor.activeFilter = "none";
    editor.activeTool = null;
  }

  // JPEG has no alpha channel: without a background, transparent pixels would turn black.
  const backgroundFor = (format: "jpeg" | "webp" | "png") => (format === "jpeg" ? "#ffffff" : undefined);

  async function estimateCompressedSize(format: "jpeg" | "webp" | "png", quality: number): Promise<number> {
    const { canvas } = await drawCurrent();
    const blob = await canvasToBlob(canvas, `image/${format}`, quality);
    return blob.size;
  }

  async function applyCompress(format: "jpeg" | "webp" | "png", quality: number) {
    const { canvas } = await drawCurrent(backgroundFor(format));
    await commit(canvas, `image/${format}`, quality);
    editor.activeTool = null;
  }

  async function exportImage(format: "png" | "jpeg", quality = 0.92): Promise<Blob> {
    const { canvas } = await drawCurrent();
    return canvasToBlob(canvas, format === "jpeg" ? "image/jpeg" : "image/png", quality);
  }

  return {
    applyCrop, applyRotate, applyRotate90, applyFlip,
    applyResize, applyAdjustments, applyFilter,
    estimateCompressedSize, applyCompress, exportImage,
  };
}
