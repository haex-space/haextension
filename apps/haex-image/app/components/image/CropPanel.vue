<script setup lang="ts">
import { Check } from "@lucide/vue";
import type { AspectRatioPreset } from "~/types";

const { t } = useI18n();
const editor = useEditorStore();
const processor = useImageProcessor();

const aspectPresets: AspectRatioPreset[] = [
  { id: "free", label: "Frei", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

async function confirmCrop() {
  if (editor.cropRect.width > 0 && editor.cropRect.height > 0) {
    await processor.applyCrop(editor.cropRect);
    editor.cropRect = { x: 0, y: 0, width: 0, height: 0 };
  }
}
</script>

<template>
  <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("aspectRatio") }}</p>
  <div class="flex flex-wrap gap-1">
    <button
      v-for="preset in aspectPresets"
      :key="preset.id"
      class="rounded-md px-2 py-1 text-xs transition-colors"
      :class="editor.cropAspectRatio === preset.ratio
        ? 'bg-primary text-primary-foreground'
        : 'bg-accent/50 text-foreground hover:bg-accent'"
      @click="editor.cropAspectRatio = preset.ratio"
    >
      {{ preset.label }}
    </button>
  </div>
  <p class="text-xs text-muted-foreground">{{ t("cropHint") }}</p>
  <button
    v-if="editor.cropRect.width > 0"
    class="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
    @click="confirmCrop"
  >
    <Check class="size-4" />
    {{ t("applyCrop") }}
  </button>
</template>

<i18n lang="yaml">
de:
  aspectRatio: Seitenverhältnis
  cropHint: Ziehe ein Rechteck auf dem Bild
  applyCrop: Zuschnitt anwenden
en:
  aspectRatio: Aspect Ratio
  cropHint: Draw a rectangle on the image
  applyCrop: Apply Crop
</i18n>
