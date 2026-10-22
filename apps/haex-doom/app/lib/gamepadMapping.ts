import { AXIS_MAX, DEAD_ZONE, stickToAxes, VIRTUAL_BUTTONS, type VirtualButton } from "./touchMapping";

/**
 * Buttons of the W3C "standard" gamepad layout for each virtual button. A and RT fire, and fire
 * also confirms in the engine's menus; B and X use, and use also goes back there.
 */
const PAD_BUTTONS: Record<VirtualButton, readonly number[]> = {
  fire: [0, 7],
  use: [1, 2],
  prevWeapon: [4],
  nextWeapon: [5],
  automap: [8],
  menu: [9],
};

// D-pad buttons of the standard layout and their JOY_DIR_* bits (upstream src/i_joystick.h, shift 0).
const DPAD: readonly [number, number][] = [[12, 0x1], [13, 0x2], [14, 0x4], [15, 0x8]];

/** Analog triggers report a value; below this they count as released. */
const TRIGGER_THRESHOLD = 0.3;

export interface PadButton {
  pressed: boolean;
  value: number;
}

export interface PadState {
  buttons: number;
  turn: number;
  move: number;
  strafe: number;
  directions: number;
}

export const IDLE_PAD: PadState = { buttons: 0, turn: 0, move: 0, strafe: 0, directions: 0 };

function isDown(button: PadButton | undefined): boolean {
  return !!button && (button.pressed || button.value > TRIGGER_THRESHOLD);
}

/** A single axis with the dead zone removed, scaled to the engine's range. */
function axis(value: number | undefined): number {
  const v = value ?? 0;
  if (Math.abs(v) <= DEAD_ZONE) return 0;
  return Math.round((Math.sign(v) * (Math.min(Math.abs(v), 1) - DEAD_ZONE)) / (1 - DEAD_ZONE) * AXIS_MAX);
}

/** Maps a standard-layout gamepad to the engine's joystick event (left stick moves, right stick turns). */
export function padToState(buttons: readonly PadButton[], axes: readonly number[]): PadState {
  let mask = 0;
  for (const [virtual, physical] of Object.entries(PAD_BUTTONS) as [VirtualButton, readonly number[]][]) {
    if (physical.some((index) => isDown(buttons[index]))) mask |= 1 << VIRTUAL_BUTTONS[virtual];
  }

  const stick = stickToAxes(axes[0] ?? 0, axes[1] ?? 0, 1);
  let directions = stick.directions;
  for (const [index, bit] of DPAD) {
    if (isDown(buttons[index])) directions |= bit;
  }

  return { buttons: mask, turn: axis(axes[2]), move: stick.move, strafe: stick.strafe, directions };
}

export function samePadState(a: PadState, b: PadState): boolean {
  return a.buttons === b.buttons && a.turn === b.turn && a.move === b.move && a.strafe === b.strafe && a.directions === b.directions;
}
