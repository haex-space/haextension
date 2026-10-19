import { drawGrid } from "~/utils/canvas/gridRenderer";
import { renderScene } from "~/utils/canvas/sceneRenderer";
import { renderStroke } from "~/utils/canvas/strokeRenderer";

export function useCanvasRenderer(canvasEl: Ref<HTMLCanvasElement | null>) {
  const canvas = useCanvasStore();
  const stencilStore = useStencilStore();
  const animFrameId = ref(0);

  const render = () => {
    const el = canvasEl.value;
    if (!el) return;

    const ctx = el.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = el.clientWidth;
    const height = el.clientHeight;

    // Size canvas to match display
    if (el.width !== width * dpr || el.height !== height * dpr) {
      el.width = width * dpr;
      el.height = height * dpr;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, el.width, el.height);

    // Apply DPR + viewport transform
    const { x: panX, y: panY, zoom } = canvas.viewport;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * panX, dpr * panY);

    // Grid (infinite, adaptive)
    drawGrid(ctx, width, height, canvas.viewport);

    renderScene(ctx, canvas.strokes, stencilStore.stencils, (stencil) => ({
      hovered: stencil.id === stencilStore.hoveredId,
      selected: stencilStore.isSelected(stencil.id),
      zoom,
    }));

    // Render current stroke (while drawing) — always on top
    if (canvas.currentStroke) {
      renderStroke(ctx, canvas.currentStroke);
    }
  };

  const startRenderLoop = () => {
    const loop = () => {
      render();
      animFrameId.value = requestAnimationFrame(loop);
    };
    animFrameId.value = requestAnimationFrame(loop);
  };

  const stopRenderLoop = () => {
    cancelAnimationFrame(animFrameId.value);
  };

  return {
    render,
    startRenderLoop,
    stopRenderLoop,
  };
}
