import type { EditorTool, CropRect, FilterType, HistoryEntry } from "~/types";

// Each entry holds a full encoded image, so the depth bounds the memory an editing session uses.
const MAX_HISTORY = 20;

export const useEditorStore = defineStore("editor", () => {
  // Image state
  const fileName = ref("");
  const filePath = ref("");

  // Tool state
  const activeTool = ref<EditorTool | null>(null);
  const isProcessing = ref(false);

  // Crop
  const cropRect = ref<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const cropAspectRatio = ref<number | null>(null);

  // Resize
  const resizeWidth = ref(0);
  const resizeHeight = ref(0);
  const resizeLockAspect = ref(true);

  // Filter
  const activeFilter = ref<FilterType>("none");

  // History (undo/redo)
  const history = shallowRef<HistoryEntry[]>([]);
  const historyIndex = ref(-1);
  const canUndo = computed(() => historyIndex.value > 0);
  const canRedo = computed(() => historyIndex.value < history.value.length - 1);

  const current = computed(() => history.value[historyIndex.value] ?? null);
  const imageWidth = computed(() => current.value?.width ?? 0);
  const imageHeight = computed(() => current.value?.height ?? 0);
  const hasImage = computed(() => current.value !== null);

  // A crop rect drawn on one image does not fit another
  function selectHistory(index: number) {
    historyIndex.value = index;
    cropRect.value = { x: 0, y: 0, width: 0, height: 0 };
    resizeWidth.value = imageWidth.value;
    resizeHeight.value = imageHeight.value;
  }

  function loadImage(entry: HistoryEntry, name: string, path: string = "") {
    fileName.value = name;
    filePath.value = path;
    activeFilter.value = "none";
    activeTool.value = null;

    history.value = [entry];
    selectHistory(0);
  }

  function pushHistory(entry: HistoryEntry) {
    // Drop the redo branch, then the oldest entries beyond the limit
    history.value = [...history.value.slice(0, historyIndex.value + 1), entry].slice(-MAX_HISTORY);
    selectHistory(history.value.length - 1);
  }

  function undo() {
    if (!canUndo.value) return;
    selectHistory(historyIndex.value - 1);
  }

  function redo() {
    if (!canRedo.value) return;
    selectHistory(historyIndex.value + 1);
  }

  return {
    current, imageWidth, imageHeight, fileName, filePath, hasImage,
    activeTool, isProcessing,
    cropRect, cropAspectRatio,
    resizeWidth, resizeHeight, resizeLockAspect,
    activeFilter,
    history, historyIndex, canUndo, canRedo,
    loadImage, pushHistory, undo, redo,
  };
});
