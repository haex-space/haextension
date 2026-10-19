<script setup lang="ts">
import { useElementSize } from "@vueuse/core";

const canvas = useCanvasStore();
const canvasEl = useTemplateRef<HTMLCanvasElement>("canvasEl");
const { startRenderLoop, stopRenderLoop } = useCanvasRenderer(canvasEl);
const { isPanning } = useCanvasInput(canvasEl);

const { width, height } = useElementSize(canvasEl);
watchEffect(() => {
  canvas.viewSize = { width: width.value, height: height.value };
});

const cursorStyle = computed(() => {
  if (isPanning.value) return "grabbing";
  return canvas.activeTool === "pan" ? "grab" : "crosshair";
});

onMounted(() => startRenderLoop());
onUnmounted(() => stopRenderLoop());
</script>

<template>
  <canvas
    ref="canvasEl"
    class="h-full w-full touch-none"
    :style="{ cursor: cursorStyle }"
  />
</template>
