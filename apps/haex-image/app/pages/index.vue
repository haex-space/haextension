<script setup lang="ts">
import {
  ImagePlus, Undo2, Redo2, Download, Crop, RotateCw, RotateCcw,
  FlipHorizontal2, FlipVertical2, Maximize2, SlidersHorizontal,
  Sparkles, X, Check, Lock, Unlock, Save, Menu,
} from "lucide-vue-next";
import type { FilterType, AspectRatioPreset } from "~/types";

const { t } = useI18n();
const haexVault = useHaexVaultStore();
const editor = useEditorStore();
const processor = useImageProcessor();

const canvasRef = useTemplateRef<HTMLCanvasElement>("canvasRef");
const containerRef = useTemplateRef<HTMLDivElement>("containerRef");

// Crop state
const isCropping = ref(false);
const cropStart = ref<{ x: number; y: number } | null>(null);
const cropDragging = ref(false);

const toolButtons = computed(() => [
  { id: "crop", icon: Crop, label: t("crop") },
  { id: "rotate", icon: RotateCw, label: t("rotate") },
  { id: "resize", icon: Maximize2, label: t("resize") },
  { id: "adjust", icon: SlidersHorizontal, label: t("adjust") },
  { id: "filter", icon: Sparkles, label: t("filter") },
]);

function selectTool(id: string) {
  editor.activeTool = editor.activeTool === id ? null : id as any;
}

// Free rotation
const freeRotationDeg = ref(0);
async function applyFreeRotation() {
  if (freeRotationDeg.value === 0) return;
  await processor.applyRotate(freeRotationDeg.value);
  freeRotationDeg.value = 0;
  nextTick(render);
}

// Preview state for adjustments
const previewAdjustments = ref({ brightness: 0, contrast: 0, saturation: 0 });

const aspectPresets: AspectRatioPreset[] = [
  { id: "free", label: "Frei", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

const filterPresets: { id: FilterType; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "grayscale", label: "Graustufen" },
  { id: "sepia", label: "Sepia" },
  { id: "invert", label: "Invertieren" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Kühl" },
  { id: "vintage", label: "Vintage" },
];

onMounted(async () => {
  await haexVault.initializeAsync();
});

// Render image to canvas
const renderScale = ref(1);

function render() {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container || !editor.imageDataUrl) return;

  const img = new Image();
  img.onload = () => {
    // Fit image to container
    const maxW = container.clientWidth - 32;
    const maxH = container.clientHeight - 32;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    renderScale.value = scale;

    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Apply preview adjustments via pixel manipulation
    if (editor.activeTool === "adjust") {
      const adj = previewAdjustments.value;
      if (adj.brightness !== 0 || adj.contrast !== 0 || adj.saturation !== 0) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        const br = adj.brightness * 2.55; // -255 to 255
        const co = 1 + adj.contrast / 100;
        const sat = 1 + adj.saturation / 100;
        for (let i = 0; i < d.length; i += 4) {
          // Brightness
          let r = d[i] + br, g = d[i + 1] + br, b = d[i + 2] + br;
          // Contrast
          r = ((r / 255 - 0.5) * co + 0.5) * 255;
          g = ((g / 255 - 0.5) * co + 0.5) * 255;
          b = ((b / 255 - 0.5) * co + 0.5) * 255;
          // Saturation
          const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = gray + (r - gray) * sat;
          g = gray + (g - gray) * sat;
          b = gray + (b - gray) * sat;
          d[i] = Math.max(0, Math.min(255, r));
          d[i + 1] = Math.max(0, Math.min(255, g));
          d[i + 2] = Math.max(0, Math.min(255, b));
        }
        ctx.putImageData(imageData, 0, 0);
      }
    }

    // Apply preview filter via pixel manipulation
    if (editor.activeTool === "filter" && editor.activeFilter !== "none") {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      const f = editor.activeFilter;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        if (f === "grayscale") {
          const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = g = b = gray;
        } else if (f === "sepia") {
          const tr = r * 0.393 + g * 0.769 + b * 0.189;
          const tg = r * 0.349 + g * 0.686 + b * 0.168;
          const tb = r * 0.272 + g * 0.534 + b * 0.131;
          r = tr; g = tg; b = tb;
        } else if (f === "invert") {
          r = 255 - r; g = 255 - g; b = 255 - b;
        } else if (f === "warm") {
          r = Math.min(255, r * 1.1 + 10); g = g; b = Math.max(0, b * 0.9 - 5);
        } else if (f === "cool") {
          r = Math.max(0, r * 0.9 - 5); g = g; b = Math.min(255, b * 1.1 + 10);
        } else if (f === "vintage") {
          const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = gray * 0.6 + r * 0.4 + 20;
          g = gray * 0.5 + g * 0.5 + 5;
          b = gray * 0.6 + b * 0.4 - 10;
          r *= 0.95; g *= 0.9; b *= 0.85;
        }
        d[i] = Math.max(0, Math.min(255, r));
        d[i + 1] = Math.max(0, Math.min(255, g));
        d[i + 2] = Math.max(0, Math.min(255, b));
      }
      ctx.putImageData(imageData, 0, 0);
    }

    // Draw crop overlay
    if (editor.activeTool === "crop" && editor.cropRect.width > 0 && editor.cropRect.height > 0) {
      const r = editor.cropRect;
      const sx = r.x * scale, sy = r.y * scale;
      const sw = r.width * scale, sh = r.height * scale;

      // Darken outside crop
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, canvas.width, sy);
      ctx.fillRect(0, sy, sx, sh);
      ctx.fillRect(sx + sw, sy, canvas.width - sx - sw, sh);
      ctx.fillRect(0, sy + sh, canvas.width, canvas.height - sy - sh);

      // Crop border
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);

      // Rule of thirds
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + (sw * i) / 3, sy);
        ctx.lineTo(sx + (sw * i) / 3, sy + sh);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx, sy + (sh * i) / 3);
        ctx.lineTo(sx + sw, sy + (sh * i) / 3);
        ctx.stroke();
      }

      // Resize handles
      const hs = 6;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      const handles = [
        [sx, sy], [sx + sw / 2, sy], [sx + sw, sy],
        [sx, sy + sh / 2], [sx + sw, sy + sh / 2],
        [sx, sy + sh], [sx + sw / 2, sy + sh], [sx + sw, sy + sh],
      ];
      for (const [hx, hy] of handles) {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
    }
  };
  img.src = editor.imageDataUrl;
}

watch(() => editor.imageDataUrl, render);
watch(() => editor.activeTool, (newTool, oldTool) => {
  // Reset filter preview when leaving filter tool without applying
  if (oldTool === "filter" && newTool !== "filter") {
    editor.activeFilter = "none";
  }
  // Reset adjustment preview when leaving adjust tool without applying
  if (oldTool === "adjust" && newTool !== "adjust") {
    previewAdjustments.value = { brightness: 0, contrast: 0, saturation: 0 };
  }
  render();
});
watch(() => editor.cropRect, render, { deep: true });
watch(() => editor.activeFilter, render);
watch(previewAdjustments, render, { deep: true });
onMounted(() => {
  if (containerRef.value) {
    const obs = new ResizeObserver(render);
    obs.observe(containerRef.value);
    onUnmounted(() => obs.disconnect());
  }
});

// File open
async function openFile() {
  const client = haexVault.client;
  if (!client) return;
  try {
    const paths = await client.filesystem.selectFile({
      title: t("openImage"),
      filters: [["Bilder", ["png", "jpg", "jpeg", "webp", "bmp", "gif"]]],
      multiple: false,
    });
    if (!paths || paths.length === 0) return;
    const filePath = paths[0]!;
    const name = filePath.split("/").pop() || "image";

    const data = await client.filesystem.readFile(filePath);
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "png";
    const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" };
    const mime = mimeMap[ext] ?? "image/png";

    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      editor.loadImage(img, name);
      URL.revokeObjectURL(url);
      nextTick(render);
    };
    img.src = url;
  } catch (e) {
    console.error("[haex-image] openFile error:", e);
  }
}

// Crop interaction
type CropEdge = "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";
const cropMode = ref<"draw" | "move" | "resize">("draw");
const cropResizeEdge = ref<CropEdge>("br");
const cropMoveOffset = ref({ x: 0, y: 0 });
const cropHoverTarget = ref<"inside" | CropEdge | null>(null);

const HANDLE_SIZE = 12; // hit area in image pixels (scaled by renderScale)

const cursorMap: Record<string, string> = {
  tl: "cursor-nwse-resize", tr: "cursor-nesw-resize",
  bl: "cursor-nesw-resize", br: "cursor-nwse-resize",
  t: "cursor-ns-resize", b: "cursor-ns-resize",
  l: "cursor-ew-resize", r: "cursor-ew-resize",
  inside: "cursor-move",
};
const cropCursor = computed(() => {
  if (cropHoverTarget.value) return cursorMap[cropHoverTarget.value] || "cursor-crosshair";
  return "cursor-crosshair";
});

function hitTestCropEdge(px: number, py: number): CropEdge | "inside" | null {
  const r = editor.cropRect;
  if (r.width <= 0 || r.height <= 0) return null;

  const hs = HANDLE_SIZE / renderScale.value;
  const left = r.x, right = r.x + r.width, top = r.y, bottom = r.y + r.height;

  // Corner handles (priority)
  if (Math.abs(px - left) < hs && Math.abs(py - top) < hs) return "tl";
  if (Math.abs(px - right) < hs && Math.abs(py - top) < hs) return "tr";
  if (Math.abs(px - left) < hs && Math.abs(py - bottom) < hs) return "bl";
  if (Math.abs(px - right) < hs && Math.abs(py - bottom) < hs) return "br";

  // Edge handles
  if (Math.abs(py - top) < hs && px > left + hs && px < right - hs) return "t";
  if (Math.abs(py - bottom) < hs && px > left + hs && px < right - hs) return "b";
  if (Math.abs(px - left) < hs && py > top + hs && py < bottom - hs) return "l";
  if (Math.abs(px - right) < hs && py > top + hs && py < bottom - hs) return "r";

  // Inside
  if (px >= left && px <= right && py >= top && py <= bottom) return "inside";
  return null;
}

function onCanvasPointerDown(e: PointerEvent) {
  if (editor.activeTool !== "crop") return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / renderScale.value;
  const y = (e.clientY - rect.top) / renderScale.value;

  const hit = hitTestCropEdge(x, y);
  if (hit && hit !== "inside") {
    cropMode.value = "resize";
    cropResizeEdge.value = hit;
  } else if (hit === "inside") {
    cropMode.value = "move";
    cropMoveOffset.value = { x: x - editor.cropRect.x, y: y - editor.cropRect.y };
  } else {
    cropMode.value = "draw";
    cropStart.value = { x, y };
    editor.cropRect = { x, y, width: 0, height: 0 };
  }

  cropDragging.value = true;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
}

function onCanvasPointerMove(e: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  let x = (e.clientX - rect.left) / renderScale.value;
  let y = (e.clientY - rect.top) / renderScale.value;

  // Hover cursor when not dragging
  if (!cropDragging.value && editor.activeTool === "crop") {
    cropHoverTarget.value = hitTestCropEdge(x, y);
    return;
  }
  if (!cropDragging.value) return;

  x = Math.max(0, Math.min(editor.imageWidth, x));
  y = Math.max(0, Math.min(editor.imageHeight, y));

  if (cropMode.value === "move") {
    let nx = x - cropMoveOffset.value.x;
    let ny = y - cropMoveOffset.value.y;
    nx = Math.max(0, Math.min(editor.imageWidth - editor.cropRect.width, nx));
    ny = Math.max(0, Math.min(editor.imageHeight - editor.cropRect.height, ny));
    editor.cropRect = { ...editor.cropRect, x: Math.round(nx), y: Math.round(ny) };
  } else if (cropMode.value === "resize") {
    const r = { ...editor.cropRect };
    const edge = cropResizeEdge.value;

    if (edge.includes("l")) { const newX = Math.min(x, r.x + r.width - 1); r.width += r.x - newX; r.x = newX; }
    if (edge.includes("r")) { r.width = Math.max(1, x - r.x); }
    if (edge.includes("t")) { const newY = Math.min(y, r.y + r.height - 1); r.height += r.y - newY; r.y = newY; }
    if (edge.includes("b")) { r.height = Math.max(1, y - r.y); }

    if (editor.cropAspectRatio) {
      const ratio = editor.cropAspectRatio;
      if (edge === "t" || edge === "b") { r.width = r.height * ratio; }
      else if (edge === "l" || edge === "r") { r.height = r.width / ratio; }
      else if (r.width / r.height > ratio) { r.width = r.height * ratio; }
      else { r.height = r.width / ratio; }
    }

    editor.cropRect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  } else {
    if (!cropStart.value) return;
    const sx = cropStart.value.x;
    const sy = cropStart.value.y;
    let cw = Math.abs(x - sx);
    let ch = Math.abs(y - sy);

    if (editor.cropAspectRatio) {
      const ratio = editor.cropAspectRatio;
      if (cw / ch > ratio) { cw = ch * ratio; }
      else { ch = cw / ratio; }
    }

    const cx = x < sx ? sx - cw : sx;
    const cy = y < sy ? sy - ch : sy;
    editor.cropRect = { x: Math.round(cx), y: Math.round(cy), width: Math.round(cw), height: Math.round(ch) };
  }
}

function onCanvasPointerUp() {
  cropDragging.value = false;
}

async function confirmCrop() {
  if (editor.cropRect.width > 0 && editor.cropRect.height > 0) {
    await processor.applyCrop(editor.cropRect);
    editor.cropRect = { x: 0, y: 0, width: 0, height: 0 };
  }
}

// Resize
function onResizeWidthChange(w: number) {
  editor.resizeWidth = w;
  if (editor.resizeLockAspect) {
    editor.resizeHeight = Math.round(w / (editor.imageWidth / editor.imageHeight));
  }
}
function onResizeHeightChange(h: number) {
  editor.resizeHeight = h;
  if (editor.resizeLockAspect) {
    editor.resizeWidth = Math.round(h * (editor.imageWidth / editor.imageHeight));
  }
}

async function confirmResize() {
  await processor.applyResize(editor.resizeWidth, editor.resizeHeight);
}

// Adjustments
async function confirmAdjustments() {
  await processor.applyAdjustments({ ...previewAdjustments.value });
  previewAdjustments.value = { brightness: 0, contrast: 0, saturation: 0 };
}

function resetAdjustments() {
  previewAdjustments.value = { brightness: 0, contrast: 0, saturation: 0 };
  editor.activeTool = null;
  render();
}

// Filter
async function confirmFilter() {
  await processor.applyFilter(editor.activeFilter);
}

// Export
const showSaveMenu = ref(false);

async function saveAs() {
  const client = haexVault.client;
  if (!client || !editor.imageDataUrl) return;
  try {
    const ext = editor.fileName.split(".").pop()?.toLowerCase();
    const format = ext === "jpg" || ext === "jpeg" ? "jpeg" : "png";
    const blob = await processor.exportImage(format as "png" | "jpeg");
    const buffer = await blob.arrayBuffer();
    await client.filesystem.saveFileAsync(new Uint8Array(buffer), {
      title: t("saveAs"),
      defaultPath: editor.fileName,
      filters: [{ name: "Bilder", extensions: [format === "jpeg" ? "jpg" : "png"] }],
    });
  } catch (e) {
    console.error("[haex-image] saveAs error:", e);
  }
}
</script>

<template>
  <div class="flex h-screen flex-col bg-background">
    <!-- Toolbar -->
    <header class="flex items-center gap-1 border-b border-border px-2 py-1.5">
      <!-- Open -->
      <button
        class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        :title="t('open')"
        @click="openFile"
      >
        <ImagePlus class="size-4" />
        <span class="hidden md:inline">{{ t("open") }}</span>
      </button>

      <div class="mx-1 h-5 w-px bg-border" />

      <!-- Undo/Redo -->
      <button
        class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
        :disabled="!editor.canUndo"
        :title="t('undo')"
        @click="editor.undo()"
      >
        <Undo2 class="size-4" />
      </button>
      <button
        class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
        :disabled="!editor.canRedo"
        :title="t('redo')"
        @click="editor.redo()"
      >
        <Redo2 class="size-4" />
      </button>

      <template v-if="editor.hasImage">
        <div class="mx-1 h-5 w-px bg-border" />

        <!-- Tools (large screens) -->
        <div class="hidden gap-1 lg:flex">
          <button
            v-for="tool in toolButtons"
            :key="tool.id"
            class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
            :class="editor.activeTool === tool.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
            @click="selectTool(tool.id)"
          >
            <component :is="tool.icon" class="size-4" />
            {{ tool.label }}
          </button>
        </div>

        <!-- Tools burger (small screens) -->
        <ShadcnDropdownMenu>
          <ShadcnDropdownMenuTrigger as-child>
            <button
              class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
            >
              <Menu class="size-4" />
              <span>{{ t("tools") }}</span>
            </button>
          </ShadcnDropdownMenuTrigger>
          <ShadcnDropdownMenuContent align="start" class="min-w-40">
            <ShadcnDropdownMenuItem
              v-for="tool in toolButtons"
              :key="tool.id"
              @click="selectTool(tool.id)"
            >
              <component :is="tool.icon" class="mr-2 size-4" />
              {{ tool.label }}
            </ShadcnDropdownMenuItem>
          </ShadcnDropdownMenuContent>
        </ShadcnDropdownMenu>
      </template>

      <div class="flex-1" />

      <!-- Info -->
      <span v-if="editor.hasImage" class="hidden text-xs text-muted-foreground md:inline">
        {{ editor.imageWidth }} × {{ editor.imageHeight }}px
      </span>

      <!-- Save -->
      <button
        v-if="editor.hasImage"
        class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        :title="t('saveAs')"
        @click="saveAs"
      >
        <Save class="size-4" />
        <span class="hidden md:inline">{{ t("save") }}</span>
      </button>
    </header>


    <div class="flex flex-1 overflow-hidden">
      <!-- Tool Options Sidebar -->
      <aside
        v-if="editor.activeTool"
        class="flex w-56 flex-col gap-3 overflow-y-auto border-r border-border bg-card p-3"
      >
        <!-- Crop options -->
        <template v-if="editor.activeTool === 'crop'">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("aspectRatio") }}</p>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="preset in aspectPresets"
              :key="preset.id"
              class="rounded-md px-2 py-1 text-xs transition-colors"
              :class="editor.cropAspectRatio === preset.ratio
                ? 'bg-primary text-primary-foreground'
                : 'bg-accent/50 text-foreground hover:bg-accent'"
              @click="editor.cropAspectRatio = preset.ratio"
            >
              {{ preset.label }}
            </button>
          </div>
          <p class="text-xs text-muted-foreground">{{ t("cropHint") }}</p>
          <button
            v-if="editor.cropRect.width > 0"
            class="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            @click="confirmCrop"
          >
            <Check class="size-4" />
            {{ t("applyCrop") }}
          </button>
        </template>

        <!-- Rotate options -->
        <template v-if="editor.activeTool === 'rotate'">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("rotate") }}</p>
          <div class="flex gap-2">
            <button
              class="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/50 py-2 text-sm hover:bg-accent"
              @click="processor.applyRotate90('ccw')"
            >
              <RotateCcw class="size-4" /> 90°
            </button>
            <button
              class="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/50 py-2 text-sm hover:bg-accent"
              @click="processor.applyRotate90('cw')"
            >
              <RotateCw class="size-4" /> 90°
            </button>
          </div>

          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("freeRotation") }}</p>
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <input
                v-model.number="freeRotationDeg"
                type="range"
                min="-180"
                max="180"
                step="1"
                class="flex-1 accent-primary"
              >
              <span class="w-10 text-right font-mono text-xs text-foreground">{{ freeRotationDeg }}°</span>
            </div>
            <input
              v-model.number="freeRotationDeg"
              type="number"
              min="-360"
              max="360"
              step="1"
              class="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
            <button
              :disabled="freeRotationDeg === 0"
              class="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-30"
              @click="applyFreeRotation"
            >
              <Check class="size-4" />
              {{ t("applyRotation") }}
            </button>
          </div>

          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("flip") }}</p>
          <div class="flex gap-2">
            <button
              class="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/50 py-2 text-sm hover:bg-accent"
              @click="processor.applyFlip('horizontal')"
            >
              <FlipHorizontal2 class="size-4" /> H
            </button>
            <button
              class="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/50 py-2 text-sm hover:bg-accent"
              @click="processor.applyFlip('vertical')"
            >
              <FlipVertical2 class="size-4" /> V
            </button>
          </div>
        </template>

        <!-- Resize options -->
        <template v-if="editor.activeTool === 'resize'">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("resize") }}</p>
          <div class="flex flex-col gap-2">
            <label class="text-xs text-muted-foreground">{{ t("width") }} (px)</label>
            <input
              :value="editor.resizeWidth"
              type="number"
              min="1"
              max="10000"
              class="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              @input="onResizeWidthChange(Number(($event.target as HTMLInputElement).value))"
            >
            <label class="text-xs text-muted-foreground">{{ t("height") }} (px)</label>
            <input
              :value="editor.resizeHeight"
              type="number"
              min="1"
              max="10000"
              class="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              @input="onResizeHeightChange(Number(($event.target as HTMLInputElement).value))"
            >
            <label class="flex cursor-pointer items-center justify-between gap-2 rounded-md bg-accent/30 px-3 py-2">
              <span class="text-xs text-foreground">{{ t("lockAspect") }}</span>
              <ShadcnSwitch
                :checked="editor.resizeLockAspect"
                @update:checked="editor.resizeLockAspect = $event"
              />
            </label>
            <button
              class="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              @click="confirmResize"
            >
              <Check class="size-4" />
              {{ t("applyResize") }}
            </button>
          </div>
        </template>

        <!-- Adjust options -->
        <template v-if="editor.activeTool === 'adjust'">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("adjust") }}</p>
          <div class="flex flex-col gap-3">
            <div v-for="param in ['brightness', 'contrast', 'saturation'] as const" :key="param">
              <div class="mb-1 flex justify-between text-xs">
                <span class="text-muted-foreground">{{ t(param) }}</span>
                <span class="font-mono text-foreground">{{ previewAdjustments[param] }}</span>
              </div>
              <input
                v-model.number="previewAdjustments[param]"
                type="range"
                min="-100"
                max="100"
                class="w-full accent-primary"
              >
            </div>
            <div class="flex gap-2">
              <button
                class="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/50 py-2 text-sm hover:bg-accent"
                @click="resetAdjustments"
              >
                <X class="size-4" />
                {{ t("cancel") }}
              </button>
              <button
                class="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-2 text-sm text-primary-foreground"
                @click="confirmAdjustments"
              >
                <Check class="size-4" />
                {{ t("apply") }}
              </button>
            </div>
          </div>
        </template>

        <!-- Filter options -->
        <template v-if="editor.activeTool === 'filter'">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("filter") }}</p>
          <div class="flex flex-col gap-1">
            <button
              v-for="f in filterPresets"
              :key="f.id"
              class="rounded-md px-3 py-2 text-left text-sm transition-colors"
              :class="editor.activeFilter === f.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent/50'"
              @click="editor.activeFilter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
          <button
            v-if="editor.activeFilter !== 'none'"
            class="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            @click="confirmFilter"
          >
            <Check class="size-4" />
            {{ t("applyFilter") }}
          </button>
        </template>
      </aside>

      <!-- Canvas Area -->
      <div
        ref="containerRef"
        class="flex flex-1 items-center justify-center overflow-hidden"
        style="background-color: #1a1a1a; background-image: linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;"
      >
        <!-- Empty state -->
        <div v-if="!editor.hasImage" class="flex flex-col items-center gap-4 rounded-xl bg-card/90 p-10 shadow-lg backdrop-blur">
          <ImagePlus class="size-16 text-muted-foreground" />
          <p class="text-sm text-foreground">{{ t("noImage") }}</p>
          <button
            class="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            @click="openFile"
          >
            <ImagePlus class="size-4" />
            {{ t("openImage") }}
          </button>
        </div>

        <!-- Image canvas -->
        <canvas
          v-show="editor.hasImage"
          ref="canvasRef"
          class="shadow-2xl ring-1 ring-white/10"
          :class="editor.activeTool === 'crop' ? (cropCursor) : ''"
          @pointerdown="onCanvasPointerDown"
          @pointermove="onCanvasPointerMove"
          @pointerup="onCanvasPointerUp"
        />
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  open: Öffnen
  save: Speichern
  undo: Rückgängig
  redo: Wiederholen
  tools: Werkzeuge
  crop: Zuschneiden
  rotate: Drehen
  resize: Größe
  adjust: Anpassen
  filter: Filter
  noImage: Kein Bild geladen
  openImage: Bild öffnen
  saveAs: Speichern unter
  aspectRatio: Seitenverhältnis
  cropHint: Ziehe ein Rechteck auf dem Bild
  applyCrop: Zuschnitt anwenden
  freeRotation: Freie Drehung
  applyRotation: Drehung anwenden
  flip: Spiegeln
  width: Breite
  height: Höhe
  lockAspect: Seitenverhältnis beibehalten
  applyResize: Größe anwenden
  brightness: Helligkeit
  contrast: Kontrast
  saturation: Sättigung
  cancel: Abbrechen
  apply: Anwenden
  applyFilter: Filter anwenden
en:
  open: Open
  save: Save
  undo: Undo
  redo: Redo
  tools: Tools
  crop: Crop
  rotate: Rotate
  resize: Resize
  adjust: Adjust
  filter: Filter
  noImage: No image loaded
  openImage: Open Image
  saveAs: Save As
  aspectRatio: Aspect Ratio
  cropHint: Draw a rectangle on the image
  applyCrop: Apply Crop
  freeRotation: Free Rotation
  applyRotation: Apply Rotation
  flip: Flip
  width: Width
  height: Height
  lockAspect: Lock Aspect Ratio
  applyResize: Apply Resize
  brightness: Brightness
  contrast: Contrast
  saturation: Saturation
  cancel: Cancel
  apply: Apply
  applyFilter: Apply Filter
</i18n>
