<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import getStroke from "perfect-freehand";
import { renderPageTemplate, PAGE_SIZE, getPageSize } from "~/utils/pageTemplates";
import type { PageTemplate, StrokeData, PageTable } from "~/database/schemas";

const canvasEl = useTemplateRef<HTMLCanvasElement>("canvasEl");
const notebook = useNotebookStore();
const pencilCase = usePencilCaseStore();

const pageSize = computed(() => {
  const page = notebook.currentPage;
  const orientation = (page as any)?.orientation ?? "portrait";
  return getPageSize(orientation);
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
  ctx.fillRect(0, 0, pageSize.value.width, pageSize.value.height);
  ctx.shadowColor = "transparent";

  // Draw page template (lines, grid, etc.)
  const page = notebook.currentPage;
  if (page) {
    renderPageTemplate(ctx, page.template as PageTemplate, pageSize.value.width, pageSize.value.height);

    // Draw background image if present
    if (page.backgroundImage && bgImage.value) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.drawImage(bgImage.value, 0, 0, pageSize.value.width, pageSize.value.height);
      ctx.restore();
    }
  }

  // Draw tables
  for (const table of notebook.pageTables) {
    ctx.save();
    ctx.strokeStyle = "rgba(100, 120, 150, 0.5)";
    ctx.lineWidth = 1;

    const totalW = table.columnWidths.reduce((a, b) => a + b, 0);
    const totalH = table.rowHeights.reduce((a, b) => a + b, 0);

    // Outer border
    ctx.strokeRect(table.x, table.y, totalW, totalH);

    // Column lines
    let cx = table.x;
    for (let c = 0; c < table.columns - 1; c++) {
      cx += table.columnWidths[c]!;
      ctx.beginPath();
      ctx.moveTo(cx, table.y);
      ctx.lineTo(cx, table.y + totalH);
      ctx.stroke();
    }

    // Row lines
    let cy = table.y;
    for (let r = 0; r < table.rows - 1; r++) {
      cy += table.rowHeights[r]!;
      ctx.beginPath();
      ctx.moveTo(table.x, cy);
      ctx.lineTo(table.x + totalW, cy);
      ctx.stroke();
    }

    ctx.restore();
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
  nextTick(fitPage);
});

const fitPage = () => {
  const el = canvasEl.value;
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

// Re-fit when orientation changes
watch(pageSize, () => nextTick(fitPage));

// --- Input handling ---

const screenToPage = (sx: number, sy: number) => ({
  x: (sx - viewport.x) / viewport.zoom,
  y: (sy - viewport.y) / viewport.zoom,
});

const getPointerPos = (e: PointerEvent) => {
  const rect = canvasEl.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
};

// --- Table interaction ---
const LINE_HIT_THRESHOLD = 6; // pixels in page-space

interface TableHit {
  table: PageTable;
  type: "col" | "row" | "move";
  index: number; // which col/row line (0-based, between cells)
}

const tableDrag = ref<{ hit: TableHit; startVal: number; startX: number; startY: number } | null>(null);

// Context menu state
const tableContextMenu = ref<{ table: PageTable; pageX: number; pageY: number } | null>(null);

function hitTestTableLines(px: number, py: number): TableHit | null {
  for (const table of notebook.pageTables) {
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

  // Close context menu on any click
  tableContextMenu.value = null;

  // Check table line hit first
  const hit = hitTestTableLines(page.x, page.y);
  if (hit) {
    if (hit.type === "col") {
      tableDrag.value = { hit, startVal: hit.table.columnWidths[hit.index]!, startX: page.x, startY: page.y };
    } else if (hit.type === "row") {
      tableDrag.value = { hit, startVal: hit.table.rowHeights[hit.index]!, startX: page.x, startY: page.y };
    } else if (hit.type === "move") {
      tableDrag.value = { hit, startVal: 0, startX: page.x - hit.table.x, startY: page.y - hit.table.y };
    }
    return;
  }

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

  // Table line dragging
  if (tableDrag.value) {
    const page = screenToPage(x, y);
    const { hit, startVal, startX, startY } = tableDrag.value;
    if (hit.type === "col") {
      const delta = page.x - startX;
      hit.table.columnWidths[hit.index] = Math.max(20, startVal + delta);
      notebook.isDirty = true;
    } else if (hit.type === "row") {
      const delta = page.y - startY;
      hit.table.rowHeights[hit.index] = Math.max(15, startVal + delta);
      notebook.isDirty = true;
    } else if (hit.type === "move") {
      hit.table.x = page.x - startX;
      hit.table.y = page.y - startY;
      notebook.isDirty = true;
    }
    return;
  }

  if (notebook.isDrawing && notebook.currentStroke) {
    const page = screenToPage(x, y);
    notebook.currentStroke.points.push([page.x, page.y, pressure]);
  }

  // Update cursor based on table hit
  if (!notebook.isDrawing && canvasEl.value) {
    const page = screenToPage(x, y);
    const hit = hitTestTableLines(page.x, page.y);
    if (hit?.type === "col") canvasEl.value.style.cursor = "col-resize";
    else if (hit?.type === "row") canvasEl.value.style.cursor = "row-resize";
    else if (hit?.type === "move") canvasEl.value.style.cursor = "move";
    else canvasEl.value.style.cursor = "crosshair";
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
useEventListener(canvasEl, "contextmenu", (e: MouseEvent) => {
  e.preventDefault();
  // Show table context menu on right-click
  const rect = canvasEl.value!.getBoundingClientRect();
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
useEventListener(canvasEl, "wheel", onWheel, { passive: false });

const resetZoom = () => fitPage();

const zoomPercent = computed(() => Math.round((viewport.zoom / viewport.defaultZoom) * 100));

defineExpose({ viewport, resetZoom, zoomPercent, tableContextMenu });
</script>

<template>
  <div class="relative h-full w-full">
    <canvas
      ref="canvasEl"
      class="h-full w-full touch-none"
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
