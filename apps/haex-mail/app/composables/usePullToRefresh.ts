import { useEventListener } from "@vueuse/core";
import type { Ref } from "vue";

/** Pull distance (px, after resistance) that triggers a refresh on release. */
const THRESHOLD = 64;
const MAX_DISTANCE = 96;
/** Finger travel → indicator travel, so the pull feels weighted. */
const RESISTANCE = 0.5;

/**
 * Touch pull-to-refresh for a scroll container: dragging down while it is
 * scrolled to the very top reveals the indicator, releasing past the
 * threshold runs `onRefresh` and holds the indicator until it settles.
 */
export const usePullToRefresh = (
  target: Ref<HTMLElement | null>,
  onRefresh: () => Promise<void>,
) => {
  const distance = ref(0);
  const isPulling = ref(false);
  const isRefreshing = ref(false);
  let startY = 0;

  const reset = () => {
    isPulling.value = false;
    distance.value = 0;
  };

  useEventListener(
    target,
    "touchstart",
    (e: TouchEvent) => {
      if (isRefreshing.value || e.touches.length !== 1 || target.value?.scrollTop) return;
      startY = e.touches[0]!.clientY;
      isPulling.value = true;
    },
    { passive: true },
  );

  useEventListener(
    target,
    "touchmove",
    (e: TouchEvent) => {
      if (!isPulling.value) return;
      const delta = e.touches[0]!.clientY - startY;
      // Scrolling up into the list — hand the gesture back to native scroll.
      if (target.value?.scrollTop || (delta <= 0 && distance.value === 0)) {
        reset();
        return;
      }
      // Suppress native overscroll/bounce while we own the gesture.
      if (e.cancelable) e.preventDefault();
      distance.value = Math.min(Math.max(delta, 0) * RESISTANCE, MAX_DISTANCE);
    },
    { passive: false },
  );

  useEventListener(target, "touchend", async () => {
    if (!isPulling.value) return;
    const triggered = distance.value >= THRESHOLD;
    isPulling.value = false;
    if (!triggered) {
      distance.value = 0;
      return;
    }
    isRefreshing.value = true;
    distance.value = THRESHOLD;
    try {
      await onRefresh();
    } finally {
      isRefreshing.value = false;
      distance.value = 0;
    }
  });

  useEventListener(target, "touchcancel", reset);

  return { distance, isPulling, isRefreshing, threshold: THRESHOLD };
};
