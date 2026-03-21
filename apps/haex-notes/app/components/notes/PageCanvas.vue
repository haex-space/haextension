<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import getStroke from "perfect-freehand";
import { renderPageTemplate, PAGE_SIZE } from "~/utils/pageTemplates";
import type { PageTemplate, StrokeData } from "~/database/schemas";

const canvasEl = useTemplateRef<HTMLCanvasElement>("canvasEl");
const notebook = useNotebookStore();
const pencilCase = usePencilCaseStore();

// Viewport (pan/zoom within the page)
const viewport = reactive({ x: 0, y: 0, zoom: 1, defaultZoom: 1 });
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });

const PEN_TYPE_TO_PRESET: Record<string, string> = {
  fineliner: "fine-tip",
  ballpoint: "ballpoint",
  pencil: "pencil",
  highlighter: "marker",
  eraser: "eraser",
};

// --- Rendering ---

function getSvgPathFromStroke(stroke: [number, number][]) {
  if (stroke.length < 2) return "";
  const d: string[] = [];
  const first = stroke[0]!;
  d.push(`M ${first[0]} ${first[1]}`);
  for (let i = 1; i < stroke.length; i++) {
    const pt = stroke[i]!;
    if (i === 1) {
      d.push(`L ${pt[0]} ${pt[1]}`);
    } else {
      const prev = stroke[i - 1]!;
      d.push(`Q ${prev[0]} ${prev[1]} ${(prev[0] + pt[0]) / 2} ${(prev[1] + pt[1]) / 2}`);
    }
  }
  d.push("Z");
  return d.join(" ");
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData) {
  const outlinePoints = getStroke(stroke.points, {
    size: stroke.size,
    thinning: stroke.tool === "eraser" ? 0 : 0.3,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
  });
  if (outlinePoints.length < 2) return;
  const pathData = getSvgPathFromStroke(outlinePoints as [number, number][]);
  if (!pathData) return;

  ctx.save();
  if (stroke.brushPreset === "marker" || stroke.brushPreset === "highlighter") {
    ctx.globalAlpha = 0.35;
  }
  ctx.fillStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
  ctx.fill(new Path2D(pathData));
  ctx.restore();
}

const render = () => {
  const el = canvasEl.value;
  if (!el) return;
  const ctx = el.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cw = el.clientWidth;
  const ch = el.clientHeight;

  if (el.width !== cw * dpr || el.height !== ch * dpr) {
    el.width = cw * dpr;
    el.height = ch * dpr;
  }

  // Clear
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#e5e7eb"; // muted background around the page
  ctx.fillRect(0, 0, el.width, el.height);

  // Apply viewport transform
  ctx.setTransform(dpr * viewport.zoom, 0, 0, dpr * viewport.zoom, dpr * viewport.x, dpr * viewport.y);

  // Draw page (white rectangle)
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.1)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillRect(0, 0, PAGE_SIZE.width, PAGE_SIZE.height);
  ctx.shadowColor = "transparent";

  // Draw page template (lines, grid, etc.)
  const page = notebook.currentPage;
  if (page) {
    renderPageTemplate(ctx, page.template as PageTemplate, PAGE_SIZE.width, PAGE_SIZE.height);

    // Draw background image if present
    if (page.backgroundImage && bgImage.value) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.drawImage(bgImage.value, 0, 0, PAGE_SIZE.width, PAGE_SIZE.height);
      ctx.restore();
    }
  }

  // Draw strokes
  for (const stroke of notebook.strokes) {
    renderStroke(ctx, stroke);
  }

  // Draw current stroke
  if (notebook.currentStroke) {
    renderStroke(ctx, notebook.currentStroke);
  }
};

// Background image cache
const bgImage = ref<HTMLImageElement | null>(null);
watch(() => notebook.currentPage?.backgroundImage, (src) => {
  if (!src) { bgImage.value = null; return; }
  const img = new Image();
  img.onload = () => { bgImage.value = img; };
  img.src = src;
}, { immediate: true });

// Render loop
let animFrameId = 0;
const startLoop = () => {
  const loop = () => { render(); animFrameId = requestAnimationFrame(loop); };
  animFrameId = requestAnimationFrame(loop);
};
onMounted(startLoop);
onUnmounted(() => cancelAnimationFrame(animFrameId));

// Center the page on mount
onMounted(() => {
  nextTick(() => {
    const el = canvasEl.value;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    // Fit page to screen, no padding
    const scaleX = cw / PAGE_SIZE.width;
    const scaleY = ch / PAGE_SIZE.height;
    viewport.zoom = Math.min(scaleX, scaleY, 1.5);
    viewport.defaultZoom = viewport.zoom;
    viewport.x = (cw - PAGE_SIZE.width * viewport.zoom) / 2;
    viewport.y = (ch - PAGE_SIZE.height * viewport.zoom) / 2;
  });
});

// --- Input handling ---

const screenToPage = (sx: number, sy: number) => ({
  x: (sx - viewport.x) / viewport.zoom,
  y: (sy - viewport.y) / viewport.zoom,
});

const getPointerPos = (e: PointerEvent) => {
  const rect = canvasEl.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
};

const onPointerDown = (e: PointerEvent) => {
  if (!canvasEl.value) return;
  canvasEl.value.setPointerCapture(e.pointerId);

  const { x, y, pressure } = getPointerPos(e);

  // Middle or right click → pan
  if (e.button === 1 || e.button === 2) {
    isPanning.value = true;
    panStart.value = { x: x - viewport.x, y: y - viewport.y };
    return;
  }

  if (e.button !== 0) return;

  const page = screenToPage(x, y);
  const slot = pencilCase.activeSlot;

  notebook.currentStroke = {
    id: crypto.randomUUID(),
    points: [[page.x, page.y, pressure]],
    color: slot.color,
    size: slot.size,
    tool: slot.type === "eraser" ? "eraser" : "brush",
    brushPreset: PEN_TYPE_TO_PRESET[slot.type] ?? "fine-tip",
  };
  notebook.isDrawing = true;
};

const onPointerMove = (e: PointerEvent) => {
  if (!canvasEl.value) return;
  const { x, y, pressure } = getPointerPos(e);

  if (isPanning.value) {
    viewport.x = x - panStart.value.x;
    viewport.y = y - panStart.value.y;
    return;
  }

  if (notebook.isDrawing && notebook.currentStroke) {
    const page = screenToPage(x, y);
    notebook.currentStroke.points.push([page.x, page.y, pressure]);
  }
};

const onPointerUp = () => {
  if (isPanning.value) {
    isPanning.value = false;
    return;
  }

  if (notebook.isDrawing && notebook.currentStroke) {
    const stroke = { ...notebook.currentStroke };
    const label = stroke.brushPreset ?? stroke.tool;
    notebook.addStroke(stroke, label);
    notebook.currentStroke = null;
    notebook.isDrawing = false;
  }
};

const onWheel = (e: WheelEvent) => {
  e.preventDefault();
  if (!canvasEl.value) return;
  const rect = canvasEl.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const oldZoom = viewport.zoom;
  const newZoom = Math.min(Math.max(oldZoom * factor, 0.3), 5);

  viewport.x = mx - (mx - viewport.x) * (newZoom / oldZoom);
  viewport.y = my - (my - viewport.y) * (newZoom / oldZoom);
  viewport.zoom = newZoom;
};

useEventListener(canvasEl, "pointerdown", onPointerDown);
useEventListener(canvasEl, "pointermove", onPointerMove);
useEventListener(canvasEl, "pointerup", onPointerUp);
useEventListener(canvasEl, "pointerleave", onPointerUp);
useEventListener(canvasEl, "contextmenu", (e: Event) => e.preventDefault());
useEventListener(canvasEl, "wheel", onWheel, { passive: false });

const resetZoom = () => {
  const el = canvasEl.value;
  if (!el) return;
  const cw = el.clientWidth;
  const ch = el.clientHeight;
  viewport.zoom = viewport.defaultZoom;
  viewport.x = (cw - PAGE_SIZE.width * viewport.zoom) / 2;
  viewport.y = (ch - PAGE_SIZE.height * viewport.zoom) / 2;
};

const zoomPercent = computed(() => Math.round((viewport.zoom / viewport.defaultZoom) * 100));

defineExpose({ viewport, resetZoom, zoomPercent });
</script>

<template>
  <canvas
    ref="canvasEl"
    class="h-full w-full touch-none"
    style="cursor: crosshair"
  />
</template>
