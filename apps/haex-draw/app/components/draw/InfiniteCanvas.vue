<script setup lang="ts">
const canvas = useCanvasStore();
const canvasEl = useTemplateRef<HTMLCanvasElement>("canvasEl");
const { startRenderLoop, stopRenderLoop } = useCanvasRenderer(canvasEl);
useCanvasInput(canvasEl);

const cursorStyle = computed(() => {
  if (canvas.activeTool === "pan") return "grab";
  if (canvas.isDrawing && canvas.activeTool === "pan") return "grabbing";
  return "crosshair";
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
