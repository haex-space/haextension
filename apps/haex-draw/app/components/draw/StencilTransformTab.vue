<script setup lang="ts">
import {
  RotateCw,
  RotateCcw,
  Minus,
  Plus,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
} from "@lucide/vue";
import type { Stencil } from "~/types/stencil";
import { STENCIL_PRESETS } from "~/utils/stencilPresets";

const props = defineProps<{
  stencil: Stencil;
}>();

const { t } = useI18n();
const canvas = useCanvasStore();
const stencilStore = useStencilStore();

const stencil = toRef(props, "stencil");

const isResizable = computed(() => {
  if (!stencil.value) return false;
  const preset = STENCIL_PRESETS.find((p) => p.id === stencil.value!.presetId);
  return preset?.category !== "din";
});

const rotationDeg = computed({
  get: () => {
    if (!stencil.value) return 0;
    return Math.round((stencil.value.rotation * 180) / Math.PI);
  },
  set: (deg: number) => {
    if (!stencil.value) return;
    stencilStore.setStencilRotation(stencil.value.id, (deg * Math.PI) / 180);
  },
});

const sizeValue = computed({
  get: () => stencil.value ? Math.round(Math.max(stencil.value.width, stencil.value.height)) : 60,
  set: (val: number) => {
    if (!stencil.value) return;
    const v = Math.max(10, val);
    if (stencil.value.shapeType === "circle" || stencil.value.shapeType === "star" || stencil.value.shapeType === "hexagon") {
      stencilStore.resizeStencil(stencil.value.id, v, v);
    } else {
      const ratio = stencil.value.height / stencil.value.width;
      stencilStore.resizeStencil(stencil.value.id, v, Math.round(v * ratio));
    }
  },
});
</script>

<template>
  <ShadcnScrollArea class="h-full">
    <div class="flex flex-col gap-3 p-3">
      <!-- Rotation -->
      <div>
        <label class="mb-1 block text-xs text-muted-foreground">{{ t("rotation") }}</label>
        <div class="flex items-center gap-1">
          <button class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" @click="rotationDeg -= 1">
            <Minus class="size-4" />
          </button>
          <div class="relative flex-1">
            <input :value="rotationDeg" type="text" inputmode="numeric" class="h-9 w-full rounded-md border border-input bg-background px-2 pr-7 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" @change="rotationDeg = Number(($event.target as HTMLInputElement).value) || 0" />
            <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">°</span>
          </div>
          <button class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" @click="rotationDeg += 1">
            <Plus class="size-4" />
          </button>
        </div>
        <div class="mt-1.5 flex items-center gap-2">
          <button class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent active:bg-accent/70" @click="stencilStore.rotateStencil(stencil!.id, -Math.PI / 2)">
            <RotateCcw class="size-4" /> -90°
          </button>
          <button class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent active:bg-accent/70" @click="stencilStore.rotateStencil(stencil!.id, Math.PI / 2)">
            <RotateCw class="size-4" /> +90°
          </button>
        </div>
        <input :value="rotationDeg" type="range" :min="-180" :max="180" step="1" class="mt-1.5 w-full" @input="rotationDeg = Number(($event.target as HTMLInputElement).value)" />
      </div>

      <!-- Size -->
      <div v-if="isResizable">
        <label class="mb-1 block text-xs text-muted-foreground">{{ t("diameter") }}</label>
        <div class="flex items-center gap-1">
          <button class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" @click="sizeValue -= 10">
            <Minus class="size-4" />
          </button>
          <div class="relative flex-1">
            <input :value="sizeValue" type="text" inputmode="numeric" class="h-9 w-full rounded-md border border-input bg-background px-2 pr-7 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" @change="sizeValue = Number(($event.target as HTMLInputElement).value) || 50" />
            <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">px</span>
          </div>
          <button class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" @click="sizeValue += 10">
            <Plus class="size-4" />
          </button>
        </div>
        <input :value="sizeValue" type="range" :min="10" :max="5000" step="10" class="mt-1.5 w-full" @input="sizeValue = Number(($event.target as HTMLInputElement).value)" />
      </div>

      <!-- Info (DIN) -->
      <div v-if="!isResizable" class="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <div class="flex justify-between">
          <span>{{ t("size") }}</span>
          <span>{{ stencil.width }} × {{ stencil.height }}px</span>
        </div>
      </div>

      <!-- Layer order -->
      <div>
        <label class="mb-1 block text-xs text-muted-foreground">{{ t("layer") }}</label>
        <div class="grid grid-cols-4 gap-1">
          <button class="flex h-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" :title="t('layerBottom')" @click="stencilStore.moveLayerToBottom(stencil!.id); canvas.isDirty = true">
            <ChevronsDown class="size-4" />
          </button>
          <button class="flex h-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" :title="t('layerDown')" @click="stencilStore.moveLayerDown(stencil!.id); canvas.isDirty = true">
            <ArrowDown class="size-4" />
          </button>
          <button class="flex h-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" :title="t('layerUp')" @click="stencilStore.moveLayerUp(stencil!.id); canvas.isDirty = true">
            <ArrowUp class="size-4" />
          </button>
          <button class="flex h-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" :title="t('layerTop')" @click="stencilStore.moveLayerToTop(stencil!.id); canvas.isDirty = true">
            <ChevronsUp class="size-4" />
          </button>
        </div>
      </div>
    </div>
  </ShadcnScrollArea>
</template>

<i18n lang="yaml">
de:
  rotation: Drehung
  diameter: Durchmesser
  size: Größe
  layer: Ebene
  layerUp: Höher
  layerDown: Tiefer
  layerTop: Ganz nach oben
  layerBottom: Ganz nach unten
en:
  rotation: Rotation
  diameter: Diameter
  size: Size
  layerUp: Up
  layerDown: Down
  layerTop: To top
  layerBottom: To bottom
</i18n>
