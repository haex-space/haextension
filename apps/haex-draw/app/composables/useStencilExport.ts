import getStroke from "perfect-freehand";
import type { Stencil } from "~/types/stencil";
import type { StrokeData } from "~/database/schemas";
import { BRUSH_PRESETS } from "~/utils/brushPresets";
import { getStencilClipPath } from "~/utils/stencilPresets";

/**
 * Exports a stencil region as PNG: renders all layers clipped to the stencil
 * shape and hands the image to the vault's save dialog.
 */
export function useStencilExport() {
  const canvas = useCanvasStore();
  const stencilStore = useStencilStore();
  const haexVault = useHaexVaultStore();

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const renderStencilToCtx = async (ctx: CanvasRenderingContext2D, st: Stencil) => {
    const hw = st.width / 2;
    const hh = st.height / 2;

    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.rotate(st.rotation);

    if (st.opacity !== undefined && st.opacity < 1) {
      ctx.globalAlpha = st.opacity;
    }

    const filters: string[] = [];
    if (st.saturation !== undefined && st.saturation !== 1) filters.push(`saturate(${st.saturation})`);
    if (st.brightness !== undefined && st.brightness !== 1) filters.push(`brightness(${st.brightness})`);
    if (st.contrast !== undefined && st.contrast !== 1) filters.push(`contrast(${st.contrast})`);
    if (filters.length > 0) ctx.filter = filters.join(" ");

    if (st.shapeType === "image" && st.imageData) {
      const img = await loadImage(st.imageData);
      ctx.drawImage(img, -hw, -hh, st.width, st.height);
    } else if (st.shapeType === "emoji" && st.emoji) {
      const fontSize = Math.min(st.width, st.height) * 0.85;
      ctx.font = `${fontSize}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(st.emoji, 0, 0);
    }

    ctx.restore();
  };

  const renderStrokeToCtx = (ctx: CanvasRenderingContext2D, stroke: StrokeData) => {
    if (stroke.tool === "eraser") return;

    const preset = BRUSH_PRESETS.find((p) => p.id === stroke.brushPreset) ?? BRUSH_PRESETS[0];
    const hasPressure = stroke.points.some((p) => p[2] !== 0.5);

    const outlinePoints = getStroke(stroke.points, {
      size: stroke.size,
      thinning: preset.options.thinning,
      smoothing: preset.options.smoothing,
      streamline: preset.options.streamline,
      simulatePressure: preset.options.simulatePressure && !hasPressure,
      start: preset.options.start,
      end: preset.options.end,
    });

    if (outlinePoints.length < 2) return;

    ctx.beginPath();
    const [first, ...rest] = outlinePoints;
    if (!first) return;
    ctx.moveTo(first[0], first[1]);
    for (const [x, y] of rest) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = stroke.color;
    ctx.fill();
  };

  const exportStencilAsync = async (s: Stencil) => {
    const hw = s.width / 2;
    const hh = s.height / 2;

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = s.width;
    tmpCanvas.height = s.height;
    const ctx = tmpCanvas.getContext("2d");
    if (!ctx) return;

    const clipPath = getStencilClipPath(s.shapeType, hw, hh, s.svgPath);

    // Set up coordinate system: origin at stencil center, clipped to stencil shape
    ctx.translate(hw, hh);
    ctx.save();
    ctx.clip(clipPath);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-hw, -hh, s.width, s.height);

    // Undo the export stencil's rotation so it appears upright,
    // then shift to world coordinates for rendering all layers
    ctx.rotate(-s.rotation);
    ctx.translate(-s.x, -s.y);

    // Build sorted layer list (same as renderer)
    type LayerItem =
      | { kind: "stroke"; stroke: StrokeData; z: number }
      | { kind: "stencil"; stencil: Stencil; z: number };

    const layers: LayerItem[] = [];
    for (const stroke of canvas.strokes) {
      layers.push({ kind: "stroke", stroke, z: stroke.zIndex ?? 0 });
    }
    for (const st of stencilStore.stencils) {
      layers.push({ kind: "stencil", stencil: st, z: st.zIndex ?? 0 });
    }
    layers.sort((a, b) => a.z - b.z);

    // Render all layers in z-order (including self)
    for (const item of layers) {
      if (item.kind === "stencil") {
        await renderStencilToCtx(ctx, item.stencil);
      } else {
        renderStrokeToCtx(ctx, item.stroke);
      }
    }

    ctx.restore();

    const blob = await new Promise<Blob | null>((resolve) => tmpCanvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const buffer = await blob.arrayBuffer();
    await haexVault.client.filesystem.saveFileAsync(new Uint8Array(buffer), {
      defaultPath: `${s.label}.png`,
      title: "Export as PNG",
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
  };

  return { exportStencilAsync };
}
