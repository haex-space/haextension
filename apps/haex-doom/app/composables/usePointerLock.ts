const EV_MOUSE = 2;
// The three buttons Doom knows: left, right, middle are bits 0-2 of both `MouseEvent.buttons` and the engine's event.
const MOUSE_BUTTONS = 0b111;

/**
 * Mouse look for a mouse player (FR-009). A click on the target asks the browser to capture the
 * pointer; while it is captured the movement is sent to the engine as turning. A vault that does
 * not allow pointer capture refuses the request and nothing changes: the game stays playable by
 * keyboard, and no mouse option is shown anywhere. Esc releases the capture (the browser does that).
 */
export function usePointerLock(target: Ref<HTMLElement | null>) {
  const engine = useEngine();
  const locked = ref(false);

  async function lock(event: PointerEvent) {
    const element = target.value;
    if (!element || locked.value || event.pointerType === "touch" || !element.requestPointerLock) return;
    try {
      await element.requestPointerLock();
    } catch {
      // Refused (the vault does not allow it): play on without mouse look.
    }
  }

  function onChange() {
    locked.value = document.pointerLockElement === target.value;
    engine.setMouseMotionEnabled(!locked.value);
  }

  function onMove(event: MouseEvent) {
    if (!locked.value || event.movementX === 0) return;
    // Buttons ride along, because an event with none would release the fire button.
    engine.postEvent(EV_MOUSE, event.buttons & MOUSE_BUTTONS, event.movementX);
  }

  onMounted(() => {
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("mousemove", onMove);
  });
  onBeforeUnmount(() => {
    document.removeEventListener("pointerlockchange", onChange);
    document.removeEventListener("mousemove", onMove);
    if (locked.value) document.exitPointerLock();
    engine.setMouseMotionEnabled(true);
  });

  return { locked: readonly(locked), lock };
}
