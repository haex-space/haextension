<script setup lang="ts">
import { X, Loader2, ImageOff } from "lucide-vue-next";

const emit = defineEmits<{
  close: [];
  select: [dataUrl: string, width: number, height: number, name: string];
}>();

const { t } = useI18n();
const { images, isScanning, scanAsync, loadThumbnailAsync, loadFullImageAsync } = useImageGallery();
const loadingPath = ref<string | null>(null);

onMounted(() => scanAsync());

const onSelect = async (image: { path: string; name: string }) => {
  loadingPath.value = image.path;
  const result = await loadFullImageAsync(image.path);
  loadingPath.value = null;
  if (result) {
    const name = image.name.replace(/\.[^.]+$/, "");
    emit("select", result.dataUrl, result.width, result.height, name);
  }
};
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-border bg-background/95 backdrop-blur-sm">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-muted-foreground">
          {{ t('gallery') }}
        </span>
        <span v-if="!isScanning && images.length > 0" class="text-xs text-muted-foreground/60">
          {{ images.length }} {{ t('images') }}
        </span>
        <Loader2 v-if="isScanning" class="size-3.5 animate-spin text-muted-foreground" />
      </div>
      <button
        class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        @click="emit('close')"
      >
        <X class="size-4" />
      </button>
    </div>

    <!-- Thumbnail strip -->
    <div class="overflow-x-auto overflow-y-hidden px-3 pb-3">
      <div v-if="!isScanning && images.length === 0" class="flex h-20 items-center justify-center gap-2 text-muted-foreground/50">
        <ImageOff class="size-5" />
        <span class="text-xs">{{ t('noImages') }}</span>
      </div>

      <div v-else class="flex gap-2" style="min-width: min-content;">
        <DrawGalleryThumbnail
          v-for="image in images"
          :key="image.path"
          :image="image"
          :is-loading="loadingPath === image.path"
          @select="onSelect"
          @visible="loadThumbnailAsync(image.path)"
        />
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  gallery: Galerie
  images: Bilder
  noImages: Keine Bilder gefunden
en:
  gallery: Gallery
  images: images
  noImages: No images found
</i18n>
