<script setup lang="ts">
import getStroke from "perfect-freehand";
import { renderPageTemplate, PAGE_SIZE } from "~/utils/pageTemplates";
import type { PageTemplate, SelectPage, StrokeData } from "~/database/schemas";

const props = defineProps<{
  page: SelectPage;
}>();

const canvasEl = useTemplateRef<HTMLCanvasElement>("previewCanvas");

function getSvgPathFromStroke(stroke: [number, number][]) {
  if (stroke.length < 2) return "";
  const d: string[] = [];
  const first = stroke[0]!;
  d.push(`M ${first[0]} ${first[1]}`);
  for (let i = 1; i < stroke.length; i++) {
    const pt = stroke[i]!;
    if (i === 1) d.push(`L ${pt[0]} ${pt[1]}`);
    else {
      const prev = stroke[i - 1]!;
      d.push(`Q ${prev[0]} ${prev[1]} ${(prev[0] + pt[0]) / 2} ${(prev[1] + pt[1]) / 2}`);
    }
  }
  d.push("Z");
  return d.join(" ");
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData) {
  const outlinePoints = getStroke(stroke.points, {
    size: stroke.size, thinning: 0.3, smoothing: 0.5, streamline: 0.5, simulatePressure: true,
  });
  if (outlinePoints.length < 2) return;
  const pathData = getSvgPathFromStroke(outlinePoints as [number, number][]);
  if (!pathData) return;
  ctx.fillStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
  ctx.fill(new Path2D(pathData));
}

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

  const scaleX = cw / PAGE_SIZE.width;
  const scaleY = ch / PAGE_SIZE.height;
  const scale = Math.min(scaleX, scaleY);

  ctx.setTransform(
    dpr * scale, 0, 0, dpr * scale,
    dpr * (cw - PAGE_SIZE.width * scale) / 2,
    dpr * (ch - PAGE_SIZE.height * scale) / 2,
  );

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_SIZE.width, PAGE_SIZE.height);

  renderPageTemplate(ctx, props.page.template as PageTemplate, PAGE_SIZE.width, PAGE_SIZE.height);

  if (props.page.strokes) {
    for (const stroke of props.page.strokes) {
      renderStroke(ctx, stroke);
    }
  }
};

onMounted(() => nextTick(render));
watch(() => props.page, () => nextTick(render));
</script>

<template>
  <canvas ref="previewCanvas" class="h-full w-full" />
</template>
