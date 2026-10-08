<script setup lang="ts">
import { Check } from "@lucide/vue";

const { t } = useI18n();
const editor = useEditorStore();
const processor = useImageProcessor();

function onResizeWidthChange(w: number) {
  editor.resizeWidth = w;
  if (editor.resizeLockAspect) {
    editor.resizeHeight = Math.round(w / (editor.imageWidth / editor.imageHeight));
  }
}
function onResizeHeightChange(h: number) {
  editor.resizeHeight = h;
  if (editor.resizeLockAspect) {
    editor.resizeWidth = Math.round(h * (editor.imageWidth / editor.imageHeight));
  }
}

async function confirmResize() {
  await processor.applyResize(editor.resizeWidth, editor.resizeHeight);
}
</script>

<template>
  <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("resize") }}</p>
  <div class="flex flex-col gap-2">
    <label class="text-xs text-muted-foreground">{{ t("width") }} (px)</label>
    <input
      :key="'w-' + editor.resizeHeight"
      :value="editor.resizeWidth"
      type="number"
      min="1"
      max="10000"
      class="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      @change="onResizeWidthChange(Number(($event.target as HTMLInputElement).value))"
    >
    <label class="text-xs text-muted-foreground">{{ t("height") }} (px)</label>
    <input
      :key="'h-' + editor.resizeWidth"
      :value="editor.resizeHeight"
      type="number"
      min="1"
      max="10000"
      class="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      @change="onResizeHeightChange(Number(($event.target as HTMLInputElement).value))"
    >
    <label class="flex cursor-pointer items-center justify-between gap-2 rounded-md bg-accent/30 px-3 py-2">
      <span class="text-xs text-foreground">{{ t("lockAspect") }}</span>
      <ShadcnSwitch
        :checked="editor.resizeLockAspect"
        @update:checked="editor.resizeLockAspect = $event"
      />
    </label>
    <button
      class="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
      @click="confirmResize"
    >
      <Check class="size-4" />
      {{ t("applyResize") }}
    </button>
  </div>
</template>

<i18n lang="yaml">
de:
  resize: Größe
  width: Breite
  height: Höhe
  lockAspect: Seitenverhältnis beibehalten
  applyResize: Größe anwenden
en:
  resize: Resize
  width: Width
  height: Height
  lockAspect: Lock Aspect Ratio
  applyResize: Apply Resize
</i18n>
