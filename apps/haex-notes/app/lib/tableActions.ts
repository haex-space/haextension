import { computed, type ComputedRef } from "vue";
import type { PageElement, PageLayer, TableElement } from "~/types/document";
import { addElements, mutateElements, removeElements, type Command, type PageDoc } from "./commands";
import { computeBbox } from "./bbox";

interface TableActionsContext {
  currentDoc: ComputedRef<PageDoc | null>;
  activeLayer: ComputedRef<PageLayer | null>;
  visibleElements: ComputedRef<PageElement[]>;
  runCommand: (command: Command) => void;
}

/** Tabellen-Aktionen des Notizbuch-Stores; jede Änderung läuft als Kommando über den Undo-Stack. */
export function createTableActions({ currentDoc, activeLayer, visibleElements, runCommand }: TableActionsContext) {
  const tableElements = computed(() =>
    visibleElements.value.filter((e): e is TableElement => e.type === "table"),
  );

  const addTable = (rows: number, cols: number, x: number, y: number): TableElement | null => {
    const doc = currentDoc.value;
    const layer = activeLayer.value;
    if (!doc || !layer) return null;

    const table: TableElement = {
      id: crypto.randomUUID(),
      type: "table",
      x,
      y,
      columns: cols,
      rows,
      columnWidths: Array(cols).fill(80),
      rowHeights: Array(rows).fill(30),
      bbox: [0, 0, 0, 0],
    };
    table.bbox = computeBbox(table);
    runCommand(addElements(doc, layer.id, [table], "Tabelle"));
    // addElements cloned the input; return the live element from the layer so
    // callers cannot accidentally mutate a detached copy.
    const live = layer.elements.find((e) => e.id === table.id);
    return live?.type === "table" ? live : null;
  };

  const removeTable = (id: string) => {
    const doc = currentDoc.value;
    if (!doc) return;
    runCommand(removeElements(doc, [id], "Tabelle löschen"));
  };

  /** Gemeinsamer Weg für alle Tabellenänderungen: ein mutate-Kommando. */
  const mutateTable = (id: string, label: string, mutate: (t: TableElement) => void, mergeKey?: string) => {
    const doc = currentDoc.value;
    if (!doc) return;
    runCommand(
      mutateElements(
        doc,
        [id],
        (element) => {
          if (element.type !== "table") return;
          mutate(element);
          element.bbox = computeBbox(element);
        },
        label,
        mergeKey,
      ),
    );
  };

  const addTableRow = (id: string) =>
    mutateTable(id, "Zeile hinzufügen", (t) => { t.rows++; t.rowHeights.push(30); });

  const addTableColumn = (id: string) =>
    mutateTable(id, "Spalte hinzufügen", (t) => { t.columns++; t.columnWidths.push(80); });

  const removeTableRow = (id: string) =>
    mutateTable(id, "Zeile entfernen", (t) => {
      if (t.rows <= 1) return;
      t.rows--;
      t.rowHeights.pop();
    });

  const removeTableColumn = (id: string) =>
    mutateTable(id, "Spalte entfernen", (t) => {
      if (t.columns <= 1) return;
      t.columns--;
      t.columnWidths.pop();
    });

  /**
   * Live-Feedback beim Ziehen einer Tabellenlinie. Alle Aufrufe einer Geste teilen
   * sich denselben mergeKey und werden zu einem Undo-Schritt.
   */
  const resizeTable = (id: string, gestureId: string, mutate: (t: TableElement) => void) =>
    mutateTable(id, "Tabelle anpassen", mutate, `table-resize:${gestureId}`);

  return {
    tableElements,
    addTable,
    removeTable,
    addTableRow,
    addTableColumn,
    removeTableRow,
    removeTableColumn,
    resizeTable,
  };
}
