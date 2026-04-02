<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { Undo2, Redo2, History } from "lucide-vue-next";

const route = useRoute();
const router = useRouter();
const localePath = useLocalePath();
const { t } = useI18n();
const haexVault = useHaexVaultStore();
const canvas = useCanvasStore();
const stencilStore = useStencilStore();
const paletteStore = usePaletteStore();
const { saveAsync, loadAsync, exportPngAsync, generateThumbnailAsync } = useDrawingPersistence();

const historyVisible = ref(false);
const cameraVisible = ref(false);
const galleryVisible = ref(false);
const emojiPickerVisible = ref(false);
const isLoaded = ref(false);

const rightPanelVisible = computed(() =>
  historyVisible.value || stencilStore.selectedIds.size > 0
);

onMounted(async () => {
  await haexVault.initializeAsync();
  await paletteStore.loadAsync();

  const id = route.params.id as string;

  if (id === "new") {
    canvas.newDrawing();
    stencilStore.clear();
  } else if (canvas.drawingId === id) {
    // Already loaded (e.g. from store), nothing to do
  } else {
    const drawing = await loadAsync(id);
    if (drawing) {
      canvas.loadDrawing({
        id: drawing.id,
        name: drawing.name,
        strokes: drawing.strokes,
        viewport: drawing.viewport,
      });
      if (drawing.stencils && Array.isArray(drawing.stencils)) {
        stencilStore.loadStencils(drawing.stencils);
      }
    } else {
      router.replace(localePath("/"));
      return;
    }
  }

  isLoaded.value = true;
});

// Auto-save interval
const autoSaveInterval = ref<ReturnType<typeof setInterval>>();

onMounted(() => {
  autoSaveInterval.value = setInterval(async () => {
    if (canvas.isDirty && canvas.drawingId) {
      try {
        await saveAsync();
        await generateThumbnailAsync();
        canvas.isDirty = false;
      } catch (e) {
        console.error("[haex-draw] Auto-save failed:", e);
        // TODO: show error toast
      }
    }
  }, 10_000);
});

onUnmounted(() => {
  if (autoSaveInterval.value) clearInterval(autoSaveInterval.value);
});

// Save before leaving
onBeforeUnmount(async () => {
  if (canvas.isDirty && canvas.drawingId) {
    await saveAsync();
    await generateThumbnailAsync();
    canvas.isDirty = false;
  }
});

const onSave = async () => {
  await saveAsync();
  await generateThumbnailAsync();
  canvas.isDirty = false;
};

const onExportPng = async () => {
  const blob = await exportPngAsync();
  if (!blob) return;

  const buffer = await blob.arrayBuffer();
  await haexVault.client.filesystem.saveFileAsync(new Uint8Array(buffer), {
    defaultPath: `${canvas.drawingName || "drawing"}.png`,
    title: "Export as PNG",
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });
};

// Ctrl+S
useEventListener(window, "keydown", (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    onSave();
  }
});

const onDrawingNameUpdate = (name: string) => {
  canvas.drawingName = name;
  canvas.isDirty = true;
};

// Camera & Gallery
const gallery = useImageGallery();
const galleryPreviewThumbnail = ref<string | null>(null);

// Background scan to get the latest image thumbnail for the toolbar button
onMounted(async () => {
  await gallery.scanAsync();
  if (gallery.images.value.length > 0) {
    galleryPreviewThumbnail.value = await gallery.loadThumbnailAsync(gallery.images.value[0]!.path);
  }
});

const getViewportCenter = () => {
  const { x: panX, y: panY, zoom } = canvas.viewport;
  const el = document.querySelector("canvas");
  const w = el?.clientWidth ?? 800;
  const h = el?.clientHeight ?? 600;
  return {
    x: (w / 2 - panX) / zoom,
    y: (h / 2 - panY) / zoom,
  };
};

const switchToPanAfterInsert = () => {
  canvas.activeTool = "pan";
  canvas.isDirty = true;
};

const onCameraCapture = (dataUrl: string, width: number, height: number) => {
  const center = getViewportCenter();
  stencilStore.addImageStencil(dataUrl, width, height, "Camera", center.x, center.y);
  cameraVisible.value = false;
  switchToPanAfterInsert();
};

const onGallerySelect = (dataUrl: string, width: number, height: number, name: string) => {
  const center = getViewportCenter();
  stencilStore.addImageStencil(dataUrl, width, height, name, center.x, center.y);
  galleryVisible.value = false;
  switchToPanAfterInsert();
};

const onEmojiSelect = (emoji: string) => {
  const center = getViewportCenter();
  stencilStore.addEmojiStencil(emoji, center.x, center.y);
  emojiPickerVisible.value = false;
  switchToPanAfterInsert();
};
</script>

<template>
  <div v-if="isLoaded" class="flex h-full w-full">
    <!-- Left Toolbar -->
    <DrawToolbar
      :history-visible="historyVisible"
      :gallery-visible="galleryVisible"
      :gallery-thumbnail="galleryPreviewThumbnail"
      @save="onSave"
      @export-png="onExportPng"
      @toggle-history="historyVisible = !historyVisible"
      @toggle-camera="cameraVisible = true"
      @toggle-gallery="galleryVisible = !galleryVisible"
      @toggle-emoji="emojiPickerVisible = !emojiPickerVisible"
    />
    <!-- Canvas -->
    <div class="relative flex-1 min-w-0">
      <!-- Drawing name -->
      <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2">
        <input
          :value="canvas.drawingName"
          class="pointer-events-auto h-7 rounded-md border border-transparent bg-transparent px-2 text-center text-sm text-foreground/60 hover:border-input hover:text-foreground focus:border-input focus:bg-background/80 focus:text-foreground focus:outline-none"
          @change="onDrawingNameUpdate(($event.target as HTMLInputElement).value)"
        />
      </div>
      <!-- Undo / Redo / History (top right) -->
      <div class="absolute right-0 top-0 z-10 flex items-center gap-0.5 border-b border-l border-border bg-background rounded-bl-lg px-1 py-1">
        <button
          class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
          :title="`${t('undo')} (Ctrl+Z)`"
          :disabled="!canvas.canUndo"
          @click="canvas.undo()"
        >
          <Undo2 class="size-5" />
        </button>
        <button
          class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
          :title="`${t('redo')} (Ctrl+Y)`"
          :disabled="!canvas.canRedo"
          @click="canvas.redo()"
        >
          <Redo2 class="size-5" />
        </button>
        <button
          class="rounded-lg p-1.5 transition-colors"
          :class="historyVisible
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
          :title="t('history')"
          @click="historyVisible = !historyVisible"
        >
          <History class="size-5" />
        </button>
      </div>
      <DrawInfiniteCanvas />
      <DrawZoomControls />
    </div>
    <!-- Right sidebar: History or Stencil panel -->
    <div
      class="shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out"
      :class="rightPanelVisible ? 'w-56' : 'w-0'"
    >
      <div class="h-full w-56">
        <DrawStencilPanel v-if="stencilStore.selectedIds.size > 0" />
        <DrawHistoryPanel v-else-if="historyVisible" />
      </div>
    </div>
    <!-- Emoji Picker -->
    <DrawEmojiPicker
      v-if="emojiPickerVisible"
      @select="onEmojiSelect"
      @close="emojiPickerVisible = false"
    />

    <!-- Camera Overlay -->
    <DrawCameraOverlay
      v-if="cameraVisible"
      @close="cameraVisible = false"
      @capture="onCameraCapture"
    />

    <!-- Image Gallery -->
    <DrawImageGallery
      v-if="galleryVisible"
      @close="galleryVisible = false"
      @select="onGallerySelect"
    />
  </div>
</template>

<i18n lang="yaml">
de:
  title: Zeichnen
  undo: Rückgängig
  redo: Wiederherstellen
  history: Verlauf
en:
  title: Draw
  undo: Undo
  redo: Redo
  history: History
</i18n>
