<script setup lang="ts">
import { Check } from "@lucide/vue";

const emit = defineEmits<{
  confirm: [format: "jpeg" | "webp" | "png", quality: number];
}>();

const { t } = useI18n();
const editor = useEditorStore();
const processor = useImageProcessor();

const compressFormat = ref<"jpeg" | "webp" | "png">("jpeg");
const compressQuality = ref(80);
const compressEstimatedSize = ref<number | null>(null);
const compressOriginalSize = ref<number | null>(null);
const compressEstimating = ref(false);

async function updateCompressEstimate() {
  if (!editor.imageDataUrl) return;
  compressEstimating.value = true;
  compressOriginalSize.value = Math.round((editor.imageDataUrl.length * 3) / 4);
  compressEstimatedSize.value = await processor.estimateCompressedSize(
    compressFormat.value,
    compressQuality.value / 100,
  );
  compressEstimating.value = false;
}

watch([compressFormat, compressQuality], () => {
  if (editor.activeTool === "compress") updateCompressEstimate();
});

updateCompressEstimate();

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("compress") }}</p>
  <div class="flex flex-col gap-3">
    <div>
      <p class="mb-1 text-xs text-muted-foreground">{{ t("format") }}</p>
      <div class="flex gap-1">
        <button
          v-for="fmt in (['jpeg', 'webp', 'png'] as const)"
          :key="fmt"
          class="flex-1 rounded-md px-2 py-1.5 text-xs uppercase transition-colors"
          :class="compressFormat === fmt
            ? 'bg-primary text-primary-foreground'
            : 'bg-accent/50 text-foreground hover:bg-accent'"
          @click="compressFormat = fmt"
        >
          {{ fmt }}
        </button>
      </div>
    </div>
    <div v-if="compressFormat !== 'png'">
      <div class="mb-1 flex justify-between text-xs">
        <span class="text-muted-foreground">{{ t("quality") }}</span>
        <span class="font-mono text-foreground">{{ compressQuality }}%</span>
      </div>
      <input
        v-model.number="compressQuality"
        type="range"
        min="1"
        max="100"
        class="w-full accent-primary"
      >
    </div>
    <p v-else class="text-xs text-muted-foreground">{{ t("pngLossless") }}</p>
    <div v-if="compressOriginalSize != null" class="rounded-md bg-accent/30 p-2 text-xs">
      <div class="flex justify-between">
        <span class="text-muted-foreground">{{ t("original") }}</span>
        <span class="font-mono text-foreground">{{ formatFileSize(compressOriginalSize) }}</span>
      </div>
      <div class="mt-1 flex justify-between">
        <span class="text-muted-foreground">{{ t("compressed") }}</span>
        <span v-if="compressEstimating" class="font-mono text-muted-foreground">...</span>
        <span v-else-if="compressEstimatedSize != null" class="font-mono text-foreground">{{ formatFileSize(compressEstimatedSize) }}</span>
      </div>
      <div v-if="compressEstimatedSize != null && compressOriginalSize > 0 && !compressEstimating" class="mt-1 flex justify-between">
        <span class="text-muted-foreground">{{ t("savings") }}</span>
        <span class="font-mono text-green-500">-{{ Math.round((1 - compressEstimatedSize / compressOriginalSize) * 100) }}%</span>
      </div>
    </div>
    <button
      class="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
      @click="emit('confirm', compressFormat, compressQuality)"
    >
      <Check class="size-4" />
      {{ t("applyCompress") }}
    </button>
  </div>
</template>

<i18n lang="yaml">
de:
  compress: Komprimieren
  format: Format
  quality: Qualität
  original: Original
  compressed: Komprimiert
  savings: Ersparnis
  applyCompress: Komprimieren
  pngLossless: PNG ist verlustfrei — keine Qualitätseinstellung nötig.
en:
  compress: Compress
  format: Format
  quality: Quality
  original: Original
  compressed: Compressed
  savings: Savings
  applyCompress: Compress
  pngLossless: PNG is lossless — no quality setting needed.
</i18n>
