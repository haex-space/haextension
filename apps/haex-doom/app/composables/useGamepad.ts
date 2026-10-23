import { IDLE_PAD, padToState, samePadState, type PadState } from "~/lib/gamepadMapping";
import { joystickEvent } from "~/lib/touchMapping";

const EV_JOYSTICK = 3;

/**
 * Reads gamepads through the Gamepad API once per frame and drives the engine like the touch
 * overlay does (research R-15). The engine only looks for a pad at start, while browsers reveal
 * a pad only after its first button press, so the shell does the polling.
 */
export function useGamepad(onDisconnected: () => void) {
  const engine = useEngine();
  const { gamepadUsed, gamepadGone } = useInputMode();
  let last: PadState = IDLE_PAD;
  let frame = 0;

  // Menu and Map buttons and menu directions act on every joystick event in the engine, so they
  // go out only on the event where they change (see joystickEvent).
  function send(state: PadState) {
    const sent = joystickEvent(state, last);
    last = state;
    engine.postEvent(EV_JOYSTICK, sent.buttons, state.turn, state.move, state.strafe, 0, sent.directions);
  }

  function poll() {
    frame = requestAnimationFrame(poll);
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    if (!pad) return;
    const state = padToState(pad.buttons, pad.axes);
    if (samePadState(state, last)) return;
    send(state);
    if (!samePadState(state, IDLE_PAD)) gamepadUsed();
  }

  function onDisconnect() {
    if (navigator.getGamepads?.().some((p) => p?.connected)) return;
    send(IDLE_PAD);
    gamepadGone();
    onDisconnected();
  }

  onMounted(() => {
    if (typeof navigator.getGamepads !== "function") return;
    window.addEventListener("gamepaddisconnected", onDisconnect);
    frame = requestAnimationFrame(poll);
  });

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    window.removeEventListener("gamepaddisconnected", onDisconnect);
  });
}
