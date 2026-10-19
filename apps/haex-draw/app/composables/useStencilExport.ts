import type { Stencil } from "~/types/stencil";
import { renderScene } from "~/utils/canvas/sceneRenderer";
import { preloadStencilImagesAsync } from "~/utils/canvas/stencilRenderer";
import { getStencilClipPath } from "~/utils/stencilPresets";

/**
 * Exports a stencil region as PNG: renders all layers clipped to the stencil
 * shape and hands the image to the vault's save dialog.
 */
export function useStencilExport() {
  const canvas = useCanvasStore();
  const stencilStore = useStencilStore();
  const haexVault = useHaexVaultStore();

  const exportStencilAsync = async (s: Stencil, dialog: { title: string; filterName: string }) => {
    const hw = s.width / 2;
    const hh = s.height / 2;

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = s.width;
    tmpCanvas.height = s.height;
    const ctx = tmpCanvas.getContext("2d");
    if (!ctx) return;

    await preloadStencilImagesAsync(stencilStore.stencils);

    const clipPath = getStencilClipPath(s.shapeType, hw, hh, s.svgPath, s.svgViewBox);

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
    renderScene(ctx, canvas.strokes, stencilStore.stencils);

    ctx.restore();

    const blob = await new Promise<Blob | null>((resolve) => tmpCanvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const buffer = await blob.arrayBuffer();
    await haexVault.client.filesystem.saveFileAsync(new Uint8Array(buffer), {
      defaultPath: `${s.label}.png`,
      title: dialog.title,
      filters: [{ name: dialog.filterName, extensions: ["png"] }],
    });
  };

  return { exportStencilAsync };
}
