<script setup lang="ts">
import type { Component } from "vue";
import {
  ChevronRight,
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
} from "@lucide/vue";
import { bytesToDataUrl, imageMimeType } from "~/utils/image/dataUrl";
import { localized } from "~/utils/localized";

const { t, locale } = useI18n();
const canvas = useCanvasStore();
const stencilStore = useStencilStore();
const { dinPresets, geometricPresets, socialPresets, adsPresets, screenPresets } = useStencilPresets();

const stencilShapeIcons: Record<string, Component> = {
  rectangle: RectangleHorizontal,
  circle: Circle,
  star: Star,
  triangle: Triangle,
  heart: Heart,
  hexagon: Hexagon,
};

const { importSvgAsync } = useSvgImport();

const importFile = async () => {
  try {
    const haexVault = useHaexVaultStore();
    const client = haexVault.client;
    if (!client) return;

    const paths = await client.filesystem.selectFile({
      title: t("importFile"),
      filters: [[t("imageFilter"), ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]]],
      multiple: false,
    });

    if (!paths || paths.length === 0) return;
    const filePath = paths[0]!;
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const fileName = filePath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Import";

    // SVG → custom stencil
    if (ext === "svg") {
      const result = await importSvgAsync(filePath);
      if (!result) return;
      const center = canvas.viewportCenter;
      stencilStore.addCustomStencil(result.svgPath, result.viewBox, result.name, center.x, center.y);
      stencilPopoverOpen.value = false;
      return;
    }

    // Image → image stencil
    const data = await client.filesystem.readFile(filePath);
    const dataUrl = bytesToDataUrl(data, imageMimeType(filePath));

    const img = new Image();
    img.onload = () => {
      const center = canvas.viewportCenter;
      stencilStore.addImageStencil(dataUrl, img.naturalWidth, img.naturalHeight, fileName, center.x, center.y);
      stencilPopoverOpen.value = false;
    };
    img.src = dataUrl;
  } catch (e) {
    console.error("[haex-draw] importFile error:", e);
  }
};

const stencilPopoverOpen = ref(false);


const placeStencil = (presetId: string) => {
  const center = canvas.viewportCenter;
  stencilStore.addStencil(presetId, center.x, center.y);
  canvas.lastStencilPreset = presetId;
  canvas.activeTool = "stencil";
  stencilPopoverOpen.value = false;
};
</script>

<template>
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
        <Frame class="size-6" />
        <ChevronRight class="absolute -right-0.5 top-1/2 -translate-y-1/2 size-2.5 opacity-50" />
      </button>
    </ShadcnDropdownMenuTrigger>
    <ShadcnDropdownMenuContent side="right" align="start" :side-offset="8" class="min-w-44">
      <ShadcnDropdownMenuSub>
        <ShadcnDropdownMenuSubTrigger>
          <RectangleHorizontal class="mr-2 size-4" /> DIN
        </ShadcnDropdownMenuSubTrigger>
        <ShadcnDropdownMenuSubContent>
          <ShadcnDropdownMenuItem v-for="preset in dinPresets" :key="preset.id" @click="placeStencil(preset.id)">
            {{ localized(preset.i18n, locale) }}
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
            {{ localized(preset.i18n, locale) }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuSubContent>
      </ShadcnDropdownMenuSub>
      <ShadcnDropdownMenuSub>
        <ShadcnDropdownMenuSubTrigger>
          <Share2 class="mr-2 size-4" /> {{ t("socialMedia") }}
        </ShadcnDropdownMenuSubTrigger>
        <ShadcnDropdownMenuSubContent>
          <ShadcnDropdownMenuItem v-for="preset in socialPresets" :key="preset.id" @click="placeStencil(preset.id)">
            {{ localized(preset.i18n, locale) }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuSubContent>
      </ShadcnDropdownMenuSub>
      <ShadcnDropdownMenuSub>
        <ShadcnDropdownMenuSubTrigger>
          <Megaphone class="mr-2 size-4" /> {{ t("digitalAds") }}
        </ShadcnDropdownMenuSubTrigger>
        <ShadcnDropdownMenuSubContent>
          <ShadcnDropdownMenuItem v-for="preset in adsPresets" :key="preset.id" @click="placeStencil(preset.id)">
            {{ localized(preset.i18n, locale) }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuSubContent>
      </ShadcnDropdownMenuSub>
      <ShadcnDropdownMenuSub>
        <ShadcnDropdownMenuSubTrigger>
          <Monitor class="mr-2 size-4" /> {{ t("screens") }}
        </ShadcnDropdownMenuSubTrigger>
        <ShadcnDropdownMenuSubContent>
          <ShadcnDropdownMenuItem v-for="preset in screenPresets" :key="preset.id" @click="placeStencil(preset.id)">
            {{ localized(preset.i18n, locale) }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuSubContent>
      </ShadcnDropdownMenuSub>
      <ShadcnDropdownMenuSeparator />
      <ShadcnDropdownMenuItem @click="importFile">
        <FileUp class="mr-2 size-4" /> {{ t("importFile") }}
      </ShadcnDropdownMenuItem>
    </ShadcnDropdownMenuContent>
  </ShadcnDropdownMenu>
</template>

<i18n lang="yaml">
de:
  stencils: Schablonen
  shapes: Formen
  socialMedia: Soziale Medien
  digitalAds: Digitale Werbung
  screens: Bildschirmgrößen
  importFile: Datei importieren
  imageFilter: Bilder & SVG
en:
  stencils: Stencils
  shapes: Shapes
  socialMedia: Social Media
  digitalAds: Digital Ads
  screens: Screen Sizes
  importFile: Import File
  imageFilter: Images & SVG
</i18n>
