import { eq, asc, isNull, isNotNull, and } from "drizzle-orm";
import { notebooks, pages, type SelectNotebook, type SelectPage, type PageTemplate } from "~/database/schemas";
import { FULL_PAGES_TABLE } from "~/stores/spaces";
import { reactive, toRaw } from "vue";
import type { PageElement, PageLayer, StrokeElement, TableElement } from "~/types/document";
import {
  addElements,
  mutateElements,
  removeElements,
  setPageBackground,
  type Command,
  type PageDoc,
} from "~/lib/commands";
import { computeBbox } from "~/lib/bbox";
import { migratePageRow } from "~/lib/migratePage";
import { createUndoStack } from "~/lib/undoStack";

export const useNotebookStore = defineStore("notebook", () => {
  const haexVault = useHaexVaultStore();

  // Current notebook
  const currentNotebook = ref<SelectNotebook | null>(null);
  const currentPages = ref<SelectPage[]>([]);
  const currentPageIndex = ref(0);
  const isDirty = ref(false);

  const currentPage = computed(() => currentPages.value[currentPageIndex.value] ?? null);
  const pageCount = computed(() => currentPages.value.length);

  /** Dokumentzustand je Seite, aufgebaut beim ersten Öffnen der Seite. */
  const docs = reactive(new Map<string, PageDoc>());
  const undoStack = createUndoStack();

  const currentDoc = computed(() => {
    const page = currentPage.value;
    return page ? docs.get(page.id) ?? null : null;
  });

  /** Aktiver Layer für neue Elemente. In Phase 2 vom Layer-Panel gesetzt. */
  const activeLayerId = ref<string | null>(null);

  const activeLayer = computed<PageLayer | null>(() => {
    const doc = currentDoc.value;
    if (!doc) return null;
    return doc.layers.find((l) => l.id === activeLayerId.value) ?? doc.layers[0] ?? null;
  });

  /** Elemente aller sichtbaren Layer, in Zeichenreihenfolge. */
  const visibleElements = computed<PageElement[]>(() => {
    const doc = currentDoc.value;
    if (!doc) return [];
    return doc.layers.filter((l) => l.visible).flatMap((l) => l.elements);
  });

  /** Live gezeichneter Strich, noch nicht committet. */
  const currentStroke = ref<StrokeElement | null>(null);
  const isDrawing = ref(false);

  const runCommand = (command: Command) => {
    undoStack.push(command);
    isDirty.value = true;
  };

  const undo = () => {
    if (undoStack.undo()) isDirty.value = true;
  };
  const redo = () => {
    if (undoStack.redo()) isDirty.value = true;
  };

  const canUndo = undoStack.canUndo;
  const canRedo = undoStack.canRedo;

  // --- Notebook CRUD ---

  const listNotebooksAsync = async (): Promise<SelectNotebook[]> => {
    const db = haexVault.orm;
    if (!db) return [];
    return db.select().from(notebooks).orderBy(asc(notebooks.updatedAt));
  };

  const createNotebookAsync = async (name: string, template: PageTemplate = "lined", coverColor = "#3b82f6") => {
    const db = haexVault.orm;
    if (!db) return null;

    const id = crypto.randomUUID();
    await db.insert(notebooks).values({ id, name, defaultTemplate: template, coverColor });

    // Create first page
    const pageId = crypto.randomUUID();
    await db.insert(pages).values({ id: pageId, notebookId: id, pageNumber: 0, template });

    return id;
  };

  const deleteNotebookAsync = async (id: string) => {
    const db = haexVault.orm;
    if (!db) return;
    // Delete all pages first
    const notebookPages = await db.select().from(pages).where(eq(pages.notebookId, id));
    for (const p of notebookPages) {
      await db.delete(pages).where(eq(pages.id, p.id));
    }
    await db.delete(notebooks).where(eq(notebooks.id, id));
  };

  const renameNotebookAsync = async (id: string, name: string) => {
    const db = haexVault.orm;
    if (!db) return;
    await db.update(notebooks).set({ name }).where(eq(notebooks.id, id));
    if (currentNotebook.value?.id === id) {
      currentNotebook.value.name = name;
    }
  };

  // --- Page navigation ---

  const openNotebookAsync = async (id: string) => {
    const db = haexVault.orm;
    if (!db) return false;

    const result = await db.select().from(notebooks).where(eq(notebooks.id, id));
    if (result.length === 0) return false;

    currentNotebook.value = result[0]!;
    const allPages = await db.select().from(pages).where(and(eq(pages.notebookId, id), isNull(pages.deletedAt))).orderBy(asc(pages.pageNumber));
    currentPages.value = allPages;
    currentPageIndex.value = 0;
    loadPageIntoState();
    return true;
  };

  const loadPageIntoState = () => {
    const page = currentPage.value;
    if (!page) return;
    if (!docs.has(page.id)) {
      const migrated = migratePageRow(page);
      docs.set(page.id, { id: page.id, ...migrated });
    }
    activeLayerId.value = docs.get(page.id)!.layers[0]!.id;
    isDirty.value = false;
  };

  const goToPage = async (index: number) => {
    if (index < 0 || index >= currentPages.value.length) return;
    // Save current page first
    if (isDirty.value) await saveCurrentPageAsync();
    currentPageIndex.value = index;
    loadPageIntoState();
  };

  const nextPage = () => goToPage(currentPageIndex.value + 1);
  const prevPage = () => goToPage(currentPageIndex.value - 1);

  const addPageAsync = async (template?: PageTemplate) => {
    const db = haexVault.orm;
    if (!db || !currentNotebook.value) return;

    const tmpl = template ?? currentNotebook.value.defaultTemplate as PageTemplate;
    const pageNumber = currentPages.value.length;
    const pageId = crypto.randomUUID();

    await db.insert(pages).values({ id: pageId, notebookId: currentNotebook.value.id, pageNumber, template: tmpl });

    // Auto-share the new page if the whole notebook is shared (space_id set).
    // groupId = notebookId is the invariant used when sharing (see spaces store).
    if (currentNotebook.value.spaceId) {
      try {
        await haexVault.client.spaces.assignAsync([
          {
            tableName: FULL_PAGES_TABLE,
            rowPks: JSON.stringify({ id: pageId }),
            spaceId: currentNotebook.value.spaceId,
            groupId: currentNotebook.value.id,
          },
        ]);
      } catch (err) {
        // Roll back rather than leave a page silently unshared in a fully-shared notebook.
        await db.delete(pages).where(eq(pages.id, pageId));
        throw err;
      }
    }

    // Reload pages
    const allPages = await db.select().from(pages).where(eq(pages.notebookId, currentNotebook.value.id)).orderBy(asc(pages.pageNumber));
    currentPages.value = allPages;

    // Navigate to new page
    await goToPage(pageNumber);
  };

  const deleteCurrentPageAsync = async () => {
    const db = haexVault.orm;
    const page = currentPage.value;
    if (!db || !page || currentPages.value.length <= 1) return;

    await db.delete(pages).where(eq(pages.id, page.id));

    // Reload and renumber
    const allPages = await db.select().from(pages).where(eq(pages.notebookId, currentNotebook.value!.id)).orderBy(asc(pages.pageNumber));
    for (let i = 0; i < allPages.length; i++) {
      if (allPages[i]!.pageNumber !== i) {
        await db.update(pages).set({ pageNumber: i }).where(eq(pages.id, allPages[i]!.id));
        allPages[i]!.pageNumber = i;
      }
    }
    currentPages.value = allPages;
    currentPageIndex.value = Math.min(currentPageIndex.value, allPages.length - 1);
    loadPageIntoState();
  };

  const reorderPagesAsync = async (fromIndex: number, toIndex: number) => {
    const db = haexVault.orm;
    if (!db || !currentNotebook.value) return;
    if (fromIndex === toIndex) return;

    // Save current page first
    if (isDirty.value) await saveCurrentPageAsync();

    // Reorder in-memory
    const moved = currentPages.value.splice(fromIndex, 1)[0]!;
    currentPages.value.splice(toIndex, 0, moved);

    // Update page numbers in DB
    for (let i = 0; i < currentPages.value.length; i++) {
      const p = currentPages.value[i]!;
      if (p.pageNumber !== i) {
        await db.update(pages).set({ pageNumber: i }).where(eq(pages.id, p.id));
        p.pageNumber = i;
      }
    }

    // Keep current page selected
    if (currentPageIndex.value === fromIndex) {
      currentPageIndex.value = toIndex;
    } else if (fromIndex < currentPageIndex.value && toIndex >= currentPageIndex.value) {
      currentPageIndex.value--;
    } else if (fromIndex > currentPageIndex.value && toIndex <= currentPageIndex.value) {
      currentPageIndex.value++;
    }
  };

  const deletePageAsync = async (index: number) => {
    const db = haexVault.orm;
    if (!db || currentPages.value.length <= 1) return;

    const page = currentPages.value[index]!;
    // Soft-delete: set deletedAt instead of removing
    await db.update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, page.id));

    currentPages.value.splice(index, 1);

    // Renumber remaining
    for (let i = 0; i < currentPages.value.length; i++) {
      const p = currentPages.value[i]!;
      if (p.pageNumber !== i) {
        await db.update(pages).set({ pageNumber: i }).where(eq(pages.id, p.id));
        p.pageNumber = i;
      }
    }

    if (currentPageIndex.value >= currentPages.value.length) {
      currentPageIndex.value = currentPages.value.length - 1;
    }
    loadPageIntoState();
  };

  const togglePageOrientationAsync = async () => {
    const doc = currentDoc.value;
    if (!doc) return;
    const [width, height] = [doc.height, doc.width];
    doc.width = width;
    doc.height = height;
    isDirty.value = true;
    await saveCurrentPageAsync();
  };

  const changePageTemplateAsync = async (template: PageTemplate) => {
    const doc = currentDoc.value;
    if (!doc) return;
    runCommand(setPageBackground(doc, { ...doc.background, template }, "Vorlage"));
    await saveCurrentPageAsync();
  };

  // --- Save ---

  const addStroke = (stroke: StrokeElement, label: string) => {
    const doc = currentDoc.value;
    const layer = activeLayer.value;
    if (!doc || !layer) return;
    stroke.bbox = computeBbox(stroke);
    runCommand(addElements(doc, layer.id, [stroke], label));
  };

  const tableElements = computed(() =>
    visibleElements.value.filter((e): e is TableElement => e.type === "table"),
  );

  const addTable = (rows: number, cols: number, x: number, y: number) => {
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
    return table;
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

  const saveCurrentPageAsync = async () => {
    const db = haexVault.orm;
    const page = currentPage.value;
    const doc = currentDoc.value;
    if (!db || !page || !doc) return;

    // structuredClone entfernt die Vue-Proxies; Drizzle serialisiert sonst
    // Reactive-Wrapper mit in das JSON.
    await db
      .update(pages)
      .set({
        layers: structuredClone(toRaw(doc.layers)),
        background: structuredClone(toRaw(doc.background)),
        width: doc.width,
        height: doc.height,
      })
      .where(eq(pages.id, page.id));
    isDirty.value = false;
  };

  // --- Trash ---

  const listTrashAsync = async (notebookId?: string): Promise<SelectPage[]> => {
    const db = haexVault.orm;
    if (!db) return [];
    if (notebookId) {
      return db.select().from(pages).where(and(eq(pages.notebookId, notebookId), isNotNull(pages.deletedAt))).orderBy(asc(pages.pageNumber));
    }
    return db.select().from(pages).where(isNotNull(pages.deletedAt)).orderBy(asc(pages.deletedAt));
  };

  const restorePageAsync = async (pageId: string) => {
    const db = haexVault.orm;
    if (!db || !currentNotebook.value) return;

    // Restore: clear deletedAt, set page number to end
    const nextPageNumber = currentPages.value.length;
    await db.update(pages).set({ deletedAt: null, pageNumber: nextPageNumber }).where(eq(pages.id, pageId));

    // Reload pages
    const allPages = await db.select().from(pages).where(and(eq(pages.notebookId, currentNotebook.value.id), isNull(pages.deletedAt))).orderBy(asc(pages.pageNumber));
    currentPages.value = allPages;
  };

  const emptyTrashAsync = async (notebookId?: string) => {
    const db = haexVault.orm;
    if (!db) return;
    if (notebookId) {
      const trashed = await db.select().from(pages).where(and(eq(pages.notebookId, notebookId), isNotNull(pages.deletedAt)));
      for (const p of trashed) {
        await db.delete(pages).where(eq(pages.id, p.id));
      }
    } else {
      const trashed = await db.select().from(pages).where(isNotNull(pages.deletedAt));
      for (const p of trashed) {
        await db.delete(pages).where(eq(pages.id, p.id));
      }
    }
  };

  const clear = () => {
    currentNotebook.value = null;
    currentPages.value = [];
    currentPageIndex.value = 0;
    docs.clear();
    undoStack.clear();
    currentStroke.value = null;
    isDrawing.value = false;
    isDirty.value = false;
    activeLayerId.value = null;
  };

  return {
    currentNotebook,
    currentPages,
    currentPageIndex,
    currentPage,
    pageCount,
    currentDoc,
    visibleElements,
    activeLayer,
    activeLayerId,
    currentStroke,
    isDrawing,
    isDirty,
    undoStack,
    canUndo,
    canRedo,
    addStroke,
    undo,
    redo,
    listNotebooksAsync,
    createNotebookAsync,
    deleteNotebookAsync,
    renameNotebookAsync,
    openNotebookAsync,
    goToPage,
    nextPage,
    prevPage,
    addPageAsync,
    deleteCurrentPageAsync,
    deletePageAsync,
    reorderPagesAsync,
    togglePageOrientationAsync,
    changePageTemplateAsync,
    tableElements,
    addTable,
    removeTable,
    addTableRow,
    addTableColumn,
    removeTableRow,
    removeTableColumn,
    resizeTable,
    saveCurrentPageAsync,
    listTrashAsync,
    restorePageAsync,
    emptyTrashAsync,
    clear,
  };
});
