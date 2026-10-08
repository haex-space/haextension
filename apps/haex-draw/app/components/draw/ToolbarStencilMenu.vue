<script setup lang="ts">
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

const { t, locale } = useI18n();
const canvas = useCanvasStore();
const stencilStore = useStencilStore();
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

const importFile = async () => {
  try {
    const haexVault = useHaexVaultStore();
    const client = haexVault.client;
    if (!client) return;

    const paths = await client.filesystem.selectFile({
      title: locale.value === "de" ? "Datei importieren" : "Import File",
      filters: [["Bilder & SVG", ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]]],
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
      const center = getViewportCenter();
      stencilStore.addCustomStencil(result.svgPath, result.width, result.height, result.name, center.x, center.y);
      stencilPopoverOpen.value = false;
      return;
    }

    // Image → image stencil
    const data = await client.filesystem.readFile(filePath);
    const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" };
    const mime = mimeMap[ext] ?? "image/png";

    let binary = "";
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]!);
    }
    const dataUrl = `data:${mime};base64,${btoa(binary)}`;

    const img = new Image();
    img.onload = () => {
      const center = getViewportCenter();
      stencilStore.addImageStencil(dataUrl, img.naturalWidth, img.naturalHeight, fileName, center.x, center.y);
      stencilPopoverOpen.value = false;
    };
    img.src = dataUrl;
  } catch (e) {
    console.error("[haex-draw] importFile error:", e);
  }
};

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


const placeStencil = (presetId: string) => {
  const center = getViewportCenter();
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
en:
  stencils: Stencils
  shapes: Shapes
  socialMedia: Social Media
  digitalAds: Digital Ads
  screens: Screen Sizes
  importFile: Import File
</i18n>
