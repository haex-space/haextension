/**
 * Turns touch input into the engine's joystick and mouse events (contracts/engine-bridge.md).
 * The overlay is a virtual gamepad: the engine's menus already follow joystick directions and
 * buttons, so the same events drive both play and menus.
 */

/** Full deflection of a joystick axis (the engine's FRACUNIT). */
export const AXIS_MAX = 65536;

/** Below this share of the stick radius, the stick counts as centred. */
export const DEAD_ZONE = 0.15;

/** Mouse units per CSS pixel of swipe at sensitivity 1: about a quarter turn per 200 px. */
export const TURN_UNITS_PER_PX = 10;

/** Joystick button bits of the virtual gamepad (touch overlay and real pads; `jump` has a pad button only); they must match the `joyb_*` values in engine/config/*.cfg. */
export const VIRTUAL_BUTTONS = {
  fire: 0,
  use: 1,
  menu: 2,
  automap: 3,
  prevWeapon: 4,
  nextWeapon: 5,
  jump: 6,
} as const;

export type VirtualButton = keyof typeof VIRTUAL_BUTTONS;

// JOY_DIR_* of upstream src/i_joystick.h; the left stick sits at bit 4.
const DIR_UP = 0x1;
const DIR_DOWN = 0x2;
const DIR_LEFT = 0x4;
const DIR_RIGHT = 0x8;
const LSTICK_SHIFT = 4;
/** Share of the radius a direction needs before the menus see it. */
const MENU_DIRECTION_THRESHOLD = 0.5;

export interface StickAxes {
  strafe: number;
  /** Positive moves backward, as the engine's joystick axis does. */
  move: number;
  /** Direction bits for the menus, already shifted into place. */
  directions: number;
}

const CENTRED: StickAxes = { strafe: 0, move: 0, directions: 0 };

/** Maps a stick deflection in pixels (screen coordinates, y down) to engine axes. */
export function stickToAxes(dx: number, dy: number, radius: number): StickAxes {
  const length = Math.hypot(dx, dy);
  if (!(radius > 0) || !(length > 0)) return CENTRED;

  const deflection = Math.min(length / radius, 1);
  if (deflection <= DEAD_ZONE) return CENTRED;

  const strength = (deflection - DEAD_ZONE) / (1 - DEAD_ZONE);
  const x = (dx / length) * strength;
  const y = (dy / length) * strength;
  return {
    strafe: Math.round(x * AXIS_MAX),
    move: Math.round(y * AXIS_MAX),
    directions: menuDirections(x, y) << LSTICK_SHIFT,
  };
}

function menuDirections(x: number, y: number): number {
  let bits = 0;
  if (y <= -MENU_DIRECTION_THRESHOLD) bits |= DIR_UP;
  if (y >= MENU_DIRECTION_THRESHOLD) bits |= DIR_DOWN;
  if (x <= -MENU_DIRECTION_THRESHOLD) bits |= DIR_LEFT;
  if (x >= MENU_DIRECTION_THRESHOLD) bits |= DIR_RIGHT;
  return bits;
}

/** Buttons the menus and the automap act on in every event that carries them. */
const TOGGLE_BUTTONS = (1 << VIRTUAL_BUTTONS.menu) | (1 << VIRTUAL_BUTTONS.automap);

export interface JoystickState {
  buttons: number;
  directions: number;
}

/**
 * The buttons and directions to send for a new state. The menus and the automap react to every
 * joystick event, not to changes, so a held Menu or Map button or a held menu direction would
 * repeat with each stick movement; they go out only on the event where they change.
 */
export function joystickEvent(next: JoystickState, last: JoystickState): JoystickState {
  return {
    buttons: (next.buttons & ~TOGGLE_BUTTONS) | (next.buttons & ~last.buttons & TOGGLE_BUTTONS),
    directions: next.directions !== last.directions ? next.directions : 0,
  };
}

/** The engine's button bitfield for the pressed overlay buttons. */
export function buttonMask(pressed: Iterable<VirtualButton>): number {
  let mask = 0;
  for (const button of pressed) mask |= 1 << VIRTUAL_BUTTONS[button];
  return mask;
}

/**
 * Whole mouse units for a horizontal swipe; the fraction is carried into the next call so slow
 * swipes still turn. Swiping right turns right, which is a positive mouse movement.
 */
export function swipeToTurn(deltaPx: number, sensitivity: number, carry: number): { turn: number; carry: number } {
  const units = deltaPx * TURN_UNITS_PER_PX * sensitivity + carry;
  const turn = Math.trunc(units);
  return { turn, carry: units - turn };
}
