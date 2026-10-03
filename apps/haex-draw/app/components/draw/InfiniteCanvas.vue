<script setup lang="ts">
const canvas = useCanvasStore();
const canvasEl = useTemplateRef<HTMLCanvasElement>("canvasEl");
const { startRenderLoop, stopRenderLoop } = useCanvasRenderer(canvasEl);
const { isPanning } = useCanvasInput(canvasEl);

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
