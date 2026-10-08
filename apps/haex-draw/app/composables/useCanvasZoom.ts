import { useEventListener } from "@vueuse/core";

/**
 * Handles wheel zoom (towards the cursor) and two-finger pinch zoom/pan on the canvas.
 */
export function useCanvasZoom(canvasEl: Ref<HTMLCanvasElement | null>) {
  const canvas = useCanvasStore();

  // Pinch zoom state
  const lastPinchDist = ref(0);
  const lastPinchCenter = ref({ x: 0, y: 0 });

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
  /** The two touches of a pinch; `null` unless exactly two fingers are down. */
  const pinchOf = (e: TouchEvent): [Touch, Touch] | null => {
    const [a, b] = [e.touches[0], e.touches[1]];
    return e.touches.length === 2 && a && b ? [a, b] : null;
  };

  const onTouchStart = (e: TouchEvent) => {
    const pinch = pinchOf(e);
    if (pinch) {
      const [a, b] = pinch;
      e.preventDefault();
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      lastPinchDist.value = Math.hypot(dx, dy);
      lastPinchCenter.value = {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    const pinch = pinchOf(e);
    if (pinch) {
      const [a, b] = pinch;
      e.preventDefault();
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      const dist = Math.hypot(dx, dy);

      const centerX = (a.clientX + b.clientX) / 2;
      const centerY = (a.clientY + b.clientY) / 2;

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

  useEventListener(canvasEl, "wheel", onWheel, { passive: false });
  useEventListener(canvasEl, "touchstart", onTouchStart, { passive: false });
  useEventListener(canvasEl, "touchmove", onTouchMove, { passive: false });
  useEventListener(canvasEl, "touchend", onTouchEnd);
}
