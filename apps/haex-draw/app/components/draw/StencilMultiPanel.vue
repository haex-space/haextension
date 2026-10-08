<script setup lang="ts">
import {
  Trash2,
  RotateCw,
  RotateCcw,
  Pin,
  PinOff,
  Minus,
  Plus,
  Copy,
} from "@lucide/vue";
import { STENCIL_PRESETS } from "~/utils/stencilPresets";

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const stencilStore = useStencilStore();

const selectedStencils = computed(() =>
  stencilStore.stencils.filter((s) => stencilStore.isSelected(s.id))
);

const allResizable = computed(() =>
  selectedStencils.value.every((s) => {
    const preset = STENCIL_PRESETS.find((p) => p.id === s.presetId);
    return !preset || preset.category !== "din";
  })
);

const multiSizeValue = computed({
  get: () => {
    if (selectedStencils.value.length === 0) return 60;
    const sizes = selectedStencils.value.map((s) => Math.max(s.width, s.height));
    const allSame = sizes.every((s) => s === sizes[0]);
    return allSame ? (sizes[0] ?? 60) : Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
  },
  set: (val: number) => {
    const v = Math.max(10, val);
    for (const s of selectedStencils.value) {
      if (s.shapeType === "circle" || s.shapeType === "star" || s.shapeType === "hexagon") {
        stencilStore.resizeStencil(s.id, v, v);
      } else {
        const ratio = s.height / s.width;
        stencilStore.resizeStencil(s.id, v, Math.round(v * ratio));
      }
    }
  },
});

const multiRotationDeg = computed({
  get: () => {
    if (selectedStencils.value.length === 0) return 0;
    const degs = selectedStencils.value.map((s) => Math.round((s.rotation * 180) / Math.PI));
    return degs[0] ?? 0;
  },
  set: (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    for (const s of selectedStencils.value) {
      stencilStore.setStencilRotation(s.id, rad);
    }
  },
});

const rotateAll = (radians: number) => {
  for (const s of selectedStencils.value) {
    stencilStore.rotateStencil(s.id, radians);
  }
};

const pinAll = () => {
  const shouldPin = selectedStencils.value.some((s) => !s.pinned);
  for (const s of selectedStencils.value) {
    const st = stencilStore.getStencil(s.id);
    if (st) st.pinned = shouldPin;
  }
};

const allPinned = computed(() => selectedStencils.value.every((s) => s.pinned));
</script>

<template>
  <ShadcnScrollArea class="flex-1">
    <div class="flex flex-col gap-3 p-3">
      <!-- Rotation (apply to all) -->
      <div>
        <label class="mb-1 block text-xs text-muted-foreground">{{ t("rotation") }}</label>
        <div class="flex items-center gap-1">
          <button class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" @click="multiRotationDeg -= 1">
            <Minus class="size-4" />
          </button>
          <div class="relative flex-1">
            <input :value="multiRotationDeg" type="text" inputmode="numeric" class="h-9 w-full rounded-md border border-input bg-background px-2 pr-7 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" @change="multiRotationDeg = Number(($event.target as HTMLInputElement).value) || 0" />
            <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">°</span>
          </div>
          <button class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" @click="multiRotationDeg += 1">
            <Plus class="size-4" />
          </button>
        </div>
        <div class="mt-1.5 flex items-center gap-2">
          <button class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent active:bg-accent/70" @click="rotateAll(-Math.PI / 2)">
            <RotateCcw class="size-4" /> -90°
          </button>
          <button class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent active:bg-accent/70" @click="rotateAll(Math.PI / 2)">
            <RotateCw class="size-4" /> +90°
          </button>
        </div>
        <input :value="multiRotationDeg" type="range" :min="-180" :max="180" step="1" class="mt-1.5 w-full" @input="multiRotationDeg = Number(($event.target as HTMLInputElement).value)" />
      </div>

      <!-- Size (if all resizable) -->
      <div v-if="allResizable">
        <label class="mb-1 block text-xs text-muted-foreground">{{ t("diameter") }}</label>
        <div class="flex items-center gap-1">
          <button class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" @click="multiSizeValue -= 10">
            <Minus class="size-4" />
          </button>
          <div class="relative flex-1">
            <input :value="multiSizeValue" type="text" inputmode="numeric" class="h-9 w-full rounded-md border border-input bg-background px-2 pr-7 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" @change="multiSizeValue = Number(($event.target as HTMLInputElement).value) || 50" />
            <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">px</span>
          </div>
          <button class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent active:bg-accent/70" @click="multiSizeValue += 10">
            <Plus class="size-4" />
          </button>
        </div>
        <input :value="multiSizeValue" type="range" :min="10" :max="5000" step="10" class="mt-1.5 w-full" @input="multiSizeValue = Number(($event.target as HTMLInputElement).value)" />
      </div>

      <div class="h-px bg-border" />

      <!-- Multi actions -->
      <button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-accent" @click="stencilStore.copySelected()">
        <Copy class="size-4" /> {{ t("copyAll") }}
      </button>
      <button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-accent" @click="pinAll()">
        <component :is="allPinned ? PinOff : Pin" class="size-4" />
        {{ allPinned ? t("unpinAll") : t("pinAll") }}
      </button>
      <button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10" @click="stencilStore.removeSelected(); emit('close')">
        <Trash2 class="size-4" /> {{ t("deleteAll") }}
      </button>
    </div>
  </ShadcnScrollArea>
</template>

<i18n lang="yaml">
de:
  rotation: Drehung
  diameter: Durchmesser
  copyAll: Alle kopieren
  pinAll: Alle fixieren
  unpinAll: Alle lösen
  deleteAll: Alle entfernen
en:
  rotation: Rotation
  diameter: Diameter
  copyAll: Copy all
  pinAll: Pin all
  unpinAll: Unpin all
  deleteAll: Remove all
</i18n>
