<script setup lang="ts">
import { useEventListener } from "@vueuse/core";

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

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${canvas.drawingName || "drawing"}.png`;
  a.click();
  URL.revokeObjectURL(url);
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
</script>

<template>
  <div v-if="isLoaded" class="flex h-full w-full">
    <!-- Left Toolbar -->
    <DrawToolbar
      :history-visible="historyVisible"
      @save="onSave"
      @export-png="onExportPng"
      @toggle-history="historyVisible = !historyVisible"
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
  </div>
</template>

<i18n lang="yaml">
de:
  title: Zeichnen
en:
  title: Draw
</i18n>
