<script setup lang="ts">
import {
  Hand,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Save,
  ChevronRight,
  History,
  Frame,
  FileUp,
  RectangleHorizontal,
  Share2,
  Megaphone,
  Monitor,
  Circle,
  Star,
  Triangle,
  Heart,
  Hexagon,
} from "lucide-vue-next";
import type { Tool } from "~/types";

defineProps<{
  historyVisible: boolean;
}>();

const emit = defineEmits<{
  save: [];
  exportPng: [];
  toggleHistory: [];
}>();

const { t, locale } = useI18n();
const canvas = useCanvasStore();
const stencilStore = useStencilStore();
const { presets, getPreset } = useBrushPresets();
const { dinPresets, geometricPresets, socialPresets, adsPresets, screenPresets } = useStencilPresets();

const stencilShapeIcons: Record<string, any> = {
  rectangle: RectangleHorizontal,
  circle: Circle,
  star: Star,
  triangle: Triangle,
  heart: Heart,
  hexagon: Hexagon,
};

const { importSvgAsync } = useSvgImport();
const stencilPopoverOpen = ref(false);

const getViewportCenter = () => {
  const { x: panX, y: panY, zoom } = canvas.viewport;
  const el = document.querySelector("canvas");
  const w = el?.clientWidth ?? 800;
  const h = el?.clientHeight ?? 600;
  return {
    x: (w / 2 - panX) / zoom,
    y: (h / 2 - panY) / zoom,
  };
};

const importSvgStencil = async () => {
  const result = await importSvgAsync();
  if (!result) return;
  const center = getViewportCenter();
  stencilStore.addCustomStencil(result.svgPath, result.width, result.height, result.name, center.x, center.y);
  stencilPopoverOpen.value = false;
};

const placeStencil = (presetId: string) => {
  const center = getViewportCenter();
  stencilStore.addStencil(presetId, center.x, center.y);
  canvas.lastStencilPreset = presetId;
  canvas.activeTool = "stencil";
  stencilPopoverOpen.value = false;
};

const activePreset = computed(() => getPreset(canvas.activeBrushPreset));
const activePresetLabel = computed(() =>
  locale.value === "de" ? activePreset.value.i18n.de : activePreset.value.i18n.en
);

const selectPreset = (id: string) => {
  canvas.activeBrushPreset = id;
  canvas.activeTool = "brush";
};

/** Returns true if color is light (needs dark icon/text for contrast) */
const isLightColor = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Perceived luminance formula
  return (r * 0.299 + g * 0.587 + b * 0.114) > 150;
};

const brushButtonIconColor = computed(() => {
  if (canvas.activeTool !== "brush") return undefined;
  return isLightColor(canvas.brushColor) ? "#000000" : "#ffffff";
});

const tipLabels: Record<string, { de: string; en: string }> = {
  round: { de: "Rund", en: "Round" },
  flat: { de: "Flach", en: "Flat" },
  chisel: { de: "Keil", en: "Chisel" },
};

const activeTipLabel = computed(() => {
  const tip = tipLabels[canvas.brushTip];
  return locale.value === "de" ? tip?.de : tip?.en;
});

const tools: { id: Tool; icon: any; label: string; shortcut: string }[] = [
  { id: "pan", icon: Hand, label: "pan", shortcut: "H" },
];

const brushSizes = [2, 4, 8, 16, 32];
</script>

<template>
  <!-- Vertical left toolbar -->
  <div class="flex shrink-0">
    <div class="flex flex-col items-center gap-0.5 border-r border-border bg-background px-1 py-2">
      <!-- Unified Brush Menu: Preset + Tip + Size + Color -->
      <ShadcnDropdownMenu>
        <ShadcnDropdownMenuTrigger as-child>
          <button
            class="relative flex items-center justify-center rounded-lg p-2 transition-colors"
            :class="canvas.activeTool !== 'brush'
              ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              : ''"
            :style="canvas.activeTool === 'brush' ? { backgroundColor: canvas.brushColor } : {}"
            :title="`${activePresetLabel} (B)`"
            @click.exact="canvas.activeTool = 'brush'"
          >
            <DrawBrushIcon :brush-id="canvas.activeBrushPreset" :size="20" :color="brushButtonIconColor" />
            <ChevronRight class="absolute -right-0.5 bottom-0.5 size-2.5 opacity-50" />
          </button>
        </ShadcnDropdownMenuTrigger>
        <ShadcnDropdownMenuContent side="right" align="start" :side-offset="8" class="w-56 p-0">
          <!-- Brush Preset Sub -->
          <ShadcnDropdownMenuSub>
            <ShadcnDropdownMenuSubTrigger class="px-3 py-2.5">
              <DrawBrushIcon :brush-id="canvas.activeBrushPreset" :size="20" class="mr-2" />
              {{ activePresetLabel }}
            </ShadcnDropdownMenuSubTrigger>
            <ShadcnDropdownMenuSubContent>
              <ShadcnDropdownMenuItem
                v-for="preset in presets"
                :key="preset.id"
                :class="canvas.activeBrushPreset === preset.id ? 'bg-primary text-primary-foreground' : ''"
                @click="selectPreset(preset.id)"
              >
                <DrawBrushIcon :brush-id="preset.id" :size="20" class="mr-2" />
                {{ locale === 'de' ? preset.i18n.de : preset.i18n.en }}
              </ShadcnDropdownMenuItem>
            </ShadcnDropdownMenuSubContent>
          </ShadcnDropdownMenuSub>

          <!-- Brush Tip Sub -->
          <ShadcnDropdownMenuSub>
            <ShadcnDropdownMenuSubTrigger class="px-3 py-2.5">
              <svg width="20" height="20" viewBox="0 0 20 20" class="mr-2 text-current">
                <ellipse v-if="canvas.brushTip === 'round'" cx="10" cy="10" rx="5" ry="5" fill="currentColor" />
                <ellipse v-else-if="canvas.brushTip === 'flat'" cx="10" cy="10" rx="7" ry="2.5" fill="currentColor" />
                <polygon v-else points="10,3 17,14 3,14" fill="currentColor" />
              </svg>
              {{ activeTipLabel }}
            </ShadcnDropdownMenuSubTrigger>
            <ShadcnDropdownMenuSubContent>
              <ShadcnDropdownMenuItem
                v-for="tip in (['round', 'flat', 'chisel'] as const)"
                :key="tip"
                :class="canvas.brushTip === tip ? 'bg-primary text-primary-foreground' : ''"
                @click="canvas.brushTip = tip"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" class="mr-2 text-current">
                  <ellipse v-if="tip === 'round'" cx="10" cy="10" rx="5" ry="5" fill="currentColor" />
                  <ellipse v-else-if="tip === 'flat'" cx="10" cy="10" rx="7" ry="2.5" fill="currentColor" />
                  <polygon v-else points="10,3 17,14 3,14" fill="currentColor" />
                </svg>
                {{ locale === 'de' ? tipLabels[tip]?.de : tipLabels[tip]?.en }}
              </ShadcnDropdownMenuItem>
            </ShadcnDropdownMenuSubContent>
          </ShadcnDropdownMenuSub>

          <ShadcnDropdownMenuSeparator />

          <!-- Size (inline, not a sub-menu) -->
          <div class="px-3 py-2.5" @click.stop @pointerdown.stop>
            <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {{ t("size") }}
            </div>
            <div class="flex items-center gap-2">
              <input
                type="range"
                :min="1"
                :max="64"
                :value="canvas.brushSize"
                class="flex-1"
                @input="canvas.brushSize = Number(($event.target as HTMLInputElement).value)"
              />
              <span class="w-6 text-right text-xs tabular-nums text-muted-foreground">{{ canvas.brushSize }}</span>
            </div>
            <div class="mt-1.5 flex items-center gap-1">
              <button
                v-for="size in brushSizes"
                :key="size"
                class="flex size-7 items-center justify-center rounded-md transition-colors"
                :class="canvas.brushSize === size ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'"
                @click="canvas.brushSize = size"
              >
                <div
                  class="rounded-full"
                  :class="canvas.brushSize === size ? 'bg-primary-foreground' : 'bg-foreground'"
                  :style="{ width: `${Math.min(size, 16)}px`, height: `${Math.min(size, 16)}px` }"
                />
              </button>
            </div>
          </div>

          <ShadcnDropdownMenuSeparator />

          <!-- Color (inline, not a sub-menu) -->
          <div class="p-3" @click.stop @pointerdown.stop>
            <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {{ t("color") }}
            </div>
            <DrawColorPicker v-model="canvas.brushColor" />
          </div>
        </ShadcnDropdownMenuContent>
      </ShadcnDropdownMenu>

      <!-- Other Tools (Eraser, Pan) -->
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="rounded-lg p-2 transition-colors"
        :class="canvas.activeTool === tool.id
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
        :title="`${t(tool.label)} (${tool.shortcut})`"
        @click="canvas.activeTool = tool.id"
      >
        <component :is="tool.icon" class="size-5" />
      </button>

      <!-- Separator -->
      <div class="my-1 h-px w-6 bg-border" />

      <!-- Stencils -->
      <ShadcnDropdownMenu v-model:open="stencilPopoverOpen">
        <ShadcnDropdownMenuTrigger as-child>
          <button
            class="relative flex items-center justify-center rounded-lg p-2 transition-colors"
            :class="canvas.activeTool === 'stencil'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
            :title="t('stencils')"
            @click.exact="canvas.lastStencilPreset ? canvas.activeTool = 'stencil' : null"
          >
            <Frame class="size-5" />
            <ChevronRight class="absolute -right-0.5 bottom-0.5 size-2.5 opacity-50" />
          </button>
        </ShadcnDropdownMenuTrigger>
        <ShadcnDropdownMenuContent side="right" align="start" :side-offset="8" class="min-w-44">
          <ShadcnDropdownMenuSub>
            <ShadcnDropdownMenuSubTrigger>
              <RectangleHorizontal class="mr-2 size-4" /> DIN
            </ShadcnDropdownMenuSubTrigger>
            <ShadcnDropdownMenuSubContent>
              <ShadcnDropdownMenuItem v-for="preset in dinPresets" :key="preset.id" @click="placeStencil(preset.id)">
                {{ locale === 'de' ? preset.i18n.de : preset.i18n.en }}
              </ShadcnDropdownMenuItem>
            </ShadcnDropdownMenuSubContent>
          </ShadcnDropdownMenuSub>
          <ShadcnDropdownMenuSub>
            <ShadcnDropdownMenuSubTrigger>
              <Star class="mr-2 size-4" /> {{ t("shapes") }}
            </ShadcnDropdownMenuSubTrigger>
            <ShadcnDropdownMenuSubContent>
              <ShadcnDropdownMenuItem v-for="preset in geometricPresets" :key="preset.id" @click="placeStencil(preset.id)">
                <component :is="stencilShapeIcons[preset.shapeType] ?? Frame" class="mr-2 size-4" />
                {{ locale === 'de' ? preset.i18n.de : preset.i18n.en }}
              </ShadcnDropdownMenuItem>
            </ShadcnDropdownMenuSubContent>
          </ShadcnDropdownMenuSub>
          <ShadcnDropdownMenuSub>
            <ShadcnDropdownMenuSubTrigger>
              <Share2 class="mr-2 size-4" /> {{ t("socialMedia") }}
            </ShadcnDropdownMenuSubTrigger>
            <ShadcnDropdownMenuSubContent>
              <ShadcnDropdownMenuItem v-for="preset in socialPresets" :key="preset.id" @click="placeStencil(preset.id)">
                {{ locale === 'de' ? preset.i18n.de : preset.i18n.en }}
              </ShadcnDropdownMenuItem>
            </ShadcnDropdownMenuSubContent>
          </ShadcnDropdownMenuSub>
          <ShadcnDropdownMenuSub>
            <ShadcnDropdownMenuSubTrigger>
              <Megaphone class="mr-2 size-4" /> {{ t("digitalAds") }}
            </ShadcnDropdownMenuSubTrigger>
            <ShadcnDropdownMenuSubContent>
              <ShadcnDropdownMenuItem v-for="preset in adsPresets" :key="preset.id" @click="placeStencil(preset.id)">
                {{ locale === 'de' ? preset.i18n.de : preset.i18n.en }}
              </ShadcnDropdownMenuItem>
            </ShadcnDropdownMenuSubContent>
          </ShadcnDropdownMenuSub>
          <ShadcnDropdownMenuSub>
            <ShadcnDropdownMenuSubTrigger>
              <Monitor class="mr-2 size-4" /> {{ t("screens") }}
            </ShadcnDropdownMenuSubTrigger>
            <ShadcnDropdownMenuSubContent>
              <ShadcnDropdownMenuItem v-for="preset in screenPresets" :key="preset.id" @click="placeStencil(preset.id)">
                {{ locale === 'de' ? preset.i18n.de : preset.i18n.en }}
              </ShadcnDropdownMenuItem>
            </ShadcnDropdownMenuSubContent>
          </ShadcnDropdownMenuSub>
          <ShadcnDropdownMenuSeparator />
          <ShadcnDropdownMenuItem @click="importSvgStencil">
            <FileUp class="mr-2 size-4" /> {{ t("importSvg") }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuContent>
      </ShadcnDropdownMenu>

      <!-- Separator -->
      <div class="my-1 h-px w-6 bg-border" />

      <!-- Undo / Redo / History -->
      <button
        class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
        :title="`${t('undo')} (Ctrl+Z)`"
        :disabled="!canvas.canUndo"
        @click="canvas.undo()"
      >
        <Undo2 class="size-5" />
      </button>
      <button
        class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
        :title="`${t('redo')} (Ctrl+Y)`"
        :disabled="!canvas.canRedo"
        @click="canvas.redo()"
      >
        <Redo2 class="size-5" />
      </button>
      <button
        class="rounded-lg p-2 transition-colors"
        :class="historyVisible
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
        :title="t('history')"
        @click="emit('toggleHistory')"
      >
        <History class="size-5" />
      </button>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Actions at bottom -->
      <button
        class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        :title="t('save')"
        @click="emit('save')"
      >
        <Save class="size-5" />
      </button>
      <button
        class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        :title="t('exportPng')"
        @click="emit('exportPng')"
      >
        <Download class="size-5" />
      </button>
      <button
        class="rounded-lg p-2 text-destructive transition-colors hover:bg-destructive/10"
        :title="t('clear')"
        @click="canvas.clear()"
      >
        <Trash2 class="size-5" />
      </button>
    </div>
  </div>

</template>

<i18n lang="yaml">
de:
  brushPreset: Stift
  tip: Spitze
  eraser: Radierer
  pan: Verschieben
  color: Farbe
  size: Größe
  stencils: Schablonen
  shapes: Formen
  socialMedia: Soziale Medien
  digitalAds: Digitale Werbung
  screens: Bildschirmgrößen
  importSvg: SVG importieren
  undo: Rückgängig
  redo: Wiederherstellen
  history: Verlauf
  save: Speichern
  exportPng: Als PNG exportieren
  clear: Alles löschen
en:
  brushPreset: Brush
  tip: Tip
  eraser: Eraser
  pan: Pan
  color: Color
  size: Size
  stencils: Stencils
  shapes: Shapes
  socialMedia: Social Media
  digitalAds: Digital Ads
  screens: Screen Sizes
  importSvg: Import SVG
  undo: Undo
  redo: Redo
  history: History
  save: Save
  exportPng: Export as PNG
  clear: Clear all
</i18n>
