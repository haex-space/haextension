import { computed, ref, shallowRef } from "vue";
import type { Command } from "./commands";

/**
 * Obergrenze der Undo-Tiefe. Kommandos halten Snapshots der betroffenen Elemente;
 * ohne Deckel wächst der Speicher über eine lange Sitzung unbegrenzt.
 */
export const MAX_UNDO_DEPTH = 100;

/**
 * Notizbuchweiter Undo-Stack.
 *
 * Bewusst nicht seitenweit: mit Continuous Scroll (Phase 5) wäre ein Stack pro
 * Seite verwirrend, und Xournal++ macht es genauso. Jedes Kommando trägt seine
 * pageId, damit die UI beim Undo zur richtigen Seite springen kann.
 *
 * Importiert `vue` explizit statt sich auf Nuxt-Autoimports zu verlassen, damit
 * die Unit-Tests ohne Nuxt laufen.
 */
export function createUndoStack(maxDepth: number = MAX_UNDO_DEPTH) {
  const commands = shallowRef<Command[]>([]);
  const index = ref(-1);

  const push = (command: Command) => {
    command.apply();

    // Alles hinter dem Cursor ist durch den neuen Zweig überholt.
    const next = commands.value.slice(0, index.value + 1);
    const top = next[next.length - 1];

    if (top && command.mergeKey && top.mergeKey === command.mergeKey && top.merge) {
      top.merge(command);
    } else {
      next.push(command);
      while (next.length > maxDepth) next.shift();
    }

    commands.value = next;
    index.value = next.length - 1;
  };

  const undo = (): Command | null => {
    if (index.value < 0) return null;
    const command = commands.value[index.value]!;
    command.revert();
    index.value--;
    return command;
  };

  const redo = (): Command | null => {
    if (index.value >= commands.value.length - 1) return null;
    index.value++;
    const command = commands.value[index.value]!;
    command.apply();
    return command;
  };

  const clear = () => {
    commands.value = [];
    index.value = -1;
  };

  return {
    commands: computed(() => commands.value),
    canUndo: computed(() => index.value >= 0),
    canRedo: computed(() => index.value < commands.value.length - 1),
    undoLabel: computed(() => commands.value[index.value]?.label ?? null),
    redoLabel: computed(() => commands.value[index.value + 1]?.label ?? null),
    push,
    undo,
    redo,
    clear,
  };
}

export type UndoStack = ReturnType<typeof createUndoStack>;
