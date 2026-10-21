import { eq, asc, isNull, isNotNull, and } from "drizzle-orm";
import { notebooks, pages, type SelectNotebook, type SelectPage, type PageTemplate } from "~/database/schemas";
import { reactive } from "vue";
import type { PageElement, PageLayer, StrokeElement } from "~/types/document";
import { addElements, type Command, type PageDoc } from "~/lib/commands";
import { computeBbox } from "~/lib/bbox";
import { drawingLayerId, migratePageRow, serializePageDoc } from "~/lib/migratePage";
import { createTableActions } from "~/lib/tableActions";
import { FULL_PAGES_TABLE } from "~/lib/tableNames";
import { createUndoStack } from "~/lib/undoStack";
import { setPaperView } from "~/lib/paperNotes/views";

export const useNotebookStore = defineStore("notebook", () => {
  const haexVault = useHaexVaultStore();
  const spaces = useSpacesStore();

  // Current notebook
  const currentNotebook = ref<SelectNotebook | null>(null);
  const currentPages = ref<SelectPage[]>([]);
  const currentPageIndex = ref(0);
  const isDirty = ref(false);
  const contentVersion = ref(0);

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
    contentVersion.value++;
  };

  /**
   * Der Undo-Stack ist notizbuchweit; ein Kommando kann eine andere Seite als
   * die aktuell sichtbare betreffen. Damit das reverte/re-applied Ergebnis nicht
   * beim nächsten Seitenwechsel verlorengeht, springen wir auf die betroffene
   * Seite und markieren sie dirty.
   */
  const goToAffectedPageAsync = async (pageId: string) => {
    const current = currentPage.value;
    if (current?.id === pageId) return;
    const index = currentPages.value.findIndex((p) => p.id === pageId);
    if (index < 0) return;
    await flushAsync();
    currentPageIndex.value = index;
    loadPageIntoState();
  };

  const undo = async () => {
    const command = undoStack.undo();
    if (!command) return;
    contentVersion.value++;
    await goToAffectedPageAsync(command.pageId);
    isDirty.value = true;
  };
  const redo = async () => {
    const command = undoStack.redo();
    if (!command) return;
    contentVersion.value++;
    await goToAffectedPageAsync(command.pageId);
    isDirty.value = true;
  };

  const canUndo = undoStack.canUndo;
  const canRedo = undoStack.canRedo;

  type Db = NonNullable<typeof haexVault.orm>;

  /** Seiten eines Notizbuchs außerhalb des Papierkorbs, in Seitenreihenfolge. */
  const listActivePagesAsync = (db: Db, notebookId: string) =>
    db.select().from(pages)
      .where(and(eq(pages.notebookId, notebookId), isNull(pages.deletedAt)))
      .orderBy(asc(pages.pageNumber));

  /** Schreibt die Position jeder Seite in `currentPages` als pageNumber zurück. */
  const persistPageNumbersAsync = async (db: Db) => {
    for (const [i, p] of currentPages.value.entries()) {
      if (p.pageNumber === i) continue;
      await db.update(pages).set({ pageNumber: i }).where(eq(pages.id, p.id));
      p.pageNumber = i;
    }
  };

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
    const allPages = await listActivePagesAsync(db, id);
    docs.clear();
    undoStack.clear();
    currentStroke.value = null;
    isDrawing.value = false;
    isDirty.value = false;
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
    activeLayerId.value = drawingLayerId(docs.get(page.id)!.layers);
    isDirty.value = false;
  };

  const goToPage = async (index: number) => {
    if (index < 0 || index >= currentPages.value.length) return;
    // Save current page first
    await flushAsync();
    currentPageIndex.value = index;
    loadPageIntoState();
  };

  const nextPage = () => goToPage(currentPageIndex.value + 1);
  const prevPage = () => goToPage(currentPageIndex.value - 1);

  const addPageAsync = async (template?: PageTemplate) => {
    const db = haexVault.orm;
    if (!db || !currentNotebook.value) return;

    // Vor dem Neuladen sichern: danach zeigt der Index womöglich auf eine andere Zeile.
    await flushAsync();

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

    const allPages = await listActivePagesAsync(db, currentNotebook.value.id);
    currentPages.value = allPages;

    await goToPage(allPages.findIndex((p) => p.id === pageId));
  };

  /** Legt eine Seite aus einem gelesenen Foto an (US1 in haex-space/haex-vault@74263d8c6e8e23831e4a5016797c3db4987d8697:specs/046-paper-notes-canvas/spec.md) und öffnet sie. */
  const addImportedPageAsync = async (imported: Pick<PageDoc, "layers" | "paperImport">) => {
    await addPageAsync("blank");
    const doc = currentDoc.value;
    if (!doc) return;
    doc.layers = imported.layers;
    doc.paperImport = imported.paperImport;
    activeLayerId.value = drawingLayerId(doc.layers);
    contentVersion.value++;
    await saveCurrentPageAsync();
  };

  /** Übernimmt eine neue Seitenreihenfolge; die geöffnete Seite bleibt geöffnet. */
  const reorderPagesAsync = async (newOrder: SelectPage[]) => {
    const db = haexVault.orm;
    if (!db || !currentNotebook.value) return;

    await flushAsync();

    const currentId = currentPage.value?.id;
    currentPages.value = newOrder;
    const stillOpen = newOrder.findIndex((p) => p.id === currentId);
    if (stillOpen >= 0) currentPageIndex.value = stillOpen;

    await persistPageNumbersAsync(db);
  };

  const deletePageAsync = async (index: number) => {
    const db = haexVault.orm;
    if (!db || currentPages.value.length <= 1) return;

    await flushAsync();

    const page = currentPages.value[index]!;
    const currentId = currentPage.value?.id;
    // Soft-delete: set deletedAt instead of removing
    await db.update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, page.id));

    currentPages.value.splice(index, 1);
    // Die angezeigte Seite bleibt dieselbe, auch wenn davor eine wegfällt.
    const stillOpen = currentPages.value.findIndex((p) => p.id === currentId);
    currentPageIndex.value = stillOpen >= 0 ? stillOpen : Math.min(index, currentPages.value.length - 1);
    loadPageIntoState();

    await persistPageNumbersAsync(db);
  };

  const togglePageOrientationAsync = async () => {
    const doc = currentDoc.value;
    if (!doc) return;
    const [width, height] = [doc.height, doc.width];
    doc.width = width;
    doc.height = height;
    isDirty.value = true;
    contentVersion.value++;
    await saveCurrentPageAsync();
  };

  // --- Save ---

  /** In der Ansicht „Original“ ist die Zeichenebene verborgen; was man neu hinzufügt, soll man sehen. */
  const revealActiveLayer = () => {
    if (activeLayer.value?.visible === false) applyEdit((doc) => setPaperView(doc, "compare"));
  };

  const addStroke = (stroke: StrokeElement, label: string) => {
    const doc = currentDoc.value;
    const layer = activeLayer.value;
    if (!doc || !layer) return;
    revealActiveLayer();
    stroke.bbox = computeBbox(stroke);
    runCommand(addElements(doc, layer.id, [stroke], label));
  };

  /** Führt eine Bearbeitung der geöffneten Seite als Kommando aus; null heißt: nichts zu tun. */
  const applyEdit = (make: (doc: PageDoc) => Command | null) => {
    const doc = currentDoc.value;
    const command = doc ? make(doc) : null;
    if (command) runCommand(command);
  };

  const {
    tableElements,
    addTable: addTableToLayer,
    removeTable,
    addTableRow,
    addTableColumn,
    removeTableRow,
    removeTableColumn,
    resizeTable,
  } = createTableActions({ currentDoc, activeLayer, visibleElements, runCommand });

  const addTable = (rows: number, cols: number, x: number, y: number) => {
    revealActiveLayer();
    return addTableToLayer(rows, cols, x, y);
  };

  const saveCurrentPageAsync = async () => {
    const db = haexVault.orm;
    const page = currentPage.value;
    const doc = currentDoc.value;
    if (!db || !page || !doc) return;

    const version = contentVersion.value;
    const row = serializePageDoc(doc);
    await db.update(pages).set(row).where(eq(pages.id, page.id));
    Object.assign(page, row);
    // Was während des Schreibens committet wurde, steckt nicht in `row`.
    if (contentVersion.value === version) isDirty.value = false;
  };

  /**
   * Speichert vor einem Seitenwechsel, bis auch die Änderungen gesichert sind,
   * die während eines Schreibvorgangs dazukamen — loadPageIntoState() setzt
   * isDirty danach zurück.
   */
  const flushAsync = async () => {
    let version: number;
    do {
      version = contentVersion.value;
      if (isDirty.value) await saveCurrentPageAsync();
    } while (isDirty.value && contentVersion.value !== version);
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

    // Beim Teilen eines ganzen Notizbuchs bleiben Seiten im Papierkorb außen vor;
    // wiederhergestellt gehört die Seite wieder in den Space. Erst teilen, damit
    // ein Fehler keine ungeteilte Seite in einem geteilten Notizbuch hinterlässt.
    const spaceId = currentNotebook.value.spaceId;
    if (spaceId) await spaces.sharePagesWithSpaceAsync(currentNotebook.value.id, [pageId], spaceId);

    // Restore: clear deletedAt, set page number to end
    const nextPageNumber = currentPages.value.length;
    await db.update(pages).set({ deletedAt: null, pageNumber: nextPageNumber }).where(eq(pages.id, pageId));

    // Reload pages
    const allPages = await listActivePagesAsync(db, currentNotebook.value.id);
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
    applyEdit,
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
    addImportedPageAsync,
    deletePageAsync,
    reorderPagesAsync,
    togglePageOrientationAsync,
    tableElements,
    addTable,
    removeTable,
    addTableRow,
    addTableColumn,
    removeTableRow,
    removeTableColumn,
    resizeTable,
    contentVersion,
    saveCurrentPageAsync,
    listTrashAsync,
    restorePageAsync,
    emptyTrashAsync,
  };
});
