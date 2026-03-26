<script setup lang="ts">
import {
  Download,
  Trash2,
  RotateCw,
  RotateCcw,
  Pin,
  PinOff,
  X,
  Frame,
  Minus,
  Plus,
  Copy,
  SlidersHorizontal,
  Move,
  ImageIcon,
  ArrowUp,
  ArrowDown,
} from "lucide-vue-next";
import type { Stencil } from "~/types/stencil";
import getStroke from "perfect-freehand";
import { BRUSH_PRESETS } from "~/utils/brushPresets";
import { STENCIL_PRESETS, getStencilClipPath } from "~/utils/stencilPresets";

const { t, locale } = useI18n();
const canvas = useCanvasStore();
const stencilStore = useStencilStore();

const isMulti = computed(() => stencilStore.selectedIds.size > 1);
const selectionCount = computed(() => stencilStore.selectedIds.size);

const stencil = computed<Stencil | null>(() => {
  if (!stencilStore.selectedId) return null;
  return stencilStore.getStencil(stencilStore.selectedId) ?? null;
});

const selectedStencils = computed(() =>
  stencilStore.stencils.filter((s) => stencilStore.isSelected(s.id))
);

const isImageStencil = computed(() => stencil.value?.shapeType === "image");

const activeTab = ref("transform");

// Reset tab when selection changes away from image
watch(isImageStencil, (isImage) => {
  if (!isImage && activeTab.value === "image") {
    activeTab.value = "transform";
  }
});

// --- Single stencil computed ---

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

// --- Image adjustment helpers ---

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

// --- Multi stencil ---

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
    return allSame ? sizes[0] : Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
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
    return degs[0];
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

const close = () => {
  stencilStore.clearSelection();
};

// --- Export ---

const exportStencilAsync = async (s: Stencil) => {
  const hw = s.width / 2;
  const hh = s.height / 2;

  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = s.width;
  tmpCanvas.height = s.height;
  const ctx = tmpCanvas.getContext("2d");
  if (!ctx) return;

  const clipPath = getStencilClipPath(s.shapeType, hw, hh, s.svgPath);

  ctx.translate(hw, hh);
  ctx.rotate(s.rotation);
  ctx.save();
  ctx.clip(clipPath);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-hw, -hh, s.width, s.height);

  ctx.translate(-s.x, -s.y);

  for (const stroke of canvas.strokes) {
    if (stroke.tool === "eraser") continue;

    const preset = BRUSH_PRESETS.find((p) => p.id === stroke.brushPreset) ?? BRUSH_PRESETS[0];
    const hasPressure = stroke.points.some((p) => p[2] !== 0.5);

    const outlinePoints = getStroke(stroke.points, {
      size: stroke.size,
      thinning: preset.options.thinning,
      smoothing: preset.options.smoothing,
      streamline: preset.options.streamline,
      simulatePressure: preset.options.simulatePressure && !hasPressure,
      start: preset.options.start,
      end: preset.options.end,
    });

    if (outlinePoints.length < 2) continue;

    ctx.beginPath();
    const [first, ...rest] = outlinePoints;
    ctx.moveTo(first[0], first[1]);
    for (const [x, y] of rest) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = stroke.color;
    ctx.fill();
  }

  ctx.restore();

  tmpCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${s.label}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
};
</script>

<template>
  <div v-if="stencilStore.selectedIds.size > 0" class="flex h-full flex-col border-l border-border bg-background/95 backdrop-blur-sm">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-border px-3 py-2">
      <div class="flex items-center gap-2">
        <Frame class="size-4 text-muted-foreground" />
        <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {{ isMulti ? `${selectionCount} ${t("stencils")}` : t("stencil") }}
        </span>
      </div>
      <button
        class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        @click="close"
      >
        <X class="size-4" />
      </button>
    </div>

    <!-- ======================== -->
    <!-- SINGLE STENCIL VIEW      -->
    <!-- ======================== -->
    <template v-if="!isMulti && stencil">
      <ShadcnTabs v-model="activeTab" class="flex flex-1 flex-col overflow-hidden">
        <ShadcnTabsList class="mx-auto mt-2 inline-grid w-auto shrink-0" :class="isImageStencil ? 'grid-cols-3' : 'grid-cols-2'">
          <ShadcnTabsTrigger value="transform" :title="t('transform')" class="flex items-center justify-center">
            <Move class="size-4" />
          </ShadcnTabsTrigger>
          <ShadcnTabsTrigger v-if="isImageStencil" value="image" :title="t('image')" class="flex items-center justify-center">
            <ImageIcon class="size-4" />
          </ShadcnTabsTrigger>
          <ShadcnTabsTrigger value="actions" :title="t('actions')" class="flex items-center justify-center">
            <SlidersHorizontal class="size-4" />
          </ShadcnTabsTrigger>
        </ShadcnTabsList>

        <!-- Transform Tab -->
        <ShadcnTabsContent value="transform" class="flex-1 overflow-hidden">
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
                <div class="flex items-center gap-1">
                  <button class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent active:bg-accent/70" @click="stencilStore.moveLayerDown(stencil!.id); canvas.isDirty = true">
                    <ArrowDown class="size-4" /> {{ t("layerDown") }}
                  </button>
                  <button class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent active:bg-accent/70" @click="stencilStore.moveLayerUp(stencil!.id); canvas.isDirty = true">
                    <ArrowUp class="size-4" /> {{ t("layerUp") }}
                  </button>
                </div>
              </div>
            </div>
          </ShadcnScrollArea>
        </ShadcnTabsContent>

        <!-- Image Tab (only for image stencils) -->
        <ShadcnTabsContent v-if="isImageStencil" value="image" class="flex-1 overflow-hidden">
          <ShadcnScrollArea class="h-full">
            <div class="flex flex-col gap-4 p-3">
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
        </ShadcnTabsContent>

        <!-- Actions Tab -->
        <ShadcnTabsContent value="actions" class="flex-1 overflow-hidden">
          <ShadcnScrollArea class="h-full">
            <div class="flex flex-col gap-1 p-3">
              <button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-accent" @click="exportStencilAsync(stencil)">
                <Download class="size-4" /> {{ t("export") }}
              </button>
              <button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-accent" @click="stencilStore.copySelected()">
                <Copy class="size-4" /> {{ t("copy") }}
              </button>
              <button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-accent" @click="stencilStore.togglePin(stencil!.id)">
                <component :is="stencil.pinned ? PinOff : Pin" class="size-4" />
                {{ stencil.pinned ? t("unpin") : t("pin") }}
              </button>
              <div class="my-1 h-px bg-border" />
              <button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10" @click="stencilStore.removeStencil(stencil!.id); close()">
                <Trash2 class="size-4" /> {{ t("delete") }}
              </button>
            </div>
          </ShadcnScrollArea>
        </ShadcnTabsContent>
      </ShadcnTabs>
    </template>

    <!-- ======================== -->
    <!-- MULTI STENCIL VIEW       -->
    <!-- ======================== -->
    <ShadcnScrollArea v-else-if="isMulti" class="flex-1">
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
        <button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10" @click="stencilStore.removeSelected(); close()">
          <Trash2 class="size-4" /> {{ t("deleteAll") }}
        </button>
      </div>
    </ShadcnScrollArea>
  </div>
</template>

<i18n lang="yaml">
de:
  stencil: Schablone
  stencils: Schablonen
  transform: Transform
  image: Bild
  actions: Aktionen
  shape: Form
  shapes: Formen
  rotation: Drehung
  diameter: Durchmesser
  size: Größe
  opacity: Deckkraft
  saturation: Sättigung
  brightness: Helligkeit
  contrast: Kontrast
  resetAdjustments: Zurücksetzen
  export: Als PNG exportieren
  copy: Kopieren
  copyAll: Alle kopieren
  pin: Fixieren
  unpin: Lösen
  pinAll: Alle fixieren
  unpinAll: Alle lösen
  layer: Ebene
  layerUp: Höher
  layerDown: Tiefer
  delete: Entfernen
  deleteAll: Alle entfernen
en:
  stencil: Stencil
  stencils: Stencils
  transform: Transform
  image: Image
  actions: Actions
  shape: Shape
  shapes: Shapes
  rotation: Rotation
  diameter: Diameter
  size: Size
  opacity: Opacity
  saturation: Saturation
  brightness: Brightness
  contrast: Contrast
  resetAdjustments: Reset
  export: Export as PNG
  copy: Copy
  copyAll: Copy all
  pin: Pin
  unpin: Unpin
  pinAll: Pin all
  unpinAll: Unpin all
  layerUp: Up
  layerDown: Down
  delete: Remove
  deleteAll: Remove all
</i18n>
