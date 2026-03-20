<script setup lang="ts">
import { Minus, Plus } from "lucide-vue-next";

const { t } = useI18n();
const canvas = useCanvasStore();

const zoomPercent = computed(() => Math.round(canvas.viewport.zoom * 100));

const zoomIn = () => {
  canvas.viewport.zoom = Math.min(canvas.viewport.zoom * 1.2, 100);
};

const zoomOut = () => {
  canvas.viewport.zoom = Math.max(canvas.viewport.zoom / 1.2, 0.01);
};

const resetView = () => {
  canvas.viewport = { x: 0, y: 0, zoom: 1 };
};
</script>

<template>
  <div class="pointer-events-none absolute bottom-3 right-3 z-10">
    <div class="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-background/90 p-1 shadow-lg backdrop-blur-sm">
      <button
        class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        @click="zoomOut"
      >
        <Minus class="size-3.5" />
      </button>
      <button
        class="min-w-[3rem] rounded-md px-1.5 py-1 text-center text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        :title="t('resetView')"
        @click="resetView"
      >
        {{ zoomPercent }}%
      </button>
      <button
        class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        @click="zoomIn"
      >
        <Plus class="size-3.5" />
      </button>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  resetView: Ansicht zurücksetzen
en:
  resetView: Reset view
</i18n>
