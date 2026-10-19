import type { EditorTool, CropRect, ImageAdjustments, FilterType, HistoryEntry } from "~/types";

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

  // Rotate
  const rotation = ref(0); // degrees
  const flipH = ref(false);
  const flipV = ref(false);

  // Resize
  const resizeWidth = ref(0);
  const resizeHeight = ref(0);
  const resizeLockAspect = ref(true);

  // Adjustments
  const adjustments = ref<ImageAdjustments>({
    brightness: 0,
    contrast: 0,
    saturation: 0,
  });

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

  function selectHistory(index: number) {
    historyIndex.value = index;
    resizeWidth.value = imageWidth.value;
    resizeHeight.value = imageHeight.value;
  }

  function loadImage(entry: HistoryEntry, name: string, path: string = "") {
    fileName.value = name;
    filePath.value = path;
    rotation.value = 0;
    flipH.value = false;
    flipV.value = false;
    adjustments.value = { brightness: 0, contrast: 0, saturation: 0 };
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

  function resetAll() {
    fileName.value = "";
    activeTool.value = null;
    rotation.value = 0;
    flipH.value = false;
    flipV.value = false;
    adjustments.value = { brightness: 0, contrast: 0, saturation: 0 };
    activeFilter.value = "none";
    history.value = [];
    historyIndex.value = -1;
  }

  return {
    current, imageWidth, imageHeight, fileName, filePath, hasImage,
    activeTool, isProcessing,
    cropRect, cropAspectRatio,
    rotation, flipH, flipV,
    resizeWidth, resizeHeight, resizeLockAspect,
    adjustments, activeFilter,
    history, historyIndex, canUndo, canRedo,
    loadImage, pushHistory, undo, redo, resetAll,
  };
});
