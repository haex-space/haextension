import { clampFraction, SPLIT } from "~/lib/splitPane";

/**
 * Welcher Anhang der geöffneten Seite gerade zu sehen ist und wie (holzi Spec 046, FR-023): neben der
 * Seite oder im Vollbild, in dem nur der Anhang zu sehen ist.
 */
export type ViewerMode = "side" | "full";

/** Wo der Browser sich die Teilung merkt: eine Annehmlichkeit je Gerät, nichts, worauf es ankommt. */
const SPLIT_KEY = "haex-notes.attachment-split";

function storedFraction(): number {
  try {
    const stored = localStorage.getItem(SPLIT_KEY);
    return stored === null ? SPLIT.default : clampFraction(Number(stored));
  } catch {
    return SPLIT.default;
  }
}

export const useAttachmentViewerStore = defineStore("attachmentViewer", () => {
  const notebook = useNotebookStore();

  const open = ref<{ attachmentId: string; mode: ViewerMode } | null>(null);
  /** Der Anteil der Breite, den der Anhang neben der Seite bekommt. */
  const sideFraction = ref(storedFraction());

  const show = (attachmentId: string, mode: ViewerMode) => {
    open.value = { attachmentId, mode };
  };
  const close = () => {
    open.value = null;
  };
  const setSideFraction = (fraction: number) => {
    sideFraction.value = clampFraction(fraction);
  };
  watch(sideFraction, (fraction) => {
    try {
      localStorage.setItem(SPLIT_KEY, String(fraction));
    } catch {
      // Ohne Speicher gilt die Teilung bis zum Schließen.
    }
  });

  // Ein Anhang gehört zu einer Seite: Wechselt die Seite, ist er nicht mehr zu sehen. Ein entfernter
  // Anhang auch nicht.
  watch(() => notebook.currentPage?.id, close);
  watch(() => notebook.currentDoc?.attachments, (attachments) => {
    if (open.value && !attachments?.some((a) => a.id === open.value?.attachmentId)) close();
  });

  return { open, sideFraction, show, close, setSideFraction };
});
