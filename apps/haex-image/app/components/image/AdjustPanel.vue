<script setup lang="ts">
import { X, Check } from "@lucide/vue";
import type { ImageAdjustments } from "~/types";

const previewAdjustments = defineModel<ImageAdjustments>("previewAdjustments", { required: true });

const emit = defineEmits<{
  reset: [];
  confirm: [];
}>();

const { t } = useI18n();
</script>

<template>
  <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("adjust") }}</p>
  <div class="flex flex-col gap-3">
    <div v-for="param in ['brightness', 'contrast', 'saturation'] as const" :key="param">
      <div class="mb-1 flex justify-between text-xs">
        <span class="text-muted-foreground">{{ t(param) }}</span>
        <span class="font-mono text-foreground">{{ previewAdjustments[param] }}</span>
      </div>
      <input
        v-model.number="previewAdjustments[param]"
        type="range"
        min="-100"
        max="100"
        class="w-full accent-primary"
      >
    </div>
    <div class="flex gap-2">
      <button
        class="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/50 py-2 text-sm hover:bg-accent"
        @click="emit('reset')"
      >
        <X class="size-4" />
        {{ t("cancel") }}
      </button>
      <button
        class="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-2 text-sm text-primary-foreground"
        @click="emit('confirm')"
      >
        <Check class="size-4" />
        {{ t("apply") }}
      </button>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  adjust: Anpassen
  brightness: Helligkeit
  contrast: Kontrast
  saturation: Sättigung
  cancel: Abbrechen
  apply: Anwenden
en:
  adjust: Adjust
  brightness: Brightness
  contrast: Contrast
  saturation: Saturation
  cancel: Cancel
  apply: Apply
</i18n>
