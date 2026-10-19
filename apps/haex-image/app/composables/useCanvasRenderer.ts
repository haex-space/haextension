import type { Ref, ShallowRef } from "vue";
import type { ImageAdjustments } from "~/types";
import { adjustmentsPixelFn, filterPixel, hasAdjustments, mapPixels } from "~/lib/pixelOps";

export function useCanvasRenderer(
  canvasRef: Readonly<ShallowRef<HTMLCanvasElement | null>>,
  containerRef: Readonly<ShallowRef<HTMLDivElement | null>>,
  previewAdjustments: Ref<ImageAdjustments>,
) {
  const editor = useEditorStore();

  // Render image to canvas
  const renderScale = ref(1);

  function render() {
    const canvas = canvasRef.value;
    const container = containerRef.value;
    if (!canvas || !container || !editor.imageDataUrl) return;

    const img = new Image();
    img.onload = () => {
      // Use preview dimensions for resize tool
      const previewW = editor.activeTool === "resize" ? editor.resizeWidth : img.naturalWidth;
      const previewH = editor.activeTool === "resize" ? editor.resizeHeight : img.naturalHeight;

      // Fit image to container
      const maxW = container.clientWidth - 32;
      const maxH = container.clientHeight - 32;
      const scale = Math.min(1, maxW / previewW, maxH / previewH);
      renderScale.value = scale;

      canvas.width = Math.round(previewW * scale);
      canvas.height = Math.round(previewH * scale);
      const ctx = canvas.getContext("2d")!;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (editor.activeTool === "adjust" && hasAdjustments(previewAdjustments.value)) {
        mapPixels(ctx, canvas.width, canvas.height, adjustmentsPixelFn(previewAdjustments.value));
      }

      if (editor.activeTool === "filter" && editor.activeFilter !== "none") {
        const filter = editor.activeFilter;
        mapPixels(ctx, canvas.width, canvas.height, (r, g, b) => filterPixel(filter, r, g, b));
      }

      // Draw crop overlay
      if (editor.activeTool === "crop" && editor.cropRect.width > 0 && editor.cropRect.height > 0) {
        const r = editor.cropRect;
        const sx = r.x * scale, sy = r.y * scale;
        const sw = r.width * scale, sh = r.height * scale;

        // Darken outside crop
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, canvas.width, sy);
        ctx.fillRect(0, sy, sx, sh);
        ctx.fillRect(sx + sw, sy, canvas.width - sx - sw, sh);
        ctx.fillRect(0, sy + sh, canvas.width, canvas.height - sy - sh);

        // Crop border
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, sw, sh);

        // Rule of thirds
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(sx + (sw * i) / 3, sy);
          ctx.lineTo(sx + (sw * i) / 3, sy + sh);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx, sy + (sh * i) / 3);
          ctx.lineTo(sx + sw, sy + (sh * i) / 3);
          ctx.stroke();
        }

        // Resize handles
        const hs = 6;
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        const handles = [
          [sx, sy], [sx + sw / 2, sy], [sx + sw, sy],
          [sx, sy + sh / 2], [sx + sw, sy + sh / 2],
          [sx, sy + sh], [sx + sw / 2, sy + sh], [sx + sw, sy + sh],
        ];
        for (const [hx, hy] of handles as [number, number][]) {
          ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
          ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
      }
    };
    img.src = editor.imageDataUrl;
  }

  return { renderScale, render };
}
