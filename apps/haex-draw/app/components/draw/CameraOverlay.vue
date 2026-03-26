<script setup lang="ts">
import { X, Camera, SwitchCamera, Check, RotateCcw } from "lucide-vue-next";

const emit = defineEmits<{
  close: [];
  capture: [dataUrl: string, width: number, height: number];
}>();

const { t } = useI18n();
const { stream, isActive, error, facingMode, startAsync, stop, switchCamera, captureAsync } = useCamera();

const videoRef = useTemplateRef<HTMLVideoElement>("videoRef");
const preview = ref<{ dataUrl: string; width: number; height: number } | null>(null);

// Start camera on mount
onMounted(() => startAsync());

// Bind stream to video element
watch(stream, (s) => {
  if (videoRef.value && s) {
    videoRef.value.srcObject = s;
  }
});

const onCapture = () => {
  if (!videoRef.value) return;
  const result = captureAsync(videoRef.value);
  if (result) {
    preview.value = result;
    stop();
  }
};

const onRetake = async () => {
  preview.value = null;
  await startAsync();
};

const onUse = () => {
  if (!preview.value) return;
  emit("capture", preview.value.dataUrl, preview.value.width, preview.value.height);
};

const onClose = () => {
  stop();
  emit("close");
};
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-black">
    <!-- Camera feed -->
    <div class="relative flex-1 overflow-hidden">
      <!-- Live video -->
      <video
        v-show="isActive && !preview"
        ref="videoRef"
        autoplay
        playsinline
        muted
        class="h-full w-full object-cover"
        :class="facingMode === 'user' ? '-scale-x-100' : ''"
      />

      <!-- Captured preview -->
      <img
        v-if="preview"
        :src="preview.dataUrl"
        class="h-full w-full object-contain"
      />

      <!-- Error state -->
      <div
        v-if="error"
        class="flex h-full w-full flex-col items-center justify-center gap-4 text-white"
      >
        <Camera class="size-16 opacity-40" />
        <p class="text-sm opacity-70">
          {{ error === 'permission-denied' ? t('permissionDenied') : t('cameraUnavailable') }}
        </p>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex items-center justify-between px-6 py-5 bg-black/90">
      <template v-if="!preview">
        <!-- Close -->
        <button
          class="flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          @click="onClose"
        >
          <X class="size-6" />
        </button>

        <!-- Capture -->
        <button
          :disabled="!isActive"
          class="flex size-18 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-all hover:bg-white/30 active:scale-90 disabled:opacity-30"
          @click="onCapture"
        >
          <div class="size-14 rounded-full bg-white" />
        </button>

        <!-- Switch camera -->
        <button
          class="flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          @click="switchCamera"
        >
          <SwitchCamera class="size-6" />
        </button>
      </template>

      <template v-else>
        <!-- Retake -->
        <button
          class="flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
          @click="onRetake"
        >
          <RotateCcw class="size-5" />
          {{ t('retake') }}
        </button>

        <div />

        <!-- Use photo -->
        <button
          class="flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          @click="onUse"
        >
          <Check class="size-5" />
          {{ t('usePhoto') }}
        </button>
      </template>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  retake: Nochmal
  usePhoto: Verwenden
  permissionDenied: Kamerazugriff wurde verweigert
  cameraUnavailable: Kamera nicht verfügbar
en:
  retake: Retake
  usePhoto: Use Photo
  permissionDenied: Camera access denied
  cameraUnavailable: Camera unavailable
</i18n>
