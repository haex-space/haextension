/**
 * Welcher Anhang der geöffneten Seite gerade zu sehen ist und wie (holzi Spec 046, FR-023): neben der
 * Seite oder im Vollbild, in dem nur der Anhang zu sehen ist.
 */
export type ViewerMode = "side" | "full";

export const useAttachmentViewerStore = defineStore("attachmentViewer", () => {
  const notebook = useNotebookStore();

  const open = ref<{ attachmentId: string; mode: ViewerMode } | null>(null);

  const show = (attachmentId: string, mode: ViewerMode) => {
    open.value = { attachmentId, mode };
  };
  const close = () => {
    open.value = null;
  };

  // Ein Anhang gehört zu einer Seite: Wechselt die Seite, ist er nicht mehr zu sehen. Ein entfernter
  // Anhang auch nicht.
  watch(() => notebook.currentPage?.id, close);
  watch(() => notebook.currentDoc?.attachments, (attachments) => {
    if (open.value && !attachments?.some((a) => a.id === open.value?.attachmentId)) close();
  });

  return { open, show, close };
});
