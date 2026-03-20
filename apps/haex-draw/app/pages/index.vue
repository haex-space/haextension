<script setup lang="ts">
const { t } = useI18n();
const haexVault = useHaexVaultStore();
const canvas = useCanvasStore();
const stencilStore = useStencilStore();
const paletteStore = usePaletteStore();
const { saveAsync, exportPngAsync } = useDrawingPersistence();

const historyVisible = ref(false);

const rightPanelVisible = computed(() =>
  historyVisible.value || stencilStore.selectedIds.size > 0
);

onMounted(async () => {
  await haexVault.initializeAsync();
  canvas.newDrawing();
  await paletteStore.loadAsync();
});

const onSave = async () => {
  await saveAsync();
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

// Auto-save on Ctrl+S
const onKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    onSave();
  }
};

onMounted(() => window.addEventListener("keydown", onKeyDown));
onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <div class="flex h-full w-full">
    <!-- Left Toolbar -->
    <DrawToolbar
      :history-visible="historyVisible"
      @save="onSave"
      @export-png="onExportPng"
      @toggle-history="historyVisible = !historyVisible"
    />
    <!-- Canvas -->
    <div class="relative flex-1 min-w-0">
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
