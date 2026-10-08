import { useEventListener } from "@vueuse/core";

/**
 * Keyboard shortcuts for the canvas: tool switching, undo/redo, stencil
 * clipboard/selection, plus the held-modifier state (space = pan, shift = constrain).
 */
export function useCanvasKeyboard(state: {
  spaceHeld: Ref<boolean>;
  shiftHeld: Ref<boolean>;
  constrainAngle: Ref<number | null>;
  constrainOrigin: Ref<{ x: number; y: number }>;
}) {
  const canvas = useCanvasStore();
  const stencilStore = useStencilStore();
  const { spaceHeld, shiftHeld, constrainAngle, constrainOrigin } = state;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      e.preventDefault();
      spaceHeld.value = true;
    }
    if (e.key === "Shift" && !shiftHeld.value) {
      shiftHeld.value = true;
      // Set constrain origin to the last drawn point
      if (canvas.isDrawing && canvas.currentStroke && canvas.currentStroke.points.length > 0) {
        const lastPt = canvas.currentStroke.points[canvas.currentStroke.points.length - 1]!;
        constrainOrigin.value = { x: lastPt[0], y: lastPt[1] };
      }
      constrainAngle.value = null;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      canvas.undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      canvas.redo();
    }
    if (e.key === "b" && !e.ctrlKey && !e.metaKey) canvas.activeTool = "brush";
    if (e.key === "e" && !e.ctrlKey && !e.metaKey) { canvas.activeBrushPreset = "eraser"; canvas.activeTool = "brush"; }
    if (e.key === "h" && !e.ctrlKey && !e.metaKey) canvas.activeTool = "pan";
    if (e.key === "s" && !e.ctrlKey && !e.metaKey && canvas.lastStencilPreset) canvas.activeTool = "stencil";
    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      stencilStore.selectedIds = new Set(stencilStore.stencils.map((s) => s.id));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "c" && stencilStore.selectedIds.size > 0) {
      e.preventDefault();
      stencilStore.copySelected();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "v" && stencilStore.clipboard.length > 0) {
      e.preventDefault();
      stencilStore.paste();
    }
    if (e.key === "Delete" && stencilStore.selectedIds.size > 0) {
      stencilStore.removeSelected();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") spaceHeld.value = false;
    if (e.key === "Shift") {
      shiftHeld.value = false;
      constrainAngle.value = null;
    }
  };

  useEventListener(window, "keydown", onKeyDown);
  useEventListener(window, "keyup", onKeyUp);
}
