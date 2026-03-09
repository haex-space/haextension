import { useMousePressed } from "@vueuse/core";

export interface DragSelectOptions {
  /** Convert a mouse event to a grid position (e.g. time slot index or cell index) */
  toPosition: (event: MouseEvent) => number;
  /** Called when selection is complete with start and end positions (always sorted) */
  onSelect: (start: number, end: number) => void;
  /** Minimum drag distance in positions to count as a drag (default: 0 = any drag) */
  minDistance?: number;
}

export interface DragSelectState {
  /** Whether we are currently dragging */
  isDragging: Ref<boolean>;
  /** Start position (during drag) */
  startPos: Ref<number | null>;
  /** Current end position (during drag) */
  endPos: Ref<number | null>;
  /** Sorted min of start/end */
  selectionStart: ComputedRef<number | null>;
  /** Sorted max of start/end */
  selectionEnd: ComputedRef<number | null>;
}

export function useDragSelect(
  target: Ref<HTMLElement | null>,
  options: DragSelectOptions,
): DragSelectState {
  const isDragging = ref(false);
  const startPos = ref<number | null>(null);
  const endPos = ref<number | null>(null);
  const wasDragged = ref(false);

  const { pressed } = useMousePressed({ target });

  const selectionStart = computed(() => {
    if (startPos.value === null || endPos.value === null) return null;
    return Math.min(startPos.value, endPos.value);
  });

  const selectionEnd = computed(() => {
    if (startPos.value === null || endPos.value === null) return null;
    return Math.max(startPos.value, endPos.value);
  });

  function onMouseDown(event: MouseEvent) {
    // Only left mouse button
    if (event.button !== 0) return;
    // Don't start drag on existing events
    if ((event.target as HTMLElement).closest("[data-event]")) return;

    startPos.value = options.toPosition(event);
    endPos.value = startPos.value;
    isDragging.value = true;
    wasDragged.value = false;
  }

  function onMouseMove(event: MouseEvent) {
    if (!isDragging.value) return;
    const pos = options.toPosition(event);
    if (pos !== startPos.value) {
      wasDragged.value = true;
    }
    endPos.value = pos;
  }

  function onMouseUp(_event: MouseEvent) {
    if (!isDragging.value) return;

    const start = selectionStart.value;
    const end = selectionEnd.value;

    isDragging.value = false;

    if (start !== null && end !== null) {
      const minDist = options.minDistance ?? 0;
      if (wasDragged.value && Math.abs(end - start) >= minDist) {
        options.onSelect(start, end);
      }
    }

    startPos.value = null;
    endPos.value = null;
    wasDragged.value = false;
  }

  // Watch for pressed becoming false (handles edge cases like mouse leaving window)
  watch(pressed, (isPressed) => {
    if (!isPressed && isDragging.value) {
      onMouseUp(new MouseEvent("mouseup"));
    }
  });

  onMounted(() => {
    const el = target.value;
    if (!el) return;
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseup", onMouseUp);
  });

  onUnmounted(() => {
    const el = target.value;
    if (!el) return;
    el.removeEventListener("mousedown", onMouseDown);
    el.removeEventListener("mousemove", onMouseMove);
    el.removeEventListener("mouseup", onMouseUp);
  });

  return {
    isDragging,
    startPos,
    endPos,
    selectionStart,
    selectionEnd,
  };
}
