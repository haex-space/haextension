/**
 * Fullscreen for the game (FR-010). `document.fullscreenEnabled` is false in a frame that is not
 * allowed to, and a refused request switches the option off, so the button simply disappears
 * where it cannot work (an Android WebView may refuse). Esc leaves fullscreen by itself.
 */
export function useFullscreen(target: Ref<HTMLElement | null>) {
  const available = ref(
    typeof document !== "undefined"
    && typeof Element !== "undefined"
    && document.fullscreenEnabled === true
    && "requestFullscreen" in Element.prototype,
  );
  const active = ref(false);

  function onChange() {
    active.value = document.fullscreenElement === target.value;
  }

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.value?.requestFullscreen();
    } catch {
      available.value = false;
    }
  }

  onMounted(() => document.addEventListener("fullscreenchange", onChange));
  onBeforeUnmount(() => document.removeEventListener("fullscreenchange", onChange));

  return { available: readonly(available), active: readonly(active), toggle };
}
