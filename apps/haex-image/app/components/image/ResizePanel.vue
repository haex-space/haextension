<script setup lang="ts">
import { Check } from "@lucide/vue";
import { clampSide, parseSide } from "~/lib/dimensions";

const { t } = useI18n();
const editor = useEditorStore();
const processor = useImageProcessor();

function onResizeWidthChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const w = parseSide(input.value);
  if (w === null) {
    input.value = String(editor.resizeWidth);
    return;
  }
  editor.resizeWidth = w;
  if (editor.resizeLockAspect) {
    editor.resizeHeight = clampSide(w / (editor.imageWidth / editor.imageHeight));
  }
}
function onResizeHeightChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const h = parseSide(input.value);
  if (h === null) {
    input.value = String(editor.resizeHeight);
    return;
  }
  editor.resizeHeight = h;
  if (editor.resizeLockAspect) {
    editor.resizeWidth = clampSide(h * (editor.imageWidth / editor.imageHeight));
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
      @change="onResizeWidthChange"
    >
    <label class="text-xs text-muted-foreground">{{ t("height") }} (px)</label>
    <input
      :key="'h-' + editor.resizeWidth"
      :value="editor.resizeHeight"
      type="number"
      min="1"
      max="10000"
      class="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      @change="onResizeHeightChange"
    >
    <label class="flex cursor-pointer items-center justify-between gap-2 rounded-md bg-accent/30 px-3 py-2">
      <span class="text-xs text-foreground">{{ t("lockAspect") }}</span>
      <ShadcnSwitch v-model="editor.resizeLockAspect" />
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
