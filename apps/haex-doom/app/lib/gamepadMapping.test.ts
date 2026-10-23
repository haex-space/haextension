import { describe, expect, it } from "vitest";
import { IDLE_PAD, padToState, type PadButton } from "./gamepadMapping";
import { AXIS_MAX } from "./touchMapping";

function pad(pressed: number[] = [], values: Record<number, number> = {}): PadButton[] {
  return Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: values[i] ?? (pressed.includes(i) ? 1 : 0) }));
}

describe("padToState", () => {
  it("is idle for a pad at rest", () => {
    expect(padToState(pad(), [0.05, -0.05, 0.1, 0])).toEqual(IDLE_PAD);
  });

  it("fires with A or the right trigger, and uses with B or X", () => {
    expect(padToState(pad([0]), []).buttons).toBe(1 << 0);
    expect(padToState(pad([], { 7: 0.8 }), []).buttons).toBe(1 << 0);
    expect(padToState(pad([], { 7: 0.2 }), []).buttons).toBe(0);
    expect(padToState(pad([2]), []).buttons).toBe(1 << 1);
  });

  it("maps shoulders, back and start to weapons, automap and menu", () => {
    expect(padToState(pad([4, 5, 8, 9]), []).buttons).toBe((1 << 4) | (1 << 5) | (1 << 3) | (1 << 2));
  });

  it("moves with the left stick and turns with the right stick", () => {
    const state = padToState(pad(), [1, -1, -1, 0]);
    expect(state.strafe).toBeGreaterThan(0);
    expect(state.move).toBeLessThan(0);
    expect(state.turn).toBe(-AXIS_MAX);
  });

  it("drives the menus with the d-pad and the left stick", () => {
    expect(padToState(pad([12]), []).directions).toBe(0x1);
    expect(padToState(pad(), [0, 1]).directions).toBe(0x2 << 4);
  });
});
