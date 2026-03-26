import type { Stencil } from "~/types/stencil";
import { STENCIL_PRESETS } from "~/utils/stencilPresets";

export const useStencilStore = defineStore("stencils", () => {
  const stencils = ref<Stencil[]>([]);
  const hoveredId = ref<string | null>(null);
  const selectedIds = ref<Set<string>>(new Set());
  const draggingId = ref<string | null>(null);
  const placingId = ref<string | null>(null);
  const clipboard = ref<Stencil[]>([]);

  const nextZIndex = () => {
    const canvasStore = useCanvasStore();
    const maxStencilZ = stencils.value.reduce((max, s) => Math.max(max, s.zIndex ?? 0), 0);
    const maxStrokeZ = canvasStore.strokes.reduce((max, s) => Math.max(max, s.zIndex ?? 0), 0);
    return Math.max(maxStencilZ, maxStrokeZ) + 1;
  };

  // Compat: single selected stencil (first in set, for panel)
  const selectedId = computed({
    get: () => {
      const first = selectedIds.value.values().next();
      return first.done ? null : first.value;
    },
    set: (id: string | null) => {
      selectedIds.value = id ? new Set([id]) : new Set();
    },
  });

  const isSelected = (id: string) => selectedIds.value.has(id);

  const selectStencil = (id: string, addToSelection = false) => {
    if (addToSelection) {
      const next = new Set(selectedIds.value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selectedIds.value = next;
    } else {
      selectedIds.value = new Set([id]);
    }
  };

  const clearSelection = () => {
    selectedIds.value = new Set();
  };

  const addStencil = (presetId: string, worldX: number, worldY: number) => {
    const preset = STENCIL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    const stencil: Stencil = {
      id: crypto.randomUUID(),
      presetId: preset.id,
      shapeType: preset.shapeType,
      label: preset.id,
      x: worldX,
      y: worldY,
      width: preset.defaultWidth,
      height: preset.defaultHeight,
      rotation: 0,
      pinned: false,
      emoji: preset.emoji,
      zIndex: nextZIndex(),
    };

    stencils.value.push(stencil);
    selectedIds.value = new Set([stencil.id]);
    placingId.value = stencil.id;
    return stencil;
  };

  const addCustomStencil = (svgPath: string, width: number, height: number, name: string, worldX: number, worldY: number) => {
    const stencil: Stencil = {
      id: crypto.randomUUID(),
      presetId: "custom",
      shapeType: "custom",
      label: name,
      x: worldX,
      y: worldY,
      width,
      height,
      rotation: 0,
      pinned: false,
      svgPath,
      zIndex: nextZIndex(),
    };

    stencils.value.push(stencil);
    selectedIds.value = new Set([stencil.id]);
    placingId.value = stencil.id;
    return stencil;
  };

  const addImageStencil = (imageData: string, width: number, height: number, name: string, worldX: number, worldY: number) => {
    // Scale down if too large (max 600px on longest side for initial placement)
    const maxSize = 600;
    const scale = Math.min(maxSize / Math.max(width, height), 1);
    const stencil: Stencil = {
      id: crypto.randomUUID(),
      presetId: "image",
      shapeType: "image",
      label: name,
      x: worldX,
      y: worldY,
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      rotation: 0,
      pinned: false,
      imageData,
      zIndex: nextZIndex(),
    };

    stencils.value.push(stencil);
    selectedIds.value = new Set([stencil.id]);
    return stencil;
  };

  const addEmojiStencil = (emoji: string, worldX: number, worldY: number) => {
    const stencil: Stencil = {
      id: crypto.randomUUID(),
      presetId: "emoji",
      shapeType: "emoji",
      label: emoji,
      x: worldX,
      y: worldY,
      width: 80,
      height: 80,
      rotation: 0,
      pinned: false,
      emoji,
      zIndex: nextZIndex(),
    };

    stencils.value.push(stencil);
    selectedIds.value = new Set([stencil.id]);
    return stencil;
  };

  const removeStencil = (id: string) => {
    stencils.value = stencils.value.filter((s) => s.id !== id);
    const next = new Set(selectedIds.value);
    next.delete(id);
    selectedIds.value = next;
    if (hoveredId.value === id) hoveredId.value = null;
  };

  const removeSelected = () => {
    stencils.value = stencils.value.filter((s) => !selectedIds.value.has(s.id));
    selectedIds.value = new Set();
  };

  const moveStencil = (id: string, x: number, y: number) => {
    const stencil = stencils.value.find((s) => s.id === id);
    if (stencil) {
      stencil.x = x;
      stencil.y = y;
    }
  };

  const moveSelected = (dx: number, dy: number) => {
    for (const s of stencils.value) {
      if (selectedIds.value.has(s.id) && !s.pinned) {
        s.x += dx;
        s.y += dy;
      }
    }
  };

  const rotateStencil = (id: string, radians: number) => {
    const stencil = stencils.value.find((s) => s.id === id);
    if (stencil) {
      stencil.rotation = (stencil.rotation + radians) % (Math.PI * 2);
    }
  };

  const setStencilRotation = (id: string, radians: number) => {
    const stencil = stencils.value.find((s) => s.id === id);
    if (stencil) {
      stencil.rotation = radians % (Math.PI * 2);
    }
  };

  const togglePin = (id: string) => {
    const stencil = stencils.value.find((s) => s.id === id);
    if (stencil) stencil.pinned = !stencil.pinned;
  };

  const changeShape = (id: string, presetId: string) => {
    const stencil = stencils.value.find((s) => s.id === id);
    const preset = STENCIL_PRESETS.find((p) => p.id === presetId);
    if (!stencil || !preset) return;
    stencil.presetId = preset.id;
    stencil.shapeType = preset.shapeType;
    stencil.label = preset.id;
    stencil.width = preset.defaultWidth;
    stencil.height = preset.defaultHeight;
  };

  const resizeStencil = (id: string, width: number, height: number) => {
    const stencil = stencils.value.find((s) => s.id === id);
    if (stencil) {
      stencil.width = Math.max(10, width);
      stencil.height = Math.max(10, height);
    }
  };

  const getStencil = (id: string) => stencils.value.find((s) => s.id === id);

  // Copy/Paste
  const copySelected = () => {
    clipboard.value = stencils.value
      .filter((s) => selectedIds.value.has(s.id))
      .map((s) => ({ ...s }));
  };

  const paste = (offsetX = 20, offsetY = 20) => {
    if (clipboard.value.length === 0) return;
    const newIds = new Set<string>();
    for (const original of clipboard.value) {
      const copy: Stencil = {
        ...original,
        id: crypto.randomUUID(),
        x: original.x + offsetX,
        y: original.y + offsetY,
        pinned: false,
      };
      stencils.value.push(copy);
      newIds.add(copy.id);
    }
    selectedIds.value = newIds;
  };

  const moveLayerUp = (id: string) => {
    const stencil = stencils.value.find((s) => s.id === id);
    if (!stencil) return;
    stencil.zIndex = (stencil.zIndex ?? 0) + 1;
  };

  const moveLayerDown = (id: string) => {
    const stencil = stencils.value.find((s) => s.id === id);
    if (!stencil) return;
    stencil.zIndex = (stencil.zIndex ?? 0) - 1;
  };

  const moveLayerToTop = (id: string) => {
    const stencil = stencils.value.find((s) => s.id === id);
    if (!stencil) return;
    stencil.zIndex = nextZIndex();
  };

  const moveLayerToBottom = (id: string) => {
    const stencil = stencils.value.find((s) => s.id === id);
    if (!stencil) return;
    const canvasStore = useCanvasStore();
    const minStencilZ = stencils.value.reduce((min, s) => Math.min(min, s.zIndex ?? 0), 0);
    const minStrokeZ = canvasStore.strokes.reduce((min, s) => Math.min(min, s.zIndex ?? 0), 0);
    stencil.zIndex = Math.min(minStencilZ, minStrokeZ) - 1;
  };

  /** Stencils sorted by zIndex for rendering */
  const sortedStencils = computed(() =>
    [...stencils.value].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  );

  const hitTest = (worldX: number, worldY: number): Stencil | null => {
    // Test in reverse z-order (highest first)
    const sorted = [...stencils.value].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
    for (const s of sorted) {
      const dx = worldX - s.x;
      const dy = worldY - s.y;
      const cos = Math.cos(-s.rotation);
      const sin = Math.sin(-s.rotation);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      const hw = s.width / 2;
      const hh = s.height / 2;
      if (localX >= -hw && localX <= hw && localY >= -hh && localY <= hh) {
        return s;
      }
    }
    return null;
  };

  const clear = () => {
    stencils.value = [];
    hoveredId.value = null;
    selectedIds.value = new Set();
    draggingId.value = null;
    placingId.value = null;
    clipboard.value = [];
  };

  const loadStencils = (serialized: any[]) => {
    clear();
    stencils.value = serialized.map((s) => ({
      id: s.id,
      presetId: s.presetId,
      shapeType: s.shapeType,
      label: s.label,
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      rotation: s.rotation ?? 0,
      pinned: s.pinned ?? false,
      svgPath: s.svgPath,
      imageData: s.imageData,
      opacity: s.opacity,
      saturation: s.saturation,
      brightness: s.brightness,
      contrast: s.contrast,
      emoji: s.emoji,
      zIndex: s.zIndex ?? 0,
    }));
  };

  return {
    stencils,
    hoveredId,
    selectedId,
    selectedIds,
    isSelected,
    selectStencil,
    clearSelection,
    draggingId,
    placingId,
    addStencil,
    addCustomStencil,
    addImageStencil,
    addEmojiStencil,
    removeStencil,
    removeSelected,
    moveStencil,
    moveSelected,
    rotateStencil,
    setStencilRotation,
    togglePin,
    changeShape,
    resizeStencil,
    getStencil,
    copySelected,
    paste,
    hitTest,
    sortedStencils,
    moveLayerUp,
    moveLayerDown,
    moveLayerToTop,
    moveLayerToBottom,
    clear,
    loadStencils,
  };
});
