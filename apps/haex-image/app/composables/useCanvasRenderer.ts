import type { Ref, ShallowRef } from "vue";
import type { ImageAdjustments } from "~/types";

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

      // Apply preview adjustments via pixel manipulation
      if (editor.activeTool === "adjust") {
        const adj = previewAdjustments.value;
        if (adj.brightness !== 0 || adj.contrast !== 0 || adj.saturation !== 0) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imageData.data;
          const br = adj.brightness * 2.55; // -255 to 255
          const co = 1 + adj.contrast / 100;
          const sat = 1 + adj.saturation / 100;
          for (let i = 0; i < d.length; i += 4) {
            // Brightness
            let r = d[i]! + br, g = d[i + 1]! + br, b = d[i + 2]! + br;
            // Contrast
            r = ((r / 255 - 0.5) * co + 0.5) * 255;
            g = ((g / 255 - 0.5) * co + 0.5) * 255;
            b = ((b / 255 - 0.5) * co + 0.5) * 255;
            // Saturation
            const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = gray + (r - gray) * sat;
            g = gray + (g - gray) * sat;
            b = gray + (b - gray) * sat;
            d[i] = Math.max(0, Math.min(255, r));
            d[i + 1] = Math.max(0, Math.min(255, g));
            d[i + 2] = Math.max(0, Math.min(255, b));
          }
          ctx.putImageData(imageData, 0, 0);
        }
      }

      // Apply preview filter via pixel manipulation
      if (editor.activeTool === "filter" && editor.activeFilter !== "none") {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        const f = editor.activeFilter;
        for (let i = 0; i < d.length; i += 4) {
          let r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
          if (f === "grayscale") {
            const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = g = b = gray;
          } else if (f === "sepia") {
            const tr = r * 0.393 + g * 0.769 + b * 0.189;
            const tg = r * 0.349 + g * 0.686 + b * 0.168;
            const tb = r * 0.272 + g * 0.534 + b * 0.131;
            r = tr; g = tg; b = tb;
          } else if (f === "invert") {
            r = 255 - r; g = 255 - g; b = 255 - b;
          } else if (f === "warm") {
            r = Math.min(255, r * 1.1 + 10); b = Math.max(0, b * 0.9 - 5);
          } else if (f === "cool") {
            r = Math.max(0, r * 0.9 - 5); b = Math.min(255, b * 1.1 + 10);
          } else if (f === "vintage") {
            const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = gray * 0.6 + r * 0.4 + 20;
            g = gray * 0.5 + g * 0.5 + 5;
            b = gray * 0.6 + b * 0.4 - 10;
            r *= 0.95; g *= 0.9; b *= 0.85;
          }
          d[i] = Math.max(0, Math.min(255, r));
          d[i + 1] = Math.max(0, Math.min(255, g));
          d[i + 2] = Math.max(0, Math.min(255, b));
        }
        ctx.putImageData(imageData, 0, 0);
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
