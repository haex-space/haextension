<script setup lang="ts">
import { Crop } from "@lucide/vue";
import type { Stencil } from "~/types/stencil";

const props = defineProps<{
  stencil: Stencil;
}>();

const emit = defineEmits<{
  crop: [];
}>();

const { t } = useI18n();
const canvas = useCanvasStore();

const stencil = toRef(props, "stencil");

const imageOpacity = computed({
  get: () => Math.round((stencil.value?.opacity ?? 1) * 100),
  set: (v: number) => {
    if (!stencil.value) return;
    stencil.value.opacity = Math.max(0, Math.min(100, v)) / 100;
    canvas.isDirty = true;
  },
});

const imageSaturation = computed({
  get: () => Math.round((stencil.value?.saturation ?? 1) * 100),
  set: (v: number) => {
    if (!stencil.value) return;
    stencil.value.saturation = Math.max(0, Math.min(200, v)) / 100;
    canvas.isDirty = true;
  },
});

const imageBrightness = computed({
  get: () => Math.round((stencil.value?.brightness ?? 1) * 100),
  set: (v: number) => {
    if (!stencil.value) return;
    stencil.value.brightness = Math.max(0, Math.min(200, v)) / 100;
    canvas.isDirty = true;
  },
});

const imageContrast = computed({
  get: () => Math.round((stencil.value?.contrast ?? 1) * 100),
  set: (v: number) => {
    if (!stencil.value) return;
    stencil.value.contrast = Math.max(0, Math.min(200, v)) / 100;
    canvas.isDirty = true;
  },
});

const resetImageAdjustments = () => {
  if (!stencil.value) return;
  stencil.value.opacity = 1;
  stencil.value.saturation = 1;
  stencil.value.brightness = 1;
  stencil.value.contrast = 1;
  canvas.isDirty = true;
};
</script>

<template>
  <ShadcnScrollArea class="h-full">
    <div class="flex flex-col gap-4 p-3">
      <!-- Crop button -->
      <button
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-input px-3 py-2 text-sm text-foreground hover:bg-accent"
        @click="emit('crop')"
      >
        <Crop class="size-4" /> {{ t("crop") }}
      </button>

      <div class="h-px bg-border" />

      <!-- Opacity -->
      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-xs text-muted-foreground">{{ t("opacity") }}</label>
          <span class="text-xs tabular-nums text-muted-foreground">{{ imageOpacity }}%</span>
        </div>
        <input :value="imageOpacity" type="range" :min="0" :max="100" step="1" class="w-full" @input="imageOpacity = Number(($event.target as HTMLInputElement).value)" />
      </div>

      <!-- Saturation -->
      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-xs text-muted-foreground">{{ t("saturation") }}</label>
          <span class="text-xs tabular-nums text-muted-foreground">{{ imageSaturation }}%</span>
        </div>
        <input :value="imageSaturation" type="range" :min="0" :max="200" step="1" class="w-full" @input="imageSaturation = Number(($event.target as HTMLInputElement).value)" />
      </div>

      <!-- Brightness -->
      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-xs text-muted-foreground">{{ t("brightness") }}</label>
          <span class="text-xs tabular-nums text-muted-foreground">{{ imageBrightness }}%</span>
        </div>
        <input :value="imageBrightness" type="range" :min="0" :max="200" step="1" class="w-full" @input="imageBrightness = Number(($event.target as HTMLInputElement).value)" />
      </div>

      <!-- Contrast -->
      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-xs text-muted-foreground">{{ t("contrast") }}</label>
          <span class="text-xs tabular-nums text-muted-foreground">{{ imageContrast }}%</span>
        </div>
        <input :value="imageContrast" type="range" :min="0" :max="200" step="1" class="w-full" @input="imageContrast = Number(($event.target as HTMLInputElement).value)" />
      </div>

      <div class="h-px bg-border" />

      <!-- Reset -->
      <button
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-input px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        @click="resetImageAdjustments"
      >
        {{ t("resetAdjustments") }}
      </button>
    </div>
  </ShadcnScrollArea>
</template>

<i18n lang="yaml">
de:
  opacity: Deckkraft
  saturation: Sättigung
  brightness: Helligkeit
  contrast: Kontrast
  crop: Zuschneiden
  resetAdjustments: Zurücksetzen
en:
  opacity: Opacity
  saturation: Saturation
  brightness: Brightness
  contrast: Contrast
  crop: Crop
  resetAdjustments: Reset
</i18n>
