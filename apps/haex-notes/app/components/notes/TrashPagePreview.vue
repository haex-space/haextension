<script setup lang="ts">
import type { SelectPage } from "~/database/schemas";
import { renderPageTemplate } from "~/utils/pageTemplates";
import { drawElements } from "~/lib/render/elements";
import { migratePageRow } from "~/lib/migratePage";

const props = defineProps<{
  page: SelectPage;
}>();

const canvasEl = useTemplateRef<HTMLCanvasElement>("previewCanvas");

const doc = computed(() => migratePageRow(props.page));

const render = () => {
  const el = canvasEl.value;
  if (!el) return;
  const ctx = el.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cw = el.clientWidth;
  const ch = el.clientHeight;
  el.width = cw * dpr;
  el.height = ch * dpr;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, el.width, el.height);

  const { background, width, height } = doc.value;
  const scaleX = cw / width;
  const scaleY = ch / height;
  const scale = Math.min(scaleX, scaleY);

  ctx.setTransform(
    dpr * scale, 0, 0, dpr * scale,
    dpr * (cw - width * scale) / 2,
    dpr * (ch - height * scale) / 2,
  );

  ctx.fillStyle = background.paperColor;
  ctx.fillRect(0, 0, width, height);

  renderPageTemplate(ctx, background.template, width, height);

  drawElements(ctx, doc.value.layers.filter((l) => l.visible).flatMap((l) => l.elements));
};

onMounted(() => nextTick(render));
watch(() => props.page, () => nextTick(render));
</script>

<template>
  <canvas ref="previewCanvas" class="h-full w-full" />
</template>
