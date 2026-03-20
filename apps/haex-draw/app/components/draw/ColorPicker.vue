<script setup lang="ts">
import { Plus, Check, Trash2, X } from "lucide-vue-next";

const { t } = useI18n();
const paletteStore = usePaletteStore();

const model = defineModel<string>({ required: true });

// Palette UI state
const showNewPalette = ref(false);
const newPaletteName = ref("");
const renamingId = ref<string | null>(null);
const renameValue = ref("");

const createPalette = async () => {
  if (!newPaletteName.value.trim()) return;
  await paletteStore.createAsync(newPaletteName.value.trim());
  newPaletteName.value = "";
  showNewPalette.value = false;
};

const addCurrentColor = async (paletteId: string) => {
  await paletteStore.addColorAsync(paletteId, model.value);
};

const startRename = (id: string, name: string) => {
  renamingId.value = id;
  renameValue.value = name;
};

const confirmRename = async () => {
  if (renamingId.value && renameValue.value.trim()) {
    await paletteStore.renameAsync(renamingId.value, renameValue.value.trim());
  }
  renamingId.value = null;
};

// Long-press for touch devices (delete palette color)
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressTriggered = false;

const onSwatchPointerDown = (paletteId: string, idx: number) => {
  longPressTriggered = false;
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    paletteStore.removeColorAsync(paletteId, idx);
  }, 500);
};

const onSwatchPointerUp = () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
};

const onSwatchClick = (color: string) => {
  if (longPressTriggered) return;
  model.value = color;
};

// HSV state derived from the hex color
const hue = ref(0);
const saturation = ref(100);
const brightness = ref(0);
const opacity = ref(100);

// Parse hex to HSV on mount and when model changes externally
const hexToHsv = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  return { h, s, v };
};

const hsvToHex = (h: number, s: number, v: number) => {
  s /= 100;
  v /= 100;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Sync model → HSV
const syncFromModel = () => {
  if (!model.value) return;
  const { h, s, v } = hexToHsv(model.value);
  hue.value = h;
  saturation.value = s;
  brightness.value = v;
};

// Sync HSV → model
const updateColor = () => {
  model.value = hsvToHex(hue.value, saturation.value, brightness.value);
};

onMounted(syncFromModel);
watch(model, syncFromModel);

// Saturation-Brightness field interaction
const sbFieldEl = ref<HTMLElement | null>(null);
const isDraggingSB = ref(false);

const updateSB = (e: MouseEvent | TouchEvent) => {
  if (!sbFieldEl.value) return;
  const rect = sbFieldEl.value.getBoundingClientRect();
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  saturation.value = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  brightness.value = Math.max(0, Math.min(100, 100 - ((clientY - rect.top) / rect.height) * 100));
  updateColor();
};

const onSBDown = (e: MouseEvent | TouchEvent) => {
  isDraggingSB.value = true;
  updateSB(e);
};

// Hue slider interaction
const hueSliderEl = ref<HTMLElement | null>(null);
const isDraggingHue = ref(false);

const updateHue = (e: MouseEvent | TouchEvent) => {
  if (!hueSliderEl.value) return;
  const rect = hueSliderEl.value.getBoundingClientRect();
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  hue.value = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
  updateColor();
};

const onHueDown = (e: MouseEvent | TouchEvent) => {
  isDraggingHue.value = true;
  updateHue(e);
};

// Opacity slider interaction
const opacitySliderEl = ref<HTMLElement | null>(null);
const isDraggingOpacity = ref(false);

const updateOpacity = (e: MouseEvent | TouchEvent) => {
  if (!opacitySliderEl.value) return;
  const rect = opacitySliderEl.value.getBoundingClientRect();
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  opacity.value = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
};

const onOpacityDown = (e: MouseEvent | TouchEvent) => {
  isDraggingOpacity.value = true;
  updateOpacity(e);
};

// Global mouse/touch move/up
const onGlobalMove = (e: MouseEvent | TouchEvent) => {
  if (isDraggingSB.value) updateSB(e);
  if (isDraggingHue.value) updateHue(e);
  if (isDraggingOpacity.value) updateOpacity(e);
};

const onGlobalUp = () => {
  isDraggingSB.value = false;
  isDraggingHue.value = false;
  isDraggingOpacity.value = false;
};

onMounted(() => {
  window.addEventListener("mousemove", onGlobalMove);
  window.addEventListener("mouseup", onGlobalUp);
  window.addEventListener("touchmove", onGlobalMove);
  window.addEventListener("touchend", onGlobalUp);
});

onUnmounted(() => {
  window.removeEventListener("mousemove", onGlobalMove);
  window.removeEventListener("mouseup", onGlobalUp);
  window.removeEventListener("touchmove", onGlobalMove);
  window.removeEventListener("touchend", onGlobalUp);
});

// Hex input
const hexInput = ref("");
watch(model, (v) => { hexInput.value = v; }, { immediate: true });

const onHexInput = () => {
  const val = hexInput.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    model.value = val;
  }
};

// Hue color for the SB field background
const hueColor = computed(() => hsvToHex(hue.value, 100, 100));

// Preset swatches
const presetColors = [
  "#000000", "#ffffff", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
  "#1e293b", "#fef3c7", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#9ca3af",
];
</script>

<template>
  <div class="flex w-full flex-col gap-2.5">
    <!-- Saturation / Brightness field -->
    <div
      ref="sbFieldEl"
      class="relative h-36 cursor-crosshair rounded-lg"
      :style="{ backgroundColor: hueColor }"
      @mousedown.prevent="onSBDown"
      @touchstart.prevent="onSBDown"
    >
      <!-- White gradient (left to right) -->
      <div class="absolute inset-0 rounded-lg" style="background: linear-gradient(to right, white, transparent)" />
      <!-- Black gradient (top to bottom) -->
      <div class="absolute inset-0 rounded-lg" style="background: linear-gradient(to bottom, transparent, black)" />
      <!-- Cursor -->
      <div
        class="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
        :style="{
          left: `${saturation}%`,
          top: `${100 - brightness}%`,
        }"
      />
    </div>

    <!-- Hue slider -->
    <div
      ref="hueSliderEl"
      class="relative h-3.5 cursor-pointer rounded-full"
      style="background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
      @mousedown.prevent="onHueDown"
      @touchstart.prevent="onHueDown"
    >
      <div
        class="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
        :style="{ left: `${(hue / 360) * 100}%`, backgroundColor: hueColor }"
      />
    </div>

    <!-- Opacity slider -->
    <div
      ref="opacitySliderEl"
      class="relative h-3.5 cursor-pointer rounded-full"
      :style="{
        background: `linear-gradient(to right, transparent, ${model})`,
        backgroundImage: `linear-gradient(to right, transparent, ${model}), repeating-conic-gradient(#d4d4d4 0% 25%, white 0% 50%) 0 0 / 8px 8px`,
      }"
      @mousedown.prevent="onOpacityDown"
      @touchstart.prevent="onOpacityDown"
    >
      <div
        class="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
        :style="{ left: `${opacity}%`, backgroundColor: model }"
      />
    </div>

    <!-- Hex input + preview -->
    <div class="flex items-center gap-2">
      <div
        class="size-8 shrink-0 rounded-md border border-border shadow-sm"
        :style="{ backgroundColor: model }"
      />
      <input
        v-model="hexInput"
        class="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        maxlength="7"
        @change="onHexInput"
      />
    </div>

    <!-- Preset swatches -->
    <div class="grid grid-cols-10 gap-1">
      <button
        v-for="color in presetColors"
        :key="color"
        class="size-5 rounded border transition-transform hover:scale-125"
        :class="model === color ? 'border-primary ring-1 ring-primary/40' : 'border-border/50'"
        :style="{ backgroundColor: color }"
        @click="model = color"
      />
    </div>

    <!-- Saved Palettes -->
    <div v-if="paletteStore.isLoaded" class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {{ t("palettes") }}
        </span>
        <button
          class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          :title="t('newPalette')"
          @click="showNewPalette = !showNewPalette"
        >
          <Plus class="size-5" />
        </button>
      </div>

      <!-- New palette input -->
      <div v-if="showNewPalette" class="flex gap-1.5">
        <input
          v-model="newPaletteName"
          class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          :placeholder="t('paletteName')"
          @keydown.enter="createPalette"
        />
        <div class="flex shrink-0 items-center gap-0.5">
          <button class="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground" @click="createPalette">
            <Check class="size-4" />
          </button>
          <button class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" @click="showNewPalette = false">
            <X class="size-4" />
          </button>
        </div>
      </div>

      <!-- Palette list -->
      <div v-for="palette in paletteStore.items" :key="palette.id" class="flex flex-col gap-1.5">
        <div class="flex items-center gap-1">
          <!-- Editable name -->
          <input
            :value="palette.name"
            class="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-sm text-foreground hover:border-input focus:border-input focus:bg-background focus:outline-none"
            @change="paletteStore.renameAsync(palette.id, ($event.target as HTMLInputElement).value)"
          />

          <!-- Actions -->
          <div class="flex shrink-0 items-center">
            <button
              class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              :title="t('addColor')"
              @click="addCurrentColor(palette.id)"
            >
              <Plus class="size-5" />
            </button>
            <button
              class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
              @click="paletteStore.deleteAsync(palette.id)"
            >
              <Trash2 class="size-5" />
            </button>
          </div>
        </div>

        <!-- Color swatches -->
        <div v-if="palette.colors.length > 0" class="grid grid-cols-10 gap-1">
          <button
            v-for="(color, idx) in palette.colors"
            :key="idx"
            class="size-5 rounded border transition-transform hover:scale-125"
            :class="model === color ? 'border-primary ring-1 ring-primary/40' : 'border-border/50'"
            :style="{ backgroundColor: color }"
            @click="onSwatchClick(color)"
            @pointerdown="onSwatchPointerDown(palette.id, idx)"
            @pointerup="onSwatchPointerUp"
            @pointerleave="onSwatchPointerUp"
            @contextmenu.prevent="paletteStore.removeColorAsync(palette.id, idx)"
          />
        </div>
        <div v-else class="text-[10px] italic text-muted-foreground">
          {{ t("emptyPalette") }}
        </div>
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  palettes: Paletten
  newPalette: Neue Palette
  paletteName: Palette-Name
  addColor: Farbe hinzufügen
  emptyPalette: Noch keine Farben
en:
  palettes: Palettes
  newPalette: New Palette
  paletteName: Palette name
  addColor: Add color
  emptyPalette: No colors yet
</i18n>
