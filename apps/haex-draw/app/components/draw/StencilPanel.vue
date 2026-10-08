<script setup lang="ts">
import {
  Download,
  Trash2,
  Pin,
  PinOff,
  X,
  Frame,
  Copy,
  SlidersHorizontal,
  Move,
  ImageIcon,
} from "@lucide/vue";
import type { Stencil } from "~/types/stencil";

const { t, locale } = useI18n();
const canvas = useCanvasStore();
const stencilStore = useStencilStore();
const { exportStencilAsync } = useStencilExport();

const isMulti = computed(() => stencilStore.selectedIds.size > 1);
const selectionCount = computed(() => stencilStore.selectedIds.size);

const stencil = computed<Stencil | null>(() => {
  if (!stencilStore.selectedId) return null;
  return stencilStore.getStencil(stencilStore.selectedId) ?? null;
});

const isImageStencil = computed(() => stencil.value?.shapeType === "image");
const isCropping = ref(false);

function onCropApply(imageData: string, cropWidth: number, cropHeight: number) {
  const s = stencil.value;
  if (!s) return;

  // Scale crop pixel dimensions to stencil world dimensions
  // The image may have been scaled when placed on the canvas
  const img = new Image();
  img.src = s.imageData!;
  const imgNaturalWidth = img.naturalWidth || s.width;
  const imgNaturalHeight = img.naturalHeight || s.height;
  const scaleX = s.width / imgNaturalWidth;
  const scaleY = s.height / imgNaturalHeight;

  s.imageData = imageData;
  s.width = cropWidth * scaleX;
  s.height = cropHeight * scaleY;
  canvas.isDirty = true;
  isCropping.value = false;
}

const activeTab = ref("transform");

// Reset tab when selection changes away from image
watch(isImageStencil, (isImage) => {
  if (!isImage && activeTab.value === "image") {
    activeTab.value = "transform";
  }
});

const close = () => {
  stencilStore.clearSelection();
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
          <DrawStencilTransformTab :stencil="stencil" />
        </ShadcnTabsContent>

        <!-- Image Tab (only for image stencils) -->
        <ShadcnTabsContent v-if="isImageStencil" value="image" class="flex-1 overflow-hidden">
          <!-- Crop mode -->
          <DrawStencilImageTab :stencil="stencil" @crop="isCropping = true" />
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
    <DrawStencilMultiPanel v-else-if="isMulti" @close="close" />
  </div>

  <!-- Crop Dialog -->
  <DrawStencilCrop
    v-if="stencil"
    v-model:open="isCropping"
    :stencil="stencil"
    @apply="onCropApply"
  />
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
  export: Als PNG exportieren
  copy: Kopieren
  pin: Fixieren
  unpin: Lösen
  delete: Entfernen
en:
  stencil: Stencil
  stencils: Stencils
  transform: Transform
  image: Image
  actions: Actions
  shape: Shape
  shapes: Shapes
  export: Export as PNG
  copy: Copy
  pin: Pin
  unpin: Unpin
  delete: Remove
</i18n>
