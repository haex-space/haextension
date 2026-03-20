import type { StrokeData, ViewportState } from "~/database/schemas";
import type { BrushTip, Tool } from "~/types";

export interface HistoryEntry {
  stroke: StrokeData;
  label: string; // e.g. "Bleistift", "Radierer"
}

export const useCanvasStore = defineStore("canvas", () => {
  // Current drawing
  const drawingId = ref<string | null>(null);
  const drawingName = ref("Untitled");

  // History: all entries + cursor position
  // Entries 0..historyIndex are active, historyIndex+1..end are "the past"
  const history = ref<HistoryEntry[]>([]);
  const historyIndex = ref(-1); // -1 = empty / before first entry

  // Viewport (pan/zoom)
  const viewport = ref<ViewportState>({ x: 0, y: 0, zoom: 1 });

  // Tool state
  const activeTool = ref<Tool>("brush");
  const activeBrushPreset = ref("pencil");
  const brushColor = ref("#000000");
  const brushSize = ref(4);
  const brushTip = ref<BrushTip>("round");
  const lastStencilPreset = ref<string | null>(null);

  // Drawing state
  const isDrawing = ref(false);
  const currentStroke = ref<StrokeData | null>(null);
  const isDirty = ref(false);

  // Progressive rendering: frozen path segments for the current live stroke.
  // Every CHUNK points, the outline up to that point is frozen so the
  // beginning of the stroke stops changing.
  const frozenPath = ref<string | null>(null);
  const frozenUpTo = ref(0);

  const resetFrozen = () => {
    frozenPath.value = null;
    frozenUpTo.value = 0;
  };

  // Active strokes = all entries up to and including historyIndex
  const strokes = computed(() =>
    history.value.slice(0, historyIndex.value + 1).map((e) => e.stroke)
  );

  const addStroke = (stroke: StrokeData, label: string) => {
    // Discard any entries after current position (branching)
    history.value = history.value.slice(0, historyIndex.value + 1);
    history.value.push({ stroke, label });
    historyIndex.value = history.value.length - 1;
    isDirty.value = true;
  };

  const undo = () => {
    if (historyIndex.value >= 0) {
      historyIndex.value--;
      isDirty.value = true;
    }
  };

  const redo = () => {
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++;
      isDirty.value = true;
    }
  };

  const goToHistoryIndex = (index: number) => {
    historyIndex.value = Math.max(-1, Math.min(index, history.value.length - 1));
  };

  const canUndo = computed(() => historyIndex.value >= 0);
  const canRedo = computed(() => historyIndex.value < history.value.length - 1);

  const clear = () => {
    history.value = [];
    historyIndex.value = -1;
  };

  const loadDrawing = (drawing: { id: string; name: string; strokes: StrokeData[]; viewport: ViewportState }) => {
    drawingId.value = drawing.id;
    drawingName.value = drawing.name;
    // Rebuild history from strokes (no preset label info, use tool name)
    history.value = drawing.strokes.map((s, i) => ({
      stroke: s,
      label: s.brushPreset ?? s.tool,
    }));
    historyIndex.value = history.value.length - 1;
    viewport.value = drawing.viewport;
  };

  const newDrawing = () => {
    drawingId.value = crypto.randomUUID();
    drawingName.value = "Untitled";
    history.value = [];
    historyIndex.value = -1;
    viewport.value = { x: 0, y: 0, zoom: 1 };
  };

  return {
    drawingId,
    drawingName,
    history,
    historyIndex,
    strokes,
    viewport,
    activeTool,
    activeBrushPreset,
    brushColor,
    brushSize,
    brushTip,
    lastStencilPreset,
    isDrawing,
    isDirty,
    currentStroke,
    frozenPath,
    frozenUpTo,
    resetFrozen,
    addStroke,
    undo,
    redo,
    goToHistoryIndex,
    canUndo,
    canRedo,
    clear,
    loadDrawing,
    newDrawing,
  };
});
