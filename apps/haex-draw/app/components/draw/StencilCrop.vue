<script setup lang="ts">
import { Check, X } from "lucide-vue-next";
import type { Stencil } from "~/types/stencil";

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AspectPreset {
  id: string;
  label: string;
  ratio: number | null;
}

const open = defineModel<boolean>("open", { required: true });

const props = defineProps<{
  stencil: Stencil;
}>();

const emit = defineEmits<{
  apply: [imageData: string, width: number, height: number];
}>();

const { t } = useI18n();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

// Image dimensions (original)
const imgWidth = ref(0);
const imgHeight = ref(0);

// Scale from image pixels to canvas pixels
const renderScale = ref(1);

// Crop state
const cropRect = ref<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
const cropAspectRatio = ref<number | null>(null);
const cropDragging = ref(false);
const cropStart = ref<{ x: number; y: number } | null>(null);

type CropEdge = "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";
const cropMode = ref<"draw" | "move" | "resize">("draw");
const cropResizeEdge = ref<CropEdge>("br");
const cropMoveOffset = ref({ x: 0, y: 0 });
const cropHoverTarget = ref<"inside" | CropEdge | null>(null);

const HANDLE_SIZE = 12;

const aspectPresets: AspectPreset[] = [
  { id: "free", label: "Frei", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

const cursorMap: Record<string, string> = {
  tl: "nwse-resize", tr: "nesw-resize",
  bl: "nesw-resize", br: "nwse-resize",
  t: "ns-resize", b: "ns-resize",
  l: "ew-resize", r: "ew-resize",
  inside: "move",
};

const canvasCursor = computed(() => {
  if (cropHoverTarget.value) return cursorMap[cropHoverTarget.value] || "crosshair";
  return "crosshair";
});

const hasCrop = computed(() => cropRect.value.width > 0 && cropRect.value.height > 0);

// Load image and set up canvas
const loadedImage = shallowRef<HTMLImageElement | null>(null);

function initImage() {
  if (!props.stencil.imageData) return;
  const img = new Image();
  img.onload = () => {
    loadedImage.value = img;
    imgWidth.value = img.naturalWidth;
    imgHeight.value = img.naturalHeight;
    cropRect.value = { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
    nextTick(render);
  };
  img.src = props.stencil.imageData;
}

// Re-init when dialog opens
watch(open, (isOpen) => {
  if (isOpen) {
    cropRect.value = { x: 0, y: 0, width: 0, height: 0 };
    cropAspectRatio.value = null;
    nextTick(initImage);
  }
});

function render() {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  const img = loadedImage.value;
  if (!canvas || !container || !img) return;

  const cw = container.clientWidth;
  const ch = container.clientHeight || 400;

  const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
  renderScale.value = scale;

  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const r = cropRect.value;
  if (r.width > 0 && r.height > 0) {
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
    for (const [hx, hy] of handles as [number, number][]) {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
    }
  }
}

watch(cropRect, render, { deep: true });

// Hit testing
function hitTestCropEdge(px: number, py: number): CropEdge | "inside" | null {
  const r = cropRect.value;
  if (r.width <= 0 || r.height <= 0) return null;

  const hs = HANDLE_SIZE / renderScale.value;
  const left = r.x, right = r.x + r.width, top = r.y, bottom = r.y + r.height;

  if (Math.abs(px - left) < hs && Math.abs(py - top) < hs) return "tl";
  if (Math.abs(px - right) < hs && Math.abs(py - top) < hs) return "tr";
  if (Math.abs(px - left) < hs && Math.abs(py - bottom) < hs) return "bl";
  if (Math.abs(px - right) < hs && Math.abs(py - bottom) < hs) return "br";

  if (Math.abs(py - top) < hs && px > left + hs && px < right - hs) return "t";
  if (Math.abs(py - bottom) < hs && px > left + hs && px < right - hs) return "b";
  if (Math.abs(px - left) < hs && py > top + hs && py < bottom - hs) return "l";
  if (Math.abs(px - right) < hs && py > top + hs && py < bottom - hs) return "r";

  if (px >= left && px <= right && py >= top && py <= bottom) return "inside";
  return null;
}

function toImageCoords(e: PointerEvent): { x: number; y: number } {
  const canvas = canvasRef.value!;
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / renderScale.value,
    y: (e.clientY - rect.top) / renderScale.value,
  };
}

function onPointerDown(e: PointerEvent) {
  const { x, y } = toImageCoords(e);
  const hit = hitTestCropEdge(x, y);

  if (hit && hit !== "inside") {
    cropMode.value = "resize";
    cropResizeEdge.value = hit;
  } else if (hit === "inside") {
    cropMode.value = "move";
    cropMoveOffset.value = { x: x - cropRect.value.x, y: y - cropRect.value.y };
  } else {
    cropMode.value = "draw";
    cropStart.value = { x, y };
    cropRect.value = { x, y, width: 0, height: 0 };
  }

  cropDragging.value = true;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const { x: rawX, y: rawY } = toImageCoords(e);

  if (!cropDragging.value) {
    cropHoverTarget.value = hitTestCropEdge(rawX, rawY);
    return;
  }

  const x = Math.max(0, Math.min(imgWidth.value, rawX));
  const y = Math.max(0, Math.min(imgHeight.value, rawY));

  if (cropMode.value === "move") {
    let nx = x - cropMoveOffset.value.x;
    let ny = y - cropMoveOffset.value.y;
    nx = Math.max(0, Math.min(imgWidth.value - cropRect.value.width, nx));
    ny = Math.max(0, Math.min(imgHeight.value - cropRect.value.height, ny));
    cropRect.value = { ...cropRect.value, x: Math.round(nx), y: Math.round(ny) };
  } else if (cropMode.value === "resize") {
    const r = { ...cropRect.value };
    const edge = cropResizeEdge.value;

    if (edge.includes("l")) { const newX = Math.min(x, r.x + r.width - 1); r.width += r.x - newX; r.x = newX; }
    if (edge.includes("r")) { r.width = Math.max(1, x - r.x); }
    if (edge.includes("t")) { const newY = Math.min(y, r.y + r.height - 1); r.height += r.y - newY; r.y = newY; }
    if (edge.includes("b")) { r.height = Math.max(1, y - r.y); }

    if (cropAspectRatio.value) {
      const ratio = cropAspectRatio.value;
      if (edge === "t" || edge === "b") { r.width = r.height * ratio; }
      else if (edge === "l" || edge === "r") { r.height = r.width / ratio; }
      else if (r.width / r.height > ratio) { r.width = r.height * ratio; }
      else { r.height = r.width / ratio; }
    }

    cropRect.value = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  } else {
    if (!cropStart.value) return;
    const sx = cropStart.value.x;
    const sy = cropStart.value.y;
    let cw = Math.abs(x - sx);
    let ch = Math.abs(y - sy);

    if (cropAspectRatio.value) {
      const ratio = cropAspectRatio.value;
      if (cw / ch > ratio) { cw = ch * ratio; }
      else { ch = cw / ratio; }
    }

    const cx = x < sx ? sx - cw : sx;
    const cy = y < sy ? sy - ch : sy;
    cropRect.value = { x: Math.round(cx), y: Math.round(cy), width: Math.round(cw), height: Math.round(ch) };
  }
}

function onPointerUp() {
  cropDragging.value = false;
}

function applyCrop() {
  const r = cropRect.value;
  if (r.width <= 0 || r.height <= 0) return;

  const img = loadedImage.value;
  if (!img) return;

  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = r.width;
  tmpCanvas.height = r.height;
  const ctx = tmpCanvas.getContext("2d")!;
  ctx.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);

  const dataUrl = tmpCanvas.toDataURL("image/png");
  emit("apply", dataUrl, r.width, r.height);
  open.value = false;
}
</script>

<template>
  <ShadcnDialog v-model:open="open">
    <ShadcnDialogContent class="flex max-h-[85vh] max-w-3xl flex-col gap-4">
      <ShadcnDialogHeader>
        <ShadcnDialogTitle>{{ t("title") }}</ShadcnDialogTitle>
        <ShadcnDialogDescription>{{ t("description") }}</ShadcnDialogDescription>
      </ShadcnDialogHeader>

      <!-- Aspect ratio presets -->
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-xs font-medium text-muted-foreground">{{ t("aspectRatio") }}:</span>
        <button
          v-for="preset in aspectPresets"
          :key="preset.id"
          class="rounded-md px-2.5 py-1 text-xs transition-colors"
          :class="cropAspectRatio === preset.ratio
            ? 'bg-primary text-primary-foreground'
            : 'bg-accent/50 text-foreground hover:bg-accent'"
          @click="cropAspectRatio = preset.ratio"
        >
          {{ preset.label }}
        </button>
      </div>

      <!-- Canvas preview -->
      <div ref="containerRef" class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-black/10">
        <canvas
          ref="canvasRef"
          class="block max-h-full max-w-full"
          :style="{ cursor: canvasCursor }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
        />
      </div>

      <!-- Crop info -->
      <p v-if="hasCrop" class="text-center text-xs tabular-nums text-muted-foreground">
        {{ cropRect.width }} × {{ cropRect.height }} px
      </p>
      <p v-else class="text-center text-xs text-muted-foreground">{{ t("hint") }}</p>

      <ShadcnDialogFooter>
        <ShadcnButton variant="outline" @click="open = false">
          <X class="mr-1.5 size-4" />
          {{ t("cancel") }}
        </ShadcnButton>
        <ShadcnButton :disabled="!hasCrop" @click="applyCrop">
          <Check class="mr-1.5 size-4" />
          {{ t("apply") }}
        </ShadcnButton>
      </ShadcnDialogFooter>
    </ShadcnDialogContent>
  </ShadcnDialog>
</template>

<i18n lang="yaml">
de:
  title: Bild zuschneiden
  description: Wähle den Bereich aus, den du behalten möchtest
  aspectRatio: Seitenverhältnis
  hint: Ziehe ein Rechteck auf dem Bild
  apply: Zuschneiden
  cancel: Abbrechen
en:
  title: Crop image
  description: Select the area you want to keep
  aspectRatio: Aspect ratio
  hint: Drag a rectangle on the image
  apply: Apply crop
  cancel: Cancel
</i18n>
