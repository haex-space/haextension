import type { SelectPage, InsertPage } from "~/database/schemas";

/**
 * Build editable copies of pages for a target notebook.
 *
 * Each copy gets a fresh id, deep-cloned JSON (strokes/tables), the target
 * notebookId and an appended page number. Copies are NOT assigned to any space,
 * so they are private and fully editable — this is the "import a shared page to
 * work on it" flow.
 */
export function buildPageCopies(
  sourcePages: SelectPage[],
  targetNotebookId: string,
  startPageNumber: number,
): InsertPage[] {
  return sourcePages.map((p, i) => ({
    id: crypto.randomUUID(),
    notebookId: targetNotebookId,
    pageNumber: startPageNumber + i,
    template: p.template,
    strokes: JSON.parse(JSON.stringify(p.strokes)),
    tables: JSON.parse(JSON.stringify(p.tables)),
    backgroundImage: p.backgroundImage,
    thumbnail: p.thumbnail,
    orientation: p.orientation,
    deletedAt: null,
  }));
}
