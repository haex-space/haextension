import { describe, expect, it } from "vitest";
import type { Command } from "./commands";
import { createUndoStack } from "./undoStack";

/** Minimalkommando, das einen Zähler hoch- und wieder runterzählt. */
function counterCommand(state: { value: number }, delta: number, mergeKey?: string): Command {
  const deltas = [delta];
  return {
    label: `add ${delta}`,
    pageId: "p1",
    mergeKey,
    apply() {
      for (const d of deltas) state.value += d;
    },
    revert() {
      for (const d of deltas) state.value -= d;
    },
    merge(next) {
      deltas.push(...((next as unknown as { deltas: number[] }).deltas ?? []));
    },
    // Für den merge-Test von außen erreichbar.
    ...({ deltas } as object),
  } as Command;
}

describe("createUndoStack", () => {
  it("applies a command when it is pushed", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 5));
    expect(state.value).toBe(5);
    expect(stack.canUndo.value).toBe(true);
    expect(stack.canRedo.value).toBe(false);
  });

  it("undoes and redoes", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 5));
    stack.undo();
    expect(state.value).toBe(0);
    expect(stack.canRedo.value).toBe(true);
    stack.redo();
    expect(state.value).toBe(5);
  });

  it("drops the redo tail when a new command arrives after an undo", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 5));
    stack.push(counterCommand(state, 3));
    stack.undo();
    stack.push(counterCommand(state, 100));
    expect(state.value).toBe(105);
    expect(stack.canRedo.value).toBe(false);
  });

  it("coalesces consecutive commands with the same merge key", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 1, "drag"));
    stack.push(counterCommand(state, 2, "drag"));
    stack.push(counterCommand(state, 4, "drag"));
    expect(state.value).toBe(7);

    stack.undo();
    expect(state.value).toBe(0);
    expect(stack.canUndo.value).toBe(false);
  });

  it("does not coalesce across different merge keys", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 1, "drag-a"));
    stack.push(counterCommand(state, 2, "drag-b"));
    stack.undo();
    expect(state.value).toBe(1);
  });

  it("caps the stack depth and drops the oldest entry", () => {
    const state = { value: 0 };
    const stack = createUndoStack(2);
    stack.push(counterCommand(state, 1));
    stack.push(counterCommand(state, 2));
    stack.push(counterCommand(state, 4));
    expect(stack.commands.value).toHaveLength(2);
    stack.undo();
    stack.undo();
    // Der erste Schritt ist nicht mehr rücknehmbar.
    expect(state.value).toBe(1);
    expect(stack.canUndo.value).toBe(false);
  });

  it("clears", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 5));
    stack.clear();
    expect(stack.canUndo.value).toBe(false);
    expect(stack.commands.value).toHaveLength(0);
  });
});
