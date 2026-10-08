<script setup lang="ts">
import { ChevronRight } from "@lucide/vue";

const { t, locale } = useI18n();
const canvas = useCanvasStore();
const { presets, getPreset } = useBrushPresets();

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

const brushSizes = [2, 4, 8, 16, 32];
</script>

<template>
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
        <DrawBrushIcon :brush-id="canvas.activeBrushPreset" :size="24" :color="brushButtonIconColor" />
        <ChevronRight class="absolute -right-0.5 top-1/2 -translate-y-1/2 size-2.5 opacity-50" />
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
</template>

<i18n lang="yaml">
de:
  color: Farbe
  size: Größe
en:
  color: Color
  size: Size
</i18n>
