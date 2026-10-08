<script setup lang="ts">
import { RotateCw, RotateCcw, FlipHorizontal2, FlipVertical2, Check } from "@lucide/vue";

const freeRotationDeg = defineModel<number>("freeRotationDeg", { required: true });

const emit = defineEmits<{
  applyFreeRotation: [];
}>();

const { t } = useI18n();
const processor = useImageProcessor();
</script>

<template>
  <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("rotate") }}</p>
  <div class="flex gap-2">
    <button
      class="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/50 py-2 text-sm hover:bg-accent"
      @click="processor.applyRotate90('ccw')"
    >
      <RotateCcw class="size-4" /> 90°
    </button>
    <button
      class="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/50 py-2 text-sm hover:bg-accent"
      @click="processor.applyRotate90('cw')"
    >
      <RotateCw class="size-4" /> 90°
    </button>
  </div>

  <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("freeRotation") }}</p>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <input
        v-model.number="freeRotationDeg"
        type="range"
        min="-180"
        max="180"
        step="1"
        class="flex-1 accent-primary"
      >
      <span class="w-10 text-right font-mono text-xs text-foreground">{{ freeRotationDeg }}°</span>
    </div>
    <input
      v-model.number="freeRotationDeg"
      type="number"
      min="-360"
      max="360"
      step="1"
      class="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
    >
    <button
      :disabled="freeRotationDeg === 0"
      class="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-30"
      @click="emit('applyFreeRotation')"
    >
      <Check class="size-4" />
      {{ t("applyRotation") }}
    </button>
  </div>

  <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("flip") }}</p>
  <div class="flex gap-2">
    <button
      class="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/50 py-2 text-sm hover:bg-accent"
      @click="processor.applyFlip('horizontal')"
    >
      <FlipHorizontal2 class="size-4" /> H
    </button>
    <button
      class="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/50 py-2 text-sm hover:bg-accent"
      @click="processor.applyFlip('vertical')"
    >
      <FlipVertical2 class="size-4" /> V
    </button>
  </div>
</template>

<i18n lang="yaml">
de:
  rotate: Drehen
  freeRotation: Freie Drehung
  applyRotation: Drehung anwenden
  flip: Spiegeln
en:
  rotate: Rotate
  freeRotation: Free Rotation
  applyRotation: Apply Rotation
  flip: Flip
</i18n>
