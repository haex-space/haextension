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
  /** Size of the canvas element in CSS pixels, published by the canvas component */
  const viewSize = ref({ width: 0, height: 0 });

  /** World point at the centre of the visible canvas, where inserted items are placed. */
  const viewportCenter = computed(() => ({
    x: (viewSize.value.width / 2 - viewport.value.x) / viewport.value.zoom,
    y: (viewSize.value.height / 2 - viewport.value.y) / viewport.value.zoom,
  }));

  /** Zooms by `factor` while the screen point (screenX, screenY) stays in place. */
  const zoomAt = (screenX: number, screenY: number, factor: number) => {
    const oldZoom = viewport.value.zoom;
    const newZoom = Math.min(Math.max(oldZoom * factor, 0.01), 100);
    const ratio = newZoom / oldZoom;
    viewport.value.x = screenX - (screenX - viewport.value.x) * ratio;
    viewport.value.y = screenY - (screenY - viewport.value.y) * ratio;
    viewport.value.zoom = newZoom;
  };

  // Tool state
  const activeTool = ref<Tool>("pan");
  const activeBrushPreset = ref("pencil");
  const brushColor = ref("#000000");
  const brushSize = ref(4);
  const brushTip = ref<BrushTip>("round");
  const lastStencilPreset = ref<string | null>(null);

  // Drawing state
  const isDrawing = ref(false);
  const currentStroke = ref<StrokeData | null>(null);

  // Active strokes = all entries up to and including historyIndex
  const strokes = computed(() =>
    history.value.slice(0, historyIndex.value + 1).map((e) => e.stroke)
  );

  const addStroke = (stroke: StrokeData, label: string) => {
    // Discard any entries after current position (branching)
    history.value = history.value.slice(0, historyIndex.value + 1);
    history.value.push({ stroke, label });
    historyIndex.value = history.value.length - 1;
  };

  const undo = () => {
    if (historyIndex.value >= 0) {
      historyIndex.value--;
    }
  };

  const redo = () => {
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++;
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
    history.value = drawing.strokes.map((s) => ({
      stroke: s,
      label: s.brushPreset ?? s.tool,
    }));
    historyIndex.value = history.value.length - 1;
    viewport.value = drawing.viewport;
  };

  const newDrawing = (id: string) => {
    drawingId.value = id;
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
    viewSize,
    viewportCenter,
    zoomAt,
    activeTool,
    activeBrushPreset,
    brushColor,
    brushSize,
    brushTip,
    lastStencilPreset,
    isDrawing,
    currentStroke,
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
