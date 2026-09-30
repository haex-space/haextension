<script setup lang="ts">
import { useEventListener, useResizeObserver } from "@vueuse/core";
import { renderPageTemplate, PAGE_SIZE } from "~/utils/pageTemplates";
import type { TableElement } from "~/types/document";
import { drawElement, drawElements } from "~/lib/render/elements";

const hostEl = useTemplateRef<HTMLDivElement>("hostEl");
const bgCanvasEl = useTemplateRef<HTMLCanvasElement>("bgCanvasEl");
const contentCanvasEl = useTemplateRef<HTMLCanvasElement>("contentCanvasEl");
const overlayCanvasEl = useTemplateRef<HTMLCanvasElement>("overlayCanvasEl");
const notebook = useNotebookStore();
const pencilCase = usePencilCaseStore();

const pageSize = computed(() => {
  const doc = notebook.currentDoc;
  return { width: doc?.width ?? PAGE_SIZE.width, height: doc?.height ?? PAGE_SIZE.height };
});

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

type Layer = "bg" | "content" | "overlay";

const dirty = new Set<Layer>(["bg", "content", "overlay"]);
let frameId = 0;

/** Markiert Ebenen als neu zu zeichnen und fordert genau einen Frame an. */
const scheduleRender = (...layers: Layer[]) => {
  for (const layer of layers) dirty.add(layer);
  if (frameId) return;
  frameId = requestAnimationFrame(() => {
    frameId = 0;
    const todo = new Set(dirty);
    dirty.clear();
    if (todo.has("bg")) renderBackground();
    if (todo.has("content")) renderContent();
    if (todo.has("overlay")) renderOverlay();
  });
};

onUnmounted(() => {
  if (frameId) cancelAnimationFrame(frameId);
});

/** Setzt Canvas-Größe und Viewport-Transform, gibt den vorbereiteten Kontext zurück. */
function prepare(el: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!el) return null;
  const ctx = el.getContext("2d");
  if (!ctx) return null;

  const dpr = window.devicePixelRatio || 1;
  const cw = el.clientWidth;
  const ch = el.clientHeight;
  if (el.width !== cw * dpr || el.height !== ch * dpr) {
    el.width = cw * dpr;
    el.height = ch * dpr;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.setTransform(
    dpr * viewport.zoom, 0,
    0, dpr * viewport.zoom,
    dpr * viewport.x, dpr * viewport.y,
  );
  return ctx;
}

function renderBackground() {
  const el = bgCanvasEl.value;
  const ctx = prepare(el);
  if (!ctx || !el) return;

  // Grauer Rand — außerhalb der Viewport-Transform, deckt den ganzen Canvas ab.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, el.width, el.height);
  ctx.restore();

  const doc = notebook.currentDoc;
  if (!doc) return;

  // Papierrechteck
  ctx.fillStyle = doc.background.paperColor;
  ctx.shadowColor = "rgba(0,0,0,0.1)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillRect(0, 0, pageSize.value.width, pageSize.value.height);
  ctx.shadowColor = "transparent";

  renderPageTemplate(ctx, doc.background.template, pageSize.value.width, pageSize.value.height);

  const overlay = doc.background.overlay;
  if (overlay?.type === "image" && bgImage.value) {
    ctx.save();
    ctx.globalAlpha = overlay.opacity;
    ctx.drawImage(bgImage.value, 0, 0, pageSize.value.width, pageSize.value.height);
    ctx.restore();
  }
}

function renderContent() {
  const ctx = prepare(contentCanvasEl.value);
  if (!ctx) return;
  drawElements(ctx, notebook.visibleElements);
}

function renderOverlay() {
  const ctx = prepare(overlayCanvasEl.value);
  if (!ctx) return;
  if (notebook.currentStroke) drawElement(ctx, notebook.currentStroke);
}

// Background image cache
const bgImage = ref<HTMLImageElement | null>(null);
watch(
  () => {
    const overlay = notebook.currentDoc?.background.overlay;
    return overlay?.type === "image" && overlay.source.kind === "inline" ? overlay.source.dataUrl : null;
  },
  (src) => {
    if (!src) { bgImage.value = null; return; }
    const img = new Image();
    img.onload = () => { bgImage.value = img; scheduleRender("bg"); };
    img.src = src;
  },
  { immediate: true },
);

// --- Auslöser ---

watch(() => notebook.currentDoc?.background, () => scheduleRender("bg"), { deep: true });
watch(() => notebook.visibleElements, () => scheduleRender("content"), { deep: true });
watch(() => [viewport.x, viewport.y, viewport.zoom], () => scheduleRender("bg", "content", "overlay"));
watch(pageSize, () => nextTick(() => { fitPage(); scheduleRender("bg", "content", "overlay"); }));
useResizeObserver(hostEl, () => scheduleRender("bg", "content", "overlay"));
onMounted(() => { nextTick(() => { fitPage(); scheduleRender("bg", "content", "overlay"); }); });

const fitPage = () => {
  const el = overlayCanvasEl.value;
  if (!el) return;
  const cw = el.clientWidth;
  const ch = el.clientHeight;
  const scaleX = cw / pageSize.value.width;
  const scaleY = ch / pageSize.value.height;
  viewport.zoom = Math.min(scaleX, scaleY, 1.5);
  viewport.defaultZoom = viewport.zoom;
  viewport.x = (cw - pageSize.value.width * viewport.zoom) / 2;
  viewport.y = (ch - pageSize.value.height * viewport.zoom) / 2;
};

// --- Input handling ---

const screenToPage = (sx: number, sy: number) => ({
  x: (sx - viewport.x) / viewport.zoom,
  y: (sy - viewport.y) / viewport.zoom,
});

const getPointerPos = (e: PointerEvent) => {
  const rect = overlayCanvasEl.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
};

// --- Table interaction ---
const LINE_HIT_THRESHOLD = 6; // pixels in page-space

interface TableHit {
  table: TableElement;
  type: "col" | "row" | "move";
  index: number; // which col/row line (0-based, between cells)
}

const tableDrag = ref<{ hit: TableHit; startVal: number; startX: number; startY: number; gestureId: string } | null>(null);

// Context menu state
const tableContextMenu = ref<{ table: TableElement; pageX: number; pageY: number } | null>(null);

function hitTestTableLines(px: number, py: number): TableHit | null {
  for (const table of notebook.tableElements) {
    const totalW = table.columnWidths.reduce((a, b) => a + b, 0);
    const totalH = table.rowHeights.reduce((a, b) => a + b, 0);

    // Check if inside table bounds (with margin)
    if (px < table.x - LINE_HIT_THRESHOLD || px > table.x + totalW + LINE_HIT_THRESHOLD) continue;
    if (py < table.y - LINE_HIT_THRESHOLD || py > table.y + totalH + LINE_HIT_THRESHOLD) continue;

    // Check column lines (including right edge = last column)
    let cx = table.x;
    for (let c = 0; c < table.columns; c++) {
      cx += table.columnWidths[c]!;
      if (Math.abs(px - cx) < LINE_HIT_THRESHOLD && py >= table.y - LINE_HIT_THRESHOLD && py <= table.y + totalH + LINE_HIT_THRESHOLD) {
        return { table, type: "col", index: c };
      }
    }

    // Check row lines (including bottom edge = last row)
    let cy = table.y;
    for (let r = 0; r < table.rows; r++) {
      cy += table.rowHeights[r]!;
      if (Math.abs(py - cy) < LINE_HIT_THRESHOLD && px >= table.x - LINE_HIT_THRESHOLD && px <= table.x + totalW + LINE_HIT_THRESHOLD) {
        return { table, type: "row", index: r };
      }
    }

    // Check left edge and top edge for move
    const onLeft = Math.abs(px - table.x) < LINE_HIT_THRESHOLD && py >= table.y && py <= table.y + totalH;
    const onTop = Math.abs(py - table.y) < LINE_HIT_THRESHOLD && px >= table.x && px <= table.x + totalW;
    if (onLeft || onTop) {
      return { table, type: "move", index: 0 };
    }
  }
  return null;
}

const onPointerDown = (e: PointerEvent) => {
  if (!overlayCanvasEl.value) return;
  overlayCanvasEl.value.setPointerCapture(e.pointerId);

  const { x, y, pressure } = getPointerPos(e);

  // Middle or right click → pan
  if (e.button === 1 || e.button === 2) {
    isPanning.value = true;
    panStart.value = { x: x - viewport.x, y: y - viewport.y };
    return;
  }

  if (e.button !== 0) return;

  const page = screenToPage(x, y);

  // Close context menu on any click
  tableContextMenu.value = null;

  // Check table line hit first
  const hit = hitTestTableLines(page.x, page.y);
  if (hit) {
    const gestureId = String(e.pointerId);
    if (hit.type === "col") {
      tableDrag.value = { hit, startVal: hit.table.columnWidths[hit.index]!, startX: page.x, startY: page.y, gestureId };
    } else if (hit.type === "row") {
      tableDrag.value = { hit, startVal: hit.table.rowHeights[hit.index]!, startX: page.x, startY: page.y, gestureId };
    } else if (hit.type === "move") {
      tableDrag.value = { hit, startVal: 0, startX: page.x - hit.table.x, startY: page.y - hit.table.y, gestureId };
    }
    return;
  }

  const slot = pencilCase.activeSlot;

  notebook.currentStroke = {
    id: crypto.randomUUID(),
    type: "stroke",
    points: [[page.x, page.y, pressure]],
    color: slot.color,
    size: slot.size,
    tool: slot.type === "eraser" ? "eraser" : "brush",
    brushPreset: PEN_TYPE_TO_PRESET[slot.type] ?? "fine-tip",
    bbox: [0, 0, 0, 0],
  };
  notebook.isDrawing = true;
};

const onPointerMove = (e: PointerEvent) => {
  if (!overlayCanvasEl.value) return;
  const { x, y, pressure } = getPointerPos(e);

  if (isPanning.value) {
    viewport.x = x - panStart.value.x;
    viewport.y = y - panStart.value.y;
    return;
  }

  // Table line dragging
  if (tableDrag.value) {
    const page = screenToPage(x, y);
    const { hit, startVal, startX, startY, gestureId } = tableDrag.value;
    if (hit.type === "col") {
      const next = Math.max(20, startVal + (page.x - startX));
      notebook.resizeTable(hit.table.id, gestureId, (t) => { t.columnWidths[hit.index] = next; });
    } else if (hit.type === "row") {
      const next = Math.max(15, startVal + (page.y - startY));
      notebook.resizeTable(hit.table.id, gestureId, (t) => { t.rowHeights[hit.index] = next; });
    } else if (hit.type === "move") {
      const nx = page.x - startX;
      const ny = page.y - startY;
      notebook.resizeTable(hit.table.id, gestureId, (t) => { t.x = nx; t.y = ny; });
    }
    return;
  }

  if (notebook.isDrawing && notebook.currentStroke) {
    const page = screenToPage(x, y);
    notebook.currentStroke.points.push([page.x, page.y, pressure]);
    scheduleRender("overlay");
  }

  // Update cursor based on table hit
  if (!notebook.isDrawing && overlayCanvasEl.value) {
    const page = screenToPage(x, y);
    const hit = hitTestTableLines(page.x, page.y);
    if (hit?.type === "col") overlayCanvasEl.value.style.cursor = "col-resize";
    else if (hit?.type === "row") overlayCanvasEl.value.style.cursor = "row-resize";
    else if (hit?.type === "move") overlayCanvasEl.value.style.cursor = "move";
    else overlayCanvasEl.value.style.cursor = "crosshair";
  }
};

const onPointerUp = () => {
  if (isPanning.value) {
    isPanning.value = false;
    return;
  }

  if (tableDrag.value) {
    tableDrag.value = null;
    return;
  }

  if (notebook.isDrawing && notebook.currentStroke) {
    const stroke = { ...notebook.currentStroke };
    const label = stroke.brushPreset ?? stroke.tool;
    notebook.addStroke(stroke, label);
    notebook.currentStroke = null;
    notebook.isDrawing = false;
    scheduleRender("content", "overlay");
  }
};

const onWheel = (e: WheelEvent) => {
  e.preventDefault();
  if (!overlayCanvasEl.value) return;
  const rect = overlayCanvasEl.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const oldZoom = viewport.zoom;
  const newZoom = Math.min(Math.max(oldZoom * factor, 0.3), 5);

  viewport.x = mx - (mx - viewport.x) * (newZoom / oldZoom);
  viewport.y = my - (my - viewport.y) * (newZoom / oldZoom);
  viewport.zoom = newZoom;
};

useEventListener(overlayCanvasEl, "pointerdown", onPointerDown);
useEventListener(overlayCanvasEl, "pointermove", onPointerMove);
useEventListener(overlayCanvasEl, "pointerup", onPointerUp);
useEventListener(overlayCanvasEl, "pointerleave", onPointerUp);
useEventListener(overlayCanvasEl, "contextmenu", (e: MouseEvent) => {
  e.preventDefault();
  // Show table context menu on right-click
  const rect = overlayCanvasEl.value!.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const page = screenToPage(sx, sy);
  const hit = hitTestTableLines(page.x, page.y);
  if (hit) {
    tableContextMenu.value = { table: hit.table, pageX: e.clientX, pageY: e.clientY };
  } else {
    tableContextMenu.value = null;
  }
});
useEventListener(overlayCanvasEl, "wheel", onWheel, { passive: false });

const resetZoom = () => fitPage();

const zoomPercent = computed(() => Math.round((viewport.zoom / viewport.defaultZoom) * 100));

defineExpose({ viewport, resetZoom, zoomPercent, tableContextMenu });
</script>

<template>
  <div ref="hostEl" class="relative h-full w-full">
    <canvas ref="bgCanvasEl" class="absolute inset-0 h-full w-full" />
    <canvas ref="contentCanvasEl" class="absolute inset-0 h-full w-full" />
    <canvas
      ref="overlayCanvasEl"
      class="absolute inset-0 h-full w-full touch-none"
      style="cursor: crosshair"
    />

    <!-- Table context menu -->
    <div
      v-if="tableContextMenu"
      class="fixed z-50 min-w-40 rounded-lg border border-border bg-popover p-1 shadow-xl"
      :style="{ left: `${tableContextMenu.pageX}px`, top: `${tableContextMenu.pageY}px` }"
    >
      <button
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
        @click="notebook.addTableRow(tableContextMenu!.table.id); tableContextMenu = null"
      >
        Zeile hinzufügen
      </button>
      <button
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
        @click="notebook.addTableColumn(tableContextMenu!.table.id); tableContextMenu = null"
      >
        Spalte hinzufügen
      </button>
      <div class="my-1 h-px bg-border" />
      <button
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
        :class="tableContextMenu!.table.rows <= 1 ? 'opacity-30 pointer-events-none' : ''"
        @click="notebook.removeTableRow(tableContextMenu!.table.id); tableContextMenu = null"
      >
        Zeile entfernen
      </button>
      <button
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
        :class="tableContextMenu!.table.columns <= 1 ? 'opacity-30 pointer-events-none' : ''"
        @click="notebook.removeTableColumn(tableContextMenu!.table.id); tableContextMenu = null"
      >
        Spalte entfernen
      </button>
      <div class="my-1 h-px bg-border" />
      <button
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
        @click="notebook.removeTable(tableContextMenu!.table.id); tableContextMenu = null"
      >
        Tabelle löschen
      </button>
    </div>
  </div>
</template>
