import { onKeyStroke } from "@vueuse/core";
import type { Ref } from "vue";

/**
 * Selection keyboard shortcuts (haex-pass parity) plus Delete and
 * arrow-key navigation for the open message.
 */
export const useMailKeyboardShortcuts = (options: {
  showCompose: Ref<boolean>;
  showFullscreenMessage: Ref<boolean>;
  onDeleteFromView: () => Promise<void>;
}) => {
  const mailStore = useMailStore();
  const selectionStore = useSelectionStore();
  const { showCompose, showFullscreenMessage, onDeleteFromView } = options;

  // Guard against text inputs and the compose dialog, otherwise Ctrl+A
  // would hijack text selection.
  const isEditableTarget = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return (
      !!t &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    );
  };

  onKeyStroke(["a", "A"], (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (isEditableTarget(e) || showCompose.value) return;
    e.preventDefault();
    selectionStore.selectAll(mailStore.filteredMessageList.map((m) => m.id));
  });

  onKeyStroke("Escape", (e) => {
    if (!selectionStore.isSelectionMode) return;
    e.preventDefault();
    selectionStore.clearSelection();
  });

  onKeyStroke("Delete", async (e) => {
    if (isEditableTarget(e) || showCompose.value) return;

    if (selectionStore.isSelectionMode) {
      e.preventDefault();
      const ids = Array.from(selectionStore.selectedIds);
      // Deleting the open message clears it (and the fullscreen v-if with it) —
      // drop the overlay flag too so the next opened mail doesn't go fullscreen.
      if (mailStore.selectedMessageId && selectionStore.isSelected(mailStore.selectedMessageId)) {
        showFullscreenMessage.value = false;
      }
      await mailStore.bulkMoveToRoleAsync(ids, "trash");
      selectionStore.clearSelection();
      // Do NOT auto-open the next message — stay in list view after bulk delete.
      return;
    }

    // No explicit selection, but a message is open for reading — delete it.
    if (!mailStore.selectedMessageId) return;
    e.preventDefault();
    // Match the fullscreen delete button — otherwise the overlay's flag stays
    // set and the next opened message would pop up in fullscreen again.
    showFullscreenMessage.value = false;
    await onDeleteFromView();
  });

  onKeyStroke("ArrowDown", (e) => {
    if (isEditableTarget(e) || showCompose.value) return;
    if (selectionStore.isSelectionMode || !mailStore.selectedMessageId) return;
    e.preventDefault();
    const list = mailStore.filteredMessageList;
    const idx = list.findIndex((m) => m.id === mailStore.selectedMessageId);
    if (idx !== -1 && idx < list.length - 1) {
      mailStore.selectMessage(list[idx + 1]!.id);
    }
  });

  onKeyStroke("ArrowUp", (e) => {
    if (isEditableTarget(e) || showCompose.value) return;
    if (selectionStore.isSelectionMode || !mailStore.selectedMessageId) return;
    e.preventDefault();
    const list = mailStore.filteredMessageList;
    const idx = list.findIndex((m) => m.id === mailStore.selectedMessageId);
    if (idx > 0) {
      mailStore.selectMessage(list[idx - 1]!.id);
    }
  });
};
