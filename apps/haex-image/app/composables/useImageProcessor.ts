import { toast } from "vue-sonner";
import type { CropRect, ImageAdjustments, FilterType } from "~/types";
import { canvasToBlob, decodeImage } from "~/lib/image";
import { adjustmentsPixelFn, filterPixel, mapPixels } from "~/lib/pixelOps";

export function useImageProcessor() {
  const editor = useEditorStore();
  const { t } = useI18n({ useScope: "global" });

  function createCanvas(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx: canvas.getContext("2d")! };
  }

  function drawOnto(img: HTMLImageElement, background?: string) {
    const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    return { canvas, ctx };
  }

  /** The current image drawn 1:1 onto a new canvas, over `background` if given. */
  async function drawCurrent(background?: string) {
    if (!editor.current) throw new Error("No image loaded");
    return drawOnto(await decodeImage(editor.current.blob), background);
  }

  interface Edited {
    canvas: HTMLCanvasElement;
    type?: string;
    quality?: number;
    compressed?: boolean;
  }

  /**
   * Runs one edit at a time. Its result becomes the new current image only if the image it started
   * from is still current: an undo or a newly opened image while it ran makes the result stale.
   * Failures are reported to the user. Resolves to whether the result was applied.
   */
  async function edit(op: (img: HTMLImageElement) => Edited): Promise<boolean> {
    const source = editor.current;
    if (!source || editor.isProcessing) return false;
    editor.isProcessing = true;
    try {
      const { canvas, type = "image/png", quality, compressed } = op(await decodeImage(source.blob));
      const blob = await canvasToBlob(canvas, type, quality);
      if (editor.current !== source) return false;
      editor.pushHistory({ blob, width: canvas.width, height: canvas.height, compressed });
      return true;
    } catch (error) {
      console.error("[haex-image] edit failed:", error);
      toast.error(t("editFailed"));
      return false;
    } finally {
      editor.isProcessing = false;
    }
  }

  async function applyCrop(rect: CropRect) {
    const applied = await edit((img) => {
      const { canvas, ctx } = createCanvas(rect.width, rect.height);
      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      return { canvas };
    });
    if (applied) editor.activeTool = null;
  }

  async function applyRotate(degrees: number) {
    await edit((img) => {
      const rad = (degrees * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rad));
      const cos = Math.abs(Math.cos(rad));
      const newW = Math.round(img.naturalWidth * cos + img.naturalHeight * sin);
      const newH = Math.round(img.naturalWidth * sin + img.naturalHeight * cos);

      const { canvas, ctx } = createCanvas(newW, newH);
      ctx.translate(newW / 2, newH / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      return { canvas };
    });
  }

  async function applyRotate90(direction: "cw" | "ccw") {
    await applyRotate(direction === "cw" ? 90 : -90);
  }

  async function applyFlip(axis: "horizontal" | "vertical") {
    await edit((img) => {
      const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
      if (axis === "horizontal") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(0, canvas.height);
        ctx.scale(1, -1);
      }
      ctx.drawImage(img, 0, 0);
      return { canvas };
    });
  }

  async function applyResize(width: number, height: number) {
    const applied = await edit((img) => {
      const { canvas, ctx } = createCanvas(width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      return { canvas };
    });
    if (applied) editor.activeTool = null;
  }

  async function applyAdjustments(adjustments: ImageAdjustments) {
    const applied = await edit((img) => {
      const { canvas, ctx } = drawOnto(img);
      mapPixels(ctx, canvas.width, canvas.height, adjustmentsPixelFn(adjustments));
      return { canvas };
    });
    if (applied) editor.activeTool = null;
  }

  async function applyFilter(filter: FilterType) {
    const applied = await edit((img) => {
      const { canvas, ctx } = drawOnto(img);
      if (filter !== "none") {
        mapPixels(ctx, canvas.width, canvas.height, (r, g, b) => filterPixel(filter, r, g, b));
      }
      return { canvas };
    });
    if (!applied) return;
    editor.activeFilter = "none";
    editor.activeTool = null;
  }

  // JPEG has no alpha channel: without a background, transparent pixels would turn black.
  const backgroundFor = (format: "jpeg" | "webp" | "png") => (format === "jpeg" ? "#ffffff" : undefined);

  async function estimateCompressedSize(format: "jpeg" | "webp" | "png", quality: number): Promise<number> {
    const { canvas } = await drawCurrent(backgroundFor(format));
    const blob = await canvasToBlob(canvas, `image/${format}`, quality);
    return blob.size;
  }

  async function applyCompress(format: "jpeg" | "webp" | "png", quality: number) {
    const applied = await edit((img) => ({
      canvas: drawOnto(img, backgroundFor(format)).canvas,
      type: `image/${format}`,
      quality,
      compressed: true,
    }));
    if (applied) editor.activeTool = null;
  }

  async function exportImage(format: "png" | "jpeg", quality = 0.92): Promise<Blob> {
    const { canvas } = await drawCurrent(backgroundFor(format));
    return canvasToBlob(canvas, format === "jpeg" ? "image/jpeg" : "image/png", quality);
  }

  return {
    applyCrop, applyRotate, applyRotate90, applyFlip,
    applyResize, applyAdjustments, applyFilter,
    estimateCompressedSize, applyCompress, exportImage,
  };
}
