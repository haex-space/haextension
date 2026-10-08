<script setup lang="ts">
import { ImagePlus } from "@lucide/vue";

const { t } = useI18n();
const haexVault = useHaexVaultStore();
const editor = useEditorStore();
const processor = useImageProcessor();

const canvasRef = useTemplateRef<HTMLCanvasElement>("canvasRef");
const containerRef = useTemplateRef<HTMLDivElement>("containerRef");

// Free rotation
const freeRotationDeg = ref(0);
async function applyFreeRotation() {
  if (freeRotationDeg.value === 0) return;
  await processor.applyRotate(freeRotationDeg.value);
  freeRotationDeg.value = 0;
  nextTick(render);
}

// Preview state for adjustments
const previewAdjustments = ref({ brightness: 0, contrast: 0, saturation: 0 });

onMounted(async () => {
  await haexVault.initializeAsync();
});

const { renderScale, render } = useCanvasRenderer(canvasRef, containerRef, previewAdjustments);

watch(() => editor.imageDataUrl, render);
watch(() => editor.activeTool, (newTool, oldTool) => {
  // Reset filter preview when leaving filter tool without applying
  if (oldTool === "filter" && newTool !== "filter") {
    editor.activeFilter = "none";
  }
  // Reset adjustment preview when leaving adjust tool without applying
  if (oldTool === "adjust" && newTool !== "adjust") {
    previewAdjustments.value = { brightness: 0, contrast: 0, saturation: 0 };
  }
  // Reset resize preview when leaving without applying
  if (oldTool === "resize" && newTool !== "resize") {
    editor.resizeWidth = editor.imageWidth;
    editor.resizeHeight = editor.imageHeight;
  }
  render();
});
watch(() => editor.cropRect, render, { deep: true });
watch(() => editor.activeFilter, render);
watch(previewAdjustments, render, { deep: true });
watch(() => [editor.resizeWidth, editor.resizeHeight], render);
onMounted(() => {
  if (containerRef.value) {
    const obs = new ResizeObserver(render);
    obs.observe(containerRef.value);
    onUnmounted(() => obs.disconnect());
  }
});

const { cropCursor, onCanvasPointerDown, onCanvasPointerMove, onCanvasPointerUp } = useCropInteraction(canvasRef, renderScale);

// File open
async function openFile() {
  const client = haexVault.client;
  if (!client) return;
  try {
    const paths = await client.filesystem.selectFile({
      title: t("openImage"),
      filters: [["Bilder", ["png", "jpg", "jpeg", "webp", "bmp", "gif"]]],
      multiple: false,
    });
    if (!paths || paths.length === 0) return;
    const filePath = paths[0]!;
    const name = filePath.split("/").pop() || "image";

    const data = await client.filesystem.readFile(filePath);
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "png";
    const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" };
    const mime = mimeMap[ext] ?? "image/png";

    const blob = new Blob([data as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      editor.loadImage(img, name, filePath);
      URL.revokeObjectURL(url);
      nextTick(render);
    };
    img.src = url;
  } catch (e) {
    console.error("[haex-image] openFile error:", e);
  }
}

// Adjustments
async function confirmAdjustments() {
  await processor.applyAdjustments({ ...previewAdjustments.value });
  previewAdjustments.value = { brightness: 0, contrast: 0, saturation: 0 };
}

function resetAdjustments() {
  previewAdjustments.value = { brightness: 0, contrast: 0, saturation: 0 };
  editor.activeTool = null;
  render();
}

// Compress
async function confirmCompress(format: "jpeg" | "webp" | "png", quality: number) {
  await processor.applyCompress(format, quality / 100);
  nextTick(render);
}

// Export
async function saveAs() {
  const client = haexVault.client;
  if (!client || !editor.imageDataUrl) return;
  try {
    const ext = editor.fileName.split(".").pop()?.toLowerCase();
    const format = ext === "jpg" || ext === "jpeg" ? "jpeg" : "png";
    const blob = await processor.exportImage(format as "png" | "jpeg");
    const buffer = await blob.arrayBuffer();
    await client.filesystem.saveFileAsync(new Uint8Array(buffer), {
      title: t("saveAs"),
      defaultPath: editor.filePath || editor.fileName,
      filters: [{ name: "Bilder", extensions: [format === "jpeg" ? "jpg" : "png"] }],
    });
  } catch (e) {
    console.error("[haex-image] saveAs error:", e);
  }
}
</script>

<template>
  <div class="flex h-screen flex-col bg-background">
    <ImageToolbar @open="openFile" @save="saveAs" />


    <div class="flex flex-1 overflow-hidden">
      <!-- Tool Options Sidebar -->
      <aside
        v-if="editor.activeTool"
        class="flex w-56 flex-col gap-3 overflow-y-auto border-r border-border bg-card p-3"
      >
        <ImageCropPanel v-if="editor.activeTool === 'crop'" />
        <ImageRotatePanel
          v-if="editor.activeTool === 'rotate'"
          v-model:free-rotation-deg="freeRotationDeg"
          @apply-free-rotation="applyFreeRotation"
        />
        <ImageResizePanel v-if="editor.activeTool === 'resize'" />
        <ImageAdjustPanel
          v-if="editor.activeTool === 'adjust'"
          v-model:preview-adjustments="previewAdjustments"
          @reset="resetAdjustments"
          @confirm="confirmAdjustments"
        />
        <ImageCompressPanel v-if="editor.activeTool === 'compress'" @confirm="confirmCompress" />
        <ImageFilterPanel v-if="editor.activeTool === 'filter'" />
      </aside>

      <!-- Canvas Area -->
      <div
        ref="containerRef"
        class="flex flex-1 items-center justify-center overflow-hidden"
        style="background-color: #1a1a1a; background-image: linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;"
      >
        <!-- Empty state -->
        <div v-if="!editor.hasImage" class="flex flex-col items-center gap-4 rounded-xl bg-card/90 p-10 shadow-lg backdrop-blur">
          <ImagePlus class="size-16 text-muted-foreground" />
          <p class="text-sm text-foreground">{{ t("noImage") }}</p>
          <button
            class="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            @click="openFile"
          >
            <ImagePlus class="size-4" />
            {{ t("openImage") }}
          </button>
        </div>

        <!-- Image canvas -->
        <canvas
          v-show="editor.hasImage"
          ref="canvasRef"
          class="shadow-2xl ring-1 ring-white/10"
          :class="editor.activeTool === 'crop' ? (cropCursor) : ''"
          @pointerdown="onCanvasPointerDown"
          @pointermove="onCanvasPointerMove"
          @pointerup="onCanvasPointerUp"
        />
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  noImage: Kein Bild geladen
  openImage: Bild öffnen
  saveAs: Speichern unter
en:
  noImage: No image loaded
  openImage: Open Image
  saveAs: Save As
</i18n>
