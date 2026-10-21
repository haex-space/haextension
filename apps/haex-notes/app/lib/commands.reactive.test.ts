import { describe, expect, it } from "vitest";
import { computed, reactive, ref } from "vue";
import type { PageLayer, StrokeElement } from "~/types/document";
import {
  addElements,
  addLayer,
  moveLayer,
  mutateElements,
  mutateLayer,
  removeElements,
  removeLayer,
  replaceElements,
  setPageBackground,
  type PageDoc,
} from "./commands";
import { serializePageDoc } from "./migratePage";
import { createTableActions } from "./tableActions";
import { createUndoStack } from "./undoStack";

/**
 * Der Store hält Seiten in `reactive(new Map())` und den Live-Strich in einem
 * Ref des Pinia-Stores. Die Kommandos sehen in der App also immer Vue-Proxies,
 * nie die einfachen Objekte aus commands.test.ts.
 */
const stroke = (id: string): StrokeElement => ({
  id,
  type: "stroke",
  points: [[0, 0, 0.5], [10, 10, 0.5]],
  color: "#000000",
  size: 2,
  tool: "brush",
  bbox: [-1, -1, 12, 12],
});

function reactiveDoc(...ids: string[]): PageDoc {
  const docs = reactive(new Map<string, PageDoc>());
  docs.set("p1", {
    id: "p1",
    layers: [{ id: "l1", name: "Ebene 1", visible: true, locked: false, elements: ids.map(stroke) }],
    background: { paperColor: "#ffffff", template: "lined" },
    width: 794,
    height: 1123,
  });
  return docs.get("p1")!;
}

/** So wie PageCanvas den Strich beim pointerup aus dem Store holt. */
function liveStroke(id: string): StrokeElement {
  // Pinia packt die Refs eines Setup-Stores in ein reactive()-Objekt.
  const store = reactive({ currentStroke: ref<StrokeElement | null>(null) });
  store.currentStroke = stroke(id);
  store.currentStroke.points.push([20, 20, 0.5]);
  return { ...store.currentStroke };
}

const layer = (id: string): PageLayer => ({ id, name: id, visible: true, locked: false, elements: [] });

const savedIds = (page: PageDoc) =>
  serializePageDoc(page).layers.flatMap((l) => l.elements.map((e) => e.id));

describe("commands on reactive store state", () => {
  it("adds a live stroke and saves it", () => {
    const page = reactiveDoc("a");
    const cmd = addElements(page, "l1", [liveStroke("b")], "Strich");
    cmd.apply();
    expect(savedIds(page)).toEqual(["a", "b"]);
    expect(serializePageDoc(page).strokes[1]!.points).toHaveLength(3);
  });

  it("saves after undoing one of several added elements", () => {
    const page = reactiveDoc("a", "b");
    const cmd = addElements(page, "l1", [stroke("c")], "Strich");
    cmd.apply();
    cmd.revert();
    expect(savedIds(page)).toEqual(["a", "b"]);
    cmd.apply();
    expect(savedIds(page)).toEqual(["a", "b", "c"]);
  });

  it("removes, replaces and restores elements", () => {
    const page = reactiveDoc("a", "b", "c");
    const remove = removeElements(page, ["b"], "Löschen");
    remove.apply();
    expect(savedIds(page)).toEqual(["a", "c"]);
    remove.revert();
    expect(savedIds(page)).toEqual(["a", "b", "c"]);

    const replace = replaceElements(page, "l1", ["a"], [stroke("x")], "Radieren");
    replace.apply();
    expect(savedIds(page)).toEqual(["b", "c", "x"]);
    replace.revert();
    expect(savedIds(page)).toEqual(["a", "b", "c"]);
  });

  it("mutates elements through the undo stack", () => {
    const page = reactiveDoc("a");
    const stack = createUndoStack();
    const grow = () =>
      mutateElements(page, ["a"], (el) => { if (el.type === "stroke") el.size += 1; }, "Größe", "drag");
    stack.push(grow());
    stack.push(grow());
    expect(serializePageDoc(page).strokes[0]!.size).toBe(4);
    stack.undo();
    expect(serializePageDoc(page).strokes[0]!.size).toBe(2);
    stack.redo();
    expect(serializePageDoc(page).strokes[0]!.size).toBe(4);
  });

  it("adds, moves, edits and removes layers", () => {
    const page = reactiveDoc("a");
    const add = addLayer(page, layer("l2"), undefined, "Ebene");
    add.apply();
    const move = moveLayer(page, "l2", 0, "Ebene verschieben");
    move.apply();
    const hide = mutateLayer(page, "l1", { visible: false }, "Ebene ausblenden");
    hide.apply();
    expect(serializePageDoc(page).layers.map((l) => [l.id, l.visible])).toEqual([["l2", true], ["l1", false]]);

    hide.revert();
    move.revert();
    const remove = removeLayer(page, "l2", "Ebene löschen");
    remove.apply();
    expect(serializePageDoc(page).layers.map((l) => l.id)).toEqual(["l1"]);
    remove.revert();
    add.revert();
    expect(serializePageDoc(page).layers.map((l) => l.id)).toEqual(["l1"]);
  });

  it("changes the background", () => {
    const page = reactiveDoc();
    const cmd = setPageBackground(page, { ...page.background, template: "grid" }, "Vorlage");
    cmd.apply();
    expect(serializePageDoc(page).background.template).toBe("grid");
    cmd.revert();
    expect(serializePageDoc(page).template).toBe("lined");
  });

  it("runs every table action and its undo", () => {
    const page = reactiveDoc();
    const stack = createUndoStack();
    const tables = createTableActions({
      currentDoc: computed(() => page),
      activeLayer: computed(() => page.layers[0]!),
      runCommand: (command) => stack.push(command),
    });

    const id = tables.addTable(2, 2, 10, 10)!.id;
    tables.addTable(1, 1, 300, 300);
    tables.addTableRow(id);
    tables.addTableColumn(id);
    tables.removeTableRow(id);
    tables.removeTableColumn(id);
    tables.resizeTable(id, "gesture", (t) => { t.x = 50; });
    tables.removeTable(id);
    expect(serializePageDoc(page).tables).toHaveLength(1);

    while (stack.canUndo.value) {
      stack.undo();
      expect(() => serializePageDoc(page)).not.toThrow();
    }
    expect(serializePageDoc(page).tables).toHaveLength(0);
  });
});
