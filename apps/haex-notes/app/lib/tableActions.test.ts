import { describe, expect, it } from "vitest";
import { computed } from "vue";
import type { TableElement } from "~/types/document";
import type { PageDoc } from "./commands";
import { createTableActions } from "./tableActions";
import { createUndoStack } from "./undoStack";

function setup() {
  const page: PageDoc = {
    id: "p1",
    layers: [{ id: "l1", name: "Ebene 1", visible: true, locked: false, elements: [] }],
    background: { paperColor: "#ffffff", template: "lined" },
    width: 794,
    height: 1123,
  };
  const stack = createUndoStack();
  const tables = createTableActions({
    currentDoc: computed(() => page),
    activeLayer: computed(() => page.layers[0]!),
    visibleElements: computed(() => page.layers[0]!.elements),
    runCommand: (command) => stack.push(command),
  });
  const position = (id: string) => {
    const table = page.layers[0]!.elements.find((e) => e.id === id) as TableElement;
    return [table.x, table.y];
  };
  const table = (id: string) => page.layers[0]!.elements.find((e) => e.id === id) as TableElement;
  return { stack, tables, position, table };
}

describe("resizeTable", () => {
  it("keeps drags of different tables as separate undo steps even with the same gesture id", () => {
    const { stack, tables, position } = setup();
    const a = tables.addTable(1, 1, 0, 0)!.id;
    const b = tables.addTable(1, 1, 300, 300)!.id;

    tables.resizeTable(a, "1", (t) => { t.x = 10; t.y = 10; });
    tables.resizeTable(b, "1", (t) => { t.x = 500; t.y = 500; });

    stack.undo();
    expect(position(a)).toEqual([10, 10]);
    expect(position(b)).toEqual([300, 300]);

    stack.redo();
    expect(position(a)).toEqual([10, 10]);
    expect(position(b)).toEqual([500, 500]);
  });

  it("folds all moves of one gesture into a single undo step", () => {
    const { stack, tables, position } = setup();
    const a = tables.addTable(1, 1, 0, 0)!.id;

    tables.resizeTable(a, "g", (t) => { t.x = 5; });
    tables.resizeTable(a, "g", (t) => { t.x = 15; });

    stack.undo();
    expect(position(a)).toEqual([0, 0]);
  });
});

describe("cells", () => {
  it("start empty, one per row and column", () => {
    const { tables } = setup();
    expect(tables.addTable(2, 3, 0, 0)!.cells).toEqual([["", "", ""], ["", "", ""]]);
  });

  it("follow added and removed rows and columns, keeping the text", () => {
    const { tables, table } = setup();
    const id = tables.addTable(1, 2, 0, 0)!.id;
    table(id).cells = [["Tag", "Fach"]];

    tables.addTableRow(id);
    tables.addTableColumn(id);
    expect(table(id).cells).toEqual([["Tag", "Fach", ""], ["", "", ""]]);

    tables.removeTableRow(id);
    tables.removeTableColumn(id);
    expect(table(id).cells).toEqual([["Tag", "Fach"]]);
  });

  it("are made for a table from an older version on its first change", () => {
    const { tables, table } = setup();
    const id = tables.addTable(1, 1, 0, 0)!.id;
    delete table(id).cells;

    tables.addTableRow(id);

    expect(table(id).cells).toEqual([[""], [""]]);
  });

  it("come back with an undo", () => {
    const { stack, tables, table } = setup();
    const id = tables.addTable(1, 1, 0, 0)!.id;
    tables.addTableColumn(id);

    stack.undo();

    expect(table(id).cells).toEqual([[""]]);
  });
});
