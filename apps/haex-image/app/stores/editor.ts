import { defineStore } from "pinia";
import type { EditorTool, CropRect, ImageAdjustments, FilterType } from "~/types";

interface HistoryEntry {
  imageData: string; // data URL
  width: number;
  height: number;
}

export const useEditorStore = defineStore("editor", () => {
  // Image state
  const originalImage = ref<HTMLImageElement | null>(null);
  const imageDataUrl = ref<string | null>(null);
  const imageWidth = ref(0);
  const imageHeight = ref(0);
  const fileName = ref("");
  const filePath = ref("");

  // Tool state
  const activeTool = ref<EditorTool | null>(null);

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
  const history = ref<HistoryEntry[]>([]);
  const historyIndex = ref(-1);
  const canUndo = computed(() => historyIndex.value > 0);
  const canRedo = computed(() => historyIndex.value < history.value.length - 1);

  const hasImage = computed(() => !!imageDataUrl.value);

  function loadImage(img: HTMLImageElement, name: string, path: string = "") {
    originalImage.value = img;
    imageWidth.value = img.naturalWidth;
    imageHeight.value = img.naturalHeight;
    fileName.value = name;
    filePath.value = path;
    resizeWidth.value = img.naturalWidth;
    resizeHeight.value = img.naturalHeight;
    rotation.value = 0;
    flipH.value = false;
    flipV.value = false;
    adjustments.value = { brightness: 0, contrast: 0, saturation: 0 };
    activeFilter.value = "none";
    activeTool.value = null;

    // Create initial data URL
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    imageDataUrl.value = canvas.toDataURL("image/png");

    // Initialize history
    history.value = [{ imageData: imageDataUrl.value, width: img.naturalWidth, height: img.naturalHeight }];
    historyIndex.value = 0;
  }

  function pushHistory(dataUrl: string, width: number, height: number) {
    // Remove future entries
    history.value = history.value.slice(0, historyIndex.value + 1);
    history.value.push({ imageData: dataUrl, width, height });
    historyIndex.value = history.value.length - 1;
    imageDataUrl.value = dataUrl;
    imageWidth.value = width;
    imageHeight.value = height;
    resizeWidth.value = width;
    resizeHeight.value = height;
  }

  function undo() {
    if (!canUndo.value) return;
    historyIndex.value--;
    const entry = history.value[historyIndex.value];
    imageDataUrl.value = entry.imageData;
    imageWidth.value = entry.width;
    imageHeight.value = entry.height;
    resizeWidth.value = entry.width;
    resizeHeight.value = entry.height;
  }

  function redo() {
    if (!canRedo.value) return;
    historyIndex.value++;
    const entry = history.value[historyIndex.value];
    imageDataUrl.value = entry.imageData;
    imageWidth.value = entry.width;
    imageHeight.value = entry.height;
    resizeWidth.value = entry.width;
    resizeHeight.value = entry.height;
  }

  function resetAll() {
    originalImage.value = null;
    imageDataUrl.value = null;
    imageWidth.value = 0;
    imageHeight.value = 0;
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
    originalImage, imageDataUrl, imageWidth, imageHeight, fileName, filePath, hasImage,
    activeTool,
    cropRect, cropAspectRatio,
    rotation, flipH, flipV,
    resizeWidth, resizeHeight, resizeLockAspect,
    adjustments, activeFilter,
    history, historyIndex, canUndo, canRedo,
    loadImage, pushHistory, undo, redo, resetAll,
  };
});
