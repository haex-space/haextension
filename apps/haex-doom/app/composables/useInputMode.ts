export type InputMode = "touch" | "pointer" | "keyboard" | "gamepad";

const mode = ref<InputMode>("keyboard");
let listening = false;

function startListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  if (window.matchMedia("(pointer: coarse)").matches) mode.value = "touch";

  // Capture phase, so the engine's own listeners cannot hide the event from us.
  window.addEventListener("pointerdown", (event) => {
    mode.value = event.pointerType === "touch" ? "touch" : "pointer";
  }, true);
  window.addEventListener("keydown", () => {
    mode.value = "keyboard";
  }, true);
  // Only a real mouse leaves touch mode; touch input never reports pointerType "mouse".
  window.addEventListener("pointermove", (event) => {
    if (mode.value === "touch" && event.pointerType === "mouse") mode.value = "pointer";
  }, true);
}

let beforeGamepad: InputMode = "keyboard";

/** A gamepad was used; remembers the mode to return to when it goes away. */
function gamepadUsed() {
  if (mode.value !== "gamepad") beforeGamepad = mode.value;
  mode.value = "gamepad";
}

function gamepadGone() {
  if (mode.value === "gamepad") mode.value = beforeGamepad;
}

/**
 * The input the player used last (FR-016); the touch overlay shows only in touch mode. One
 * shared state per page, because there is only one player in front of it.
 */
export function useInputMode() {
  startListening();
  return { mode: readonly(mode), gamepadUsed, gamepadGone };
}
