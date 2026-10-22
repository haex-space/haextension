import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AXIS_MAX, buttonMask, stickToAxes, swipeToTurn, VIRTUAL_BUTTONS } from "./touchMapping";

describe("stickToAxes", () => {
  it("stays centred inside the dead zone", () => {
    expect(stickToAxes(5, 5, 100)).toEqual({ strafe: 0, move: 0, directions: 0 });
  });

  it("reaches full deflection at the radius and clamps beyond it", () => {
    expect(stickToAxes(0, -100, 100)).toEqual({ strafe: 0, move: -AXIS_MAX, directions: 0x1 << 4 });
    expect(stickToAxes(250, 0, 100)).toEqual({ strafe: AXIS_MAX, move: 0, directions: 0x8 << 4 });
  });

  it("scales between the dead zone and the radius", () => {
    const partial = stickToAxes(0, 60, 100);
    expect(partial.move).toBe(Math.round(((0.6 - 0.15) / 0.85) * AXIS_MAX));
    expect(partial.directions).toBe(0x2 << 4);
  });

  it("reports no menu direction for a small push", () => {
    expect(stickToAxes(-30, 0, 100).directions).toBe(0);
  });

  it("treats a missing radius as centred", () => {
    expect(stickToAxes(50, 50, 0)).toEqual({ strafe: 0, move: 0, directions: 0 });
  });
});

describe("buttonMask", () => {
  it("sets one bit per pressed button", () => {
    expect(buttonMask([])).toBe(0);
    expect(buttonMask(["fire", "nextWeapon"])).toBe(0b100001);
  });
});

describe("swipeToTurn", () => {
  it("carries fractions so slow swipes still turn", () => {
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const step = swipeToTurn(0.05, 1, carry);
      total += step.turn;
      carry = step.carry;
    }
    expect(total).toBe(5);
  });

  it("turns left for a leftward swipe", () => {
    expect(swipeToTurn(-3, 2, 0)).toEqual({ turn: -60, carry: 0 });
  });
});

describe("engine config", () => {
  it("binds the touch buttons to the joystick buttons the overlay sends", () => {
    const config = (name: string) =>
      readFileSync(fileURLToPath(new URL(`../../engine/config/${name}`, import.meta.url)), "utf8");
    const all = config("default.cfg") + config("crispy-doom.cfg");
    const bound = (name: string) => Number(all.match(new RegExp(`^${name}\\s+(-?\\d+)`, "m"))?.[1] ?? 0);

    // joyb_fire is not in the file because the engine's default (0) is used.
    expect(VIRTUAL_BUTTONS.fire).toBe(0);
    expect(bound("joyb_use")).toBe(VIRTUAL_BUTTONS.use);
    expect(bound("joyb_menu_activate")).toBe(VIRTUAL_BUTTONS.menu);
    expect(bound("joyb_toggle_automap")).toBe(VIRTUAL_BUTTONS.automap);
    expect(bound("joyb_prevweapon")).toBe(VIRTUAL_BUTTONS.prevWeapon);
    expect(bound("joyb_nextweapon")).toBe(VIRTUAL_BUTTONS.nextWeapon);
  });
});
