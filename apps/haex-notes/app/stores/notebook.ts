import { eq, asc, isNull, isNotNull, and } from "drizzle-orm";
import { notebooks, pages, type SelectNotebook, type SelectPage, type StrokeData, type PageTemplate, type PageTable } from "~/database/schemas";

export const useNotebookStore = defineStore("notebook", () => {
  const haexVault = useHaexVaultStore();

  // Current notebook
  const currentNotebook = ref<SelectNotebook | null>(null);
  const currentPages = ref<SelectPage[]>([]);
  const currentPageIndex = ref(0);
  const isDirty = ref(false);

  const currentPage = computed(() => currentPages.value[currentPageIndex.value] ?? null);
  const pageCount = computed(() => currentPages.value.length);

  // Page strokes (reactive for live drawing)
  const strokes = ref<StrokeData[]>([]);
  const currentStroke = ref<StrokeData | null>(null);
  const isDrawing = ref(false);

  // Tables on current page
  const pageTables = ref<PageTable[]>([]);

  // History (per page)
  const history = ref<{ stroke: StrokeData; label: string }[]>([]);
  const historyIndex = ref(-1);

  const activeStrokes = computed(() =>
    history.value.slice(0, historyIndex.value + 1).map(e => e.stroke)
  );

  const addStroke = (stroke: StrokeData, label: string) => {
    history.value = history.value.slice(0, historyIndex.value + 1);
    history.value.push({ stroke, label });
    historyIndex.value = history.value.length - 1;
    isDirty.value = true;
  };

  const undo = () => {
    if (historyIndex.value >= 0) {
      historyIndex.value--;
      isDirty.value = true;
    }
  };

  const redo = () => {
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++;
      isDirty.value = true;
    }
  };

  const canUndo = computed(() => historyIndex.value >= 0);
  const canRedo = computed(() => historyIndex.value < history.value.length - 1);

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
    history.value = (page.strokes || []).map((s, i) => ({
      stroke: s,
      label: s.brushPreset ?? s.tool,
    }));
    historyIndex.value = history.value.length - 1;
    pageTables.value = page.tables ? JSON.parse(JSON.stringify(page.tables)) : [];
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
    const db = haexVault.orm;
    const page = currentPage.value;
    if (!db || !page) return;
    const newOrientation = (page as any).orientation === "landscape" ? "portrait" : "landscape";
    await db.update(pages).set({ orientation: newOrientation }).where(eq(pages.id, page.id));
    (page as any).orientation = newOrientation;
    isDirty.value = true;
  };

  const changePageTemplateAsync = async (template: PageTemplate) => {
    const db = haexVault.orm;
    const page = currentPage.value;
    if (!db || !page) return;
    await db.update(pages).set({ template }).where(eq(pages.id, page.id));
    page.template = template;
  };

  // --- Save ---

  const addTable = (rows: number, cols: number, x: number, y: number) => {
    const defaultColWidth = 80;
    const defaultRowHeight = 30;
    const table: PageTable = {
      id: crypto.randomUUID(),
      x,
      y,
      columns: cols,
      rows,
      columnWidths: Array(cols).fill(defaultColWidth),
      rowHeights: Array(rows).fill(defaultRowHeight),
    };
    pageTables.value.push(table);
    isDirty.value = true;
    return table;
  };

  const removeTable = (id: string) => {
    pageTables.value = pageTables.value.filter(t => t.id !== id);
    isDirty.value = true;
  };

  const saveCurrentPageAsync = async () => {
    const db = haexVault.orm;
    const page = currentPage.value;
    if (!db || !page) return;

    const strokesData = JSON.parse(JSON.stringify(activeStrokes.value));
    const tablesData = JSON.parse(JSON.stringify(pageTables.value));
    await db.update(pages).set({ strokes: strokesData, tables: tablesData }).where(eq(pages.id, page.id));
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
    history.value = [];
    historyIndex.value = -1;
    strokes.value = [];
    currentStroke.value = null;
    isDrawing.value = false;
    isDirty.value = false;
  };

  return {
    currentNotebook,
    currentPages,
    currentPageIndex,
    currentPage,
    pageCount,
    strokes: activeStrokes,
    currentStroke,
    isDrawing,
    isDirty,
    history,
    historyIndex,
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
    pageTables,
    addTable,
    removeTable,
    saveCurrentPageAsync,
    listTrashAsync,
    restorePageAsync,
    emptyTrashAsync,
    clear,
  };
});
