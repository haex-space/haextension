import getStroke from "perfect-freehand";
import { useEventListener } from "@vueuse/core";
import type { StrokeData } from "~/database/schemas";
import type { Stencil } from "~/types/stencil";
import type { StencilShapeType } from "~/types/stencil";
import { BRUSH_PRESETS } from "~/utils/brushPresets";

const FREEZE_CHUNK = 12;
const FREEZE_OVERLAP = 5;

const BORDER_THRESHOLD = 15; // px in world space

const CORNER_THRESHOLD = 30;

function isNearStencilCorner(worldX: number, worldY: number, stencil: Stencil): boolean {
  const dx = worldX - stencil.x;
  const dy = worldY - stencil.y;
  const cos = Math.cos(-stencil.rotation);
  const sin = Math.sin(-stencil.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const hw = stencil.width / 2;
  const hh = stencil.height / 2;

  // Check proximity to each corner (from outside the bounding box)
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];

  for (const c of corners) {
    const dist = Math.hypot(localX - c.x, localY - c.y);
    if (dist < CORNER_THRESHOLD) return true;
  }
  return false;
}

function isNearStencilBorder(worldX: number, worldY: number, stencil: Stencil): boolean {
  // Transform point into stencil's local (rotation-corrected) space
  const dx = worldX - stencil.x;
  const dy = worldY - stencil.y;
  const cos = Math.cos(-stencil.rotation);
  const sin = Math.sin(-stencil.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const hw = stencil.width / 2;
  const hh = stencil.height / 2;

  // Must be inside the bounding box
  if (localX < -hw || localX > hw || localY < -hh || localY > hh) return false;

  // Check if near any edge
  const distLeft = Math.abs(localX + hw);
  const distRight = Math.abs(localX - hw);
  const distTop = Math.abs(localY + hh);
  const distBottom = Math.abs(localY - hh);

  return Math.min(distLeft, distRight, distTop, distBottom) < BORDER_THRESHOLD;
}

/**
 * Handles all mouse/touch/pen input on the canvas.
 * Transforms screen coordinates to world coordinates for drawing,
 * and handles pan (middle mouse / space+drag) and zoom (wheel).
 * Also handles stencil hover detection and drag-to-move.
 */
export function useCanvasInput(canvasEl: Ref<HTMLCanvasElement | null>) {
  const canvas = useCanvasStore();
  const stencilStore = useStencilStore();

  // Pan state
  const isPanning = ref(false);
  const panStart = ref({ x: 0, y: 0 });
  const spaceHeld = ref(false);

  // Shift-constrain state: lock drawing angle
  const shiftHeld = ref(false);
  const constrainAngle = ref<number | null>(null); // locked angle in radians
  const constrainOrigin = ref({ x: 0, y: 0 }); // point where shift was pressed

  // Stencil drag state
  const dragOffset = ref({ x: 0, y: 0 });

  // Stencil rotation state
  const isRotating = ref(false);
  const rotatingId = ref<string | null>(null);
  const rotationStartAngle = ref(0);
  const stencilStartRotation = ref(0);

  // Stencil placing state (drag-to-configure after placement)
  const isPlacing = ref(false);
  const placingBaseSize = ref({ w: 0, h: 0 });

  // Stencil clipboard
  const clipboardStencil = ref<Stencil | null>(null);

  // Pinch zoom state
  const lastPinchDist = ref(0);
  const lastPinchCenter = ref({ x: 0, y: 0 });

  const screenToWorld = (screenX: number, screenY: number) => {
    const { x: panX, y: panY, zoom } = canvas.viewport;
    return {
      x: (screenX - panX) / zoom,
      y: (screenY - panY) / zoom,
    };
  };

  const getPointerPos = (e: PointerEvent) => {
    const rect = canvasEl.value!.getBoundingClientRect();
    return {
      screenX: e.clientX - rect.left,
      screenY: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!canvasEl.value) return;
    canvasEl.value.setPointerCapture(e.pointerId);

    const { screenX, screenY, pressure } = getPointerPos(e);
    const world = screenToWorld(screenX, screenY);

    // Placing mode: freshly placed stencil, drag to configure size + rotation
    if (e.button === 0 && stencilStore.placingId) {
      const stencil = stencilStore.getStencil(stencilStore.placingId);
      if (stencil) {
        isPlacing.value = true;
        placingBaseSize.value = { w: stencil.width, h: stencil.height };
        // Move stencil center to click position
        stencilStore.moveStencil(stencil.id, world.x, world.y);
        return;
      }
    }

    // Middle mouse or right click → always pan canvas
    if (e.button === 1 || e.button === 2) {
      isPanning.value = true;
      panStart.value = { x: screenX - canvas.viewport.x, y: screenY - canvas.viewport.y };
      return;
    }

    // Left click
    if (e.button === 0) {
      // 1. Pan tool: stencil interaction + canvas pan
      if (canvas.activeTool === "pan") {
        // Check corner rotation first (works on selected stencil)
        const selected = stencilStore.selectedId ? stencilStore.getStencil(stencilStore.selectedId) : null;
        if (selected && !selected.pinned && isNearStencilCorner(world.x, world.y, selected)) {
          isRotating.value = true;
          rotatingId.value = selected.id;
          stencilStartRotation.value = selected.rotation;
          rotationStartAngle.value = Math.atan2(world.y - selected.y, world.x - selected.x);
          return;
        }

        const hitStencil = stencilStore.hitTest(world.x, world.y);
        if (hitStencil) {
          // Ctrl+Click = toggle in multi-selection
          stencilStore.selectStencil(hitStencil.id, e.ctrlKey || e.metaKey);

          if (!hitStencil.pinned) {
            stencilStore.draggingId = hitStencil.id;
            dragOffset.value = {
              x: world.x - hitStencil.x,
              y: world.y - hitStencil.y,
            };
            return;
          }
          return;
        }

        stencilStore.clearSelection();
      }

      // 2. Stencil tool: place last preset at click position
      if (canvas.activeTool === "stencil" && canvas.lastStencilPreset) {
        stencilStore.addStencil(canvas.lastStencilPreset, world.x, world.y);
        // placingId is set by addStencil, so drag-to-configure starts automatically
        const stencil = stencilStore.getStencil(stencilStore.placingId!);
        if (stencil) {
          isPlacing.value = true;
          placingBaseSize.value = { w: stencil.width, h: stencil.height };
        }
        return;
      }

      // 3. Space+click or pan tool → pan canvas
      if (spaceHeld.value || canvas.activeTool === "pan") {
        isPanning.value = true;
        panStart.value = { x: screenX - canvas.viewport.x, y: screenY - canvas.viewport.y };
        return;
      }

      // 3. Otherwise draw
      const activePreset = BRUSH_PRESETS.find(p => p.id === canvas.activeBrushPreset) ?? BRUSH_PRESETS[0]!;

      canvas.resetFrozen();
      canvas.currentStroke = {
        id: crypto.randomUUID(),
        points: [[world.x, world.y, pressure]],
        color: canvas.brushColor,
        size: canvas.brushSize,
        tool: activePreset.isEraser ? "eraser" : "brush",
        brushPreset: canvas.activeBrushPreset,
        brushTip: canvas.brushTip,
      };
      canvas.isDrawing = true;

      // If shift is already held, set constrain origin to the starting point
      if (shiftHeld.value) {
        constrainOrigin.value = { x: world.x, y: world.y };
        constrainAngle.value = null;
      }
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!canvasEl.value) return;

    const { screenX, screenY, pressure } = getPointerPos(e);
    const world = screenToWorld(screenX, screenY);

    // Stencil placing: drag sets rotation + size simultaneously
    if (isPlacing.value && stencilStore.placingId) {
      const stencil = stencilStore.getStencil(stencilStore.placingId);
      if (stencil) {
        const dx = world.x - stencil.x;
        const dy = world.y - stencil.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        // Rotation from drag angle
        stencilStore.setStencilRotation(stencil.id, angle);

        // Size from drag distance (scale proportionally, minimum 30px)
        const scale = Math.max(30, dist * 2) / Math.max(placingBaseSize.value.w, placingBaseSize.value.h);
        stencilStore.resizeStencil(
          stencil.id,
          Math.round(placingBaseSize.value.w * scale),
          Math.round(placingBaseSize.value.h * scale),
        );
      }
      return;
    }

    // Stencil rotation
    if (isRotating.value && rotatingId.value) {
      const stencil = stencilStore.getStencil(rotatingId.value);
      if (stencil) {
        const currentAngle = Math.atan2(world.y - stencil.y, world.x - stencil.x);
        const delta = currentAngle - rotationStartAngle.value;
        stencilStore.setStencilRotation(rotatingId.value, stencilStartRotation.value + delta);
      }
      return;
    }

    // Stencil drag (moves all selected)
    if (stencilStore.draggingId) {
      const anchor = stencilStore.getStencil(stencilStore.draggingId);
      if (anchor) {
        const newX = world.x - dragOffset.value.x;
        const newY = world.y - dragOffset.value.y;
        const dx = newX - anchor.x;
        const dy = newY - anchor.y;
        stencilStore.moveSelected(dx, dy);
        // Also move non-selected anchor if it wasn't in the set
        if (!stencilStore.isSelected(stencilStore.draggingId)) {
          stencilStore.moveStencil(stencilStore.draggingId, newX, newY);
        }
      }
      return;
    }

    if (isPanning.value) {
      canvas.viewport.x = screenX - panStart.value.x;
      canvas.viewport.y = screenY - panStart.value.y;
      return;
    }

    if (canvas.isDrawing && canvas.currentStroke) {
      let drawX = world.x;
      let drawY = world.y;

      // Shift-constrain: lock to the angle determined when shift was first pressed
      if (shiftHeld.value) {
        if (constrainAngle.value === null) {
          // Determine angle from the origin to current position — need enough movement to be reliable
          const dx = drawX - constrainOrigin.value.x;
          const dy = drawY - constrainOrigin.value.y;
          if (Math.hypot(dx, dy) > 10) {
            // Snap to nearest 45° increment
            const rawAngle = Math.atan2(dy, dx);
            constrainAngle.value = Math.round(rawAngle / (Math.PI / 4)) * (Math.PI / 4);
          }
        }
        if (constrainAngle.value !== null) {
          const dx = drawX - constrainOrigin.value.x;
          const dy = drawY - constrainOrigin.value.y;
          // Project onto the locked angle axis
          const cos = Math.cos(constrainAngle.value);
          const sin = Math.sin(constrainAngle.value);
          const proj = dx * cos + dy * sin;
          drawX = constrainOrigin.value.x + cos * proj;
          drawY = constrainOrigin.value.y + sin * proj;
        }
      }

      canvas.currentStroke.points.push([drawX, drawY, pressure]);

      // Progressive freeze: once we have enough new points, freeze the outline
      // so the beginning of the stroke stops shifting.
      const pts = canvas.currentStroke.points;
      if (pts.length - canvas.frozenUpTo >= FREEZE_CHUNK) {
        const preset = BRUSH_PRESETS.find(p => p.id === canvas.currentStroke!.brushPreset) ?? BRUSH_PRESETS[0]!;
        const hasPressure = pts.some(p => p[2] !== 0.5);
        const freezeEnd = pts.length - FREEZE_OVERLAP;
        const freezePoints = pts.slice(0, freezeEnd);
        const outlinePoints = getStroke(freezePoints, {
          size: canvas.currentStroke.size,
          ...preset.options,
          simulatePressure: preset.options.simulatePressure && !hasPressure,
          last: false,
        });
        if (outlinePoints.length >= 2) {
          // Build SVG path for the frozen portion
          const d: string[] = [];
          const first = outlinePoints[0]!;
          d.push(`M ${first[0]} ${first[1]}`);
          for (let i = 1; i < outlinePoints.length; i++) {
            const pt = outlinePoints[i]!;
            d.push(`L ${pt[0]} ${pt[1]}`);
          }
          d.push("Z");
          canvas.frozenPath = d.join(" ");
          canvas.frozenUpTo = freezeEnd;
        }
      }
      return;
    }

    // Hover detection for stencils
    const hit = stencilStore.hitTest(world.x, world.y);
    stencilStore.hoveredId = hit?.id ?? null;

    // Update cursor
    if (canvas.activeTool === "pan") {
      const selected = stencilStore.selectedId ? stencilStore.getStencil(stencilStore.selectedId) : null;
      if (selected && !selected.pinned && isNearStencilCorner(world.x, world.y, selected)) {
        canvasEl.value!.style.cursor = "crosshair";
      } else if (hit && !hit.pinned) {
        canvasEl.value!.style.cursor = "move";
      } else {
        canvasEl.value!.style.cursor = "grab";
      }
    } else {
      canvasEl.value!.style.cursor = "crosshair";
    }
  };

  const onPointerUp = (_e: PointerEvent) => {
    if (isPlacing.value) {
      isPlacing.value = false;
      stencilStore.placingId = null;
      return;
    }

    if (isRotating.value) {
      isRotating.value = false;
      rotatingId.value = null;
      return;
    }

    if (stencilStore.draggingId) {
      stencilStore.draggingId = null;
      return;
    }

    if (isPanning.value) {
      isPanning.value = false;
      return;
    }

    if (canvas.isDrawing && canvas.currentStroke) {
      const stroke = { ...canvas.currentStroke };
      const preset = BRUSH_PRESETS.find((p) => p.id === stroke.brushPreset);
      const label = stroke.tool === "eraser"
        ? "eraser"
        : (preset?.id ?? "brush");
      canvas.addStroke(stroke, label);
      canvas.currentStroke = null;
      canvas.isDrawing = false;
      canvas.resetFrozen();
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!canvasEl.value) return;

    const rect = canvasEl.value.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const oldZoom = canvas.viewport.zoom;
    const newZoom = Math.min(Math.max(oldZoom * zoomFactor, 0.01), 100);

    // Zoom towards cursor
    canvas.viewport.x = mouseX - (mouseX - canvas.viewport.x) * (newZoom / oldZoom);
    canvas.viewport.y = mouseY - (mouseY - canvas.viewport.y) * (newZoom / oldZoom);
    canvas.viewport.zoom = newZoom;
  };

  // Touch: pinch-to-zoom
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.value = Math.hypot(dx, dy);
      lastPinchCenter.value = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);

      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      if (lastPinchDist.value > 0) {
        const rect = canvasEl.value!.getBoundingClientRect();
        const localX = centerX - rect.left;
        const localY = centerY - rect.top;

        const scale = dist / lastPinchDist.value;
        const oldZoom = canvas.viewport.zoom;
        const newZoom = Math.min(Math.max(oldZoom * scale, 0.01), 100);

        canvas.viewport.x = localX - (localX - canvas.viewport.x) * (newZoom / oldZoom);
        canvas.viewport.y = localY - (localY - canvas.viewport.y) * (newZoom / oldZoom);
        canvas.viewport.zoom = newZoom;

        const panDx = centerX - lastPinchCenter.value.x;
        const panDy = centerY - lastPinchCenter.value.y;
        canvas.viewport.x += panDx;
        canvas.viewport.y += panDy;
      }

      lastPinchDist.value = dist;
      lastPinchCenter.value = { x: centerX, y: centerY };
    }
  };

  const onTouchEnd = () => {
    lastPinchDist.value = 0;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      e.preventDefault();
      spaceHeld.value = true;
    }
    if (e.key === "Shift" && !shiftHeld.value) {
      shiftHeld.value = true;
      // Set constrain origin to the last drawn point
      if (canvas.isDrawing && canvas.currentStroke && canvas.currentStroke.points.length > 0) {
        const lastPt = canvas.currentStroke.points[canvas.currentStroke.points.length - 1]!;
        constrainOrigin.value = { x: lastPt[0], y: lastPt[1] };
      }
      constrainAngle.value = null;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      canvas.undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      canvas.redo();
    }
    if (e.key === "b" && !e.ctrlKey && !e.metaKey) canvas.activeTool = "brush";
    if (e.key === "e" && !e.ctrlKey && !e.metaKey) { canvas.activeBrushPreset = "eraser"; canvas.activeTool = "brush"; }
    if (e.key === "h" && !e.ctrlKey && !e.metaKey) canvas.activeTool = "pan";
    if (e.key === "s" && !e.ctrlKey && !e.metaKey && canvas.lastStencilPreset) canvas.activeTool = "stencil";
    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      stencilStore.selectedIds = new Set(stencilStore.stencils.map((s) => s.id));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "c" && stencilStore.selectedIds.size > 0) {
      e.preventDefault();
      stencilStore.copySelected();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "v" && stencilStore.clipboard.length > 0) {
      e.preventDefault();
      stencilStore.paste();
    }
    if (e.key === "Delete" && stencilStore.selectedIds.size > 0) {
      stencilStore.removeSelected();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") spaceHeld.value = false;
    if (e.key === "Shift") {
      shiftHeld.value = false;
      constrainAngle.value = null;
    }
  };

  // Auto-cleanup via useEventListener (VueUse)
  useEventListener(canvasEl, "pointerdown", onPointerDown);
  useEventListener(canvasEl, "pointermove", onPointerMove);
  useEventListener(canvasEl, "pointerup", onPointerUp);
  useEventListener(canvasEl, "pointerleave", onPointerUp);
  useEventListener(canvasEl, "contextmenu", (e) => e.preventDefault());
  useEventListener(canvasEl, "wheel", onWheel, { passive: false });
  useEventListener(canvasEl, "touchstart", onTouchStart, { passive: false });
  useEventListener(canvasEl, "touchmove", onTouchMove, { passive: false });
  useEventListener(canvasEl, "touchend", onTouchEnd);
  useEventListener(window, "keydown", onKeyDown);
  useEventListener(window, "keyup", onKeyUp);

  return { screenToWorld };
}
