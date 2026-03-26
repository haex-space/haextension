<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import type { ImageEntry } from "~/composables/useImageGallery";

const props = defineProps<{
  image: ImageEntry;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  select: [image: ImageEntry];
  visible: [];
}>();

const el = useTemplateRef<HTMLElement>("el");
const hasBeenVisible = ref(false);

onMounted(() => {
  if (!el.value) return;

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !hasBeenVisible.value) {
        hasBeenVisible.value = true;
        emit("visible");
        observer.disconnect();
      }
    },
    { rootMargin: "0px 200px" }, // Preload 200px before visible
  );

  observer.observe(el.value);
  onUnmounted(() => observer.disconnect());
});
</script>

<template>
  <button
    ref="el"
    class="group relative size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted transition-all hover:border-primary hover:ring-2 hover:ring-primary/30"
    :disabled="isLoading"
    @click="emit('select', image)"
  >
    <!-- Thumbnail image -->
    <img
      v-if="image.thumbnail"
      :src="image.thumbnail"
      :alt="image.name"
      class="h-full w-full object-cover"
    />

    <!-- Skeleton while thumbnail loads -->
    <div
      v-else
      class="flex h-full w-full items-center justify-center bg-muted"
    >
      <div class="size-6 rounded bg-muted-foreground/10 animate-pulse" />
    </div>

    <!-- Loading overlay when selecting -->
    <div
      v-if="isLoading"
      class="absolute inset-0 flex items-center justify-center bg-background/60"
    >
      <Loader2 class="size-5 animate-spin text-primary" />
    </div>

    <!-- Filename tooltip on hover -->
    <div class="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-1 py-0.5 text-center text-[10px] text-white transition-transform group-hover:translate-y-0">
      {{ image.name }}
    </div>
  </button>
</template>
