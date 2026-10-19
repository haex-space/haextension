import type { Ref, ShallowRef } from "vue";
import { resizeCropRect, type CropEdge } from "~/lib/cropGeometry";

export function useCropInteraction(
  canvasRef: Readonly<ShallowRef<HTMLCanvasElement | null>>,
  renderScale: Ref<number>,
) {
  const editor = useEditorStore();

  // Crop state
  const cropStart = ref<{ x: number; y: number } | null>(null);
  const cropDragging = ref(false);

  const cropMode = ref<"draw" | "move" | "resize">("draw");
  const cropResizeEdge = ref<CropEdge>("br");
  const cropMoveOffset = ref({ x: 0, y: 0 });
  const cropHoverTarget = ref<"inside" | CropEdge | null>(null);

  const HANDLE_SIZE = 12; // hit area in image pixels (scaled by renderScale)

  const cursorMap: Record<string, string> = {
    tl: "cursor-nwse-resize", tr: "cursor-nesw-resize",
    bl: "cursor-nesw-resize", br: "cursor-nwse-resize",
    t: "cursor-ns-resize", b: "cursor-ns-resize",
    l: "cursor-ew-resize", r: "cursor-ew-resize",
    inside: "cursor-move",
  };
  const cropCursor = computed(() => {
    if (cropHoverTarget.value) return cursorMap[cropHoverTarget.value] || "cursor-crosshair";
    return "cursor-crosshair";
  });

  function hitTestCropEdge(px: number, py: number): CropEdge | "inside" | null {
    const r = editor.cropRect;
    if (r.width <= 0 || r.height <= 0) return null;

    const hs = HANDLE_SIZE / renderScale.value;
    const left = r.x, right = r.x + r.width, top = r.y, bottom = r.y + r.height;

    // Corner handles (priority)
    if (Math.abs(px - left) < hs && Math.abs(py - top) < hs) return "tl";
    if (Math.abs(px - right) < hs && Math.abs(py - top) < hs) return "tr";
    if (Math.abs(px - left) < hs && Math.abs(py - bottom) < hs) return "bl";
    if (Math.abs(px - right) < hs && Math.abs(py - bottom) < hs) return "br";

    // Edge handles
    if (Math.abs(py - top) < hs && px > left + hs && px < right - hs) return "t";
    if (Math.abs(py - bottom) < hs && px > left + hs && px < right - hs) return "b";
    if (Math.abs(px - left) < hs && py > top + hs && py < bottom - hs) return "l";
    if (Math.abs(px - right) < hs && py > top + hs && py < bottom - hs) return "r";

    // Inside
    if (px >= left && px <= right && py >= top && py <= bottom) return "inside";
    return null;
  }

  function onCanvasPointerDown(e: PointerEvent) {
    if (editor.activeTool !== "crop") return;
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / renderScale.value;
    const y = (e.clientY - rect.top) / renderScale.value;

    const hit = hitTestCropEdge(x, y);
    if (hit && hit !== "inside") {
      cropMode.value = "resize";
      cropResizeEdge.value = hit;
    } else if (hit === "inside") {
      cropMode.value = "move";
      cropMoveOffset.value = { x: x - editor.cropRect.x, y: y - editor.cropRect.y };
    } else {
      cropMode.value = "draw";
      cropStart.value = { x, y };
      editor.cropRect = { x, y, width: 0, height: 0 };
    }

    cropDragging.value = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onCanvasPointerMove(e: PointerEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let x = (e.clientX - rect.left) / renderScale.value;
    let y = (e.clientY - rect.top) / renderScale.value;

    // Hover cursor when not dragging
    if (!cropDragging.value && editor.activeTool === "crop") {
      cropHoverTarget.value = hitTestCropEdge(x, y);
      return;
    }
    if (!cropDragging.value) return;

    x = Math.max(0, Math.min(editor.imageWidth, x));
    y = Math.max(0, Math.min(editor.imageHeight, y));

    if (cropMode.value === "move") {
      let nx = x - cropMoveOffset.value.x;
      let ny = y - cropMoveOffset.value.y;
      nx = Math.max(0, Math.min(editor.imageWidth - editor.cropRect.width, nx));
      ny = Math.max(0, Math.min(editor.imageHeight - editor.cropRect.height, ny));
      editor.cropRect = { ...editor.cropRect, x: Math.round(nx), y: Math.round(ny) };
    } else if (cropMode.value === "resize") {
      editor.cropRect = resizeCropRect(editor.cropRect, cropResizeEdge.value, x, y, editor.cropAspectRatio, {
        width: editor.imageWidth,
        height: editor.imageHeight,
      });
    } else {
      if (!cropStart.value) return;
      const sx = cropStart.value.x;
      const sy = cropStart.value.y;
      let cw = Math.abs(x - sx);
      let ch = Math.abs(y - sy);

      if (editor.cropAspectRatio) {
        const ratio = editor.cropAspectRatio;
        if (cw / ch > ratio) { cw = ch * ratio; }
        else { ch = cw / ratio; }
      }

      const cx = x < sx ? sx - cw : sx;
      const cy = y < sy ? sy - ch : sy;
      editor.cropRect = { x: Math.round(cx), y: Math.round(cy), width: Math.round(cw), height: Math.round(ch) };
    }
  }

  function onCanvasPointerUp() {
    cropDragging.value = false;
  }

  return { cropCursor, onCanvasPointerDown, onCanvasPointerMove, onCanvasPointerUp };
}
