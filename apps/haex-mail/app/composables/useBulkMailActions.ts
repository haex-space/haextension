/**
 * Bulk actions on the current selection — shared between the desktop
 * toolbar (MessageList) and the mobile toolbar in the page header
 * (index.vue), which render in different places for layout reasons.
 */
export const useBulkMailActions = () => {
  const mailStore = useMailStore();
  const selectionStore = useSelectionStore();

  const selectedIds = () => Array.from(selectionStore.selectedIds);

  const markReadAsync = async (add: boolean) => {
    await mailStore.bulkSetFlagAsync(selectedIds(), "\\Seen", add);
  };

  // Nothing moved (already there, or every move failed): keep the selection
  // so the user can act on it again.
  const archiveAsync = async () => {
    if ((await mailStore.bulkMoveToRoleAsync(selectedIds(), "archive")) > 0) {
      selectionStore.clearSelection();
    }
  };

  const deleteAsync = async () => {
    if ((await mailStore.bulkMoveToRoleAsync(selectedIds(), "trash")) > 0) {
      selectionStore.clearSelection();
    }
  };

  const moveToMailboxAsync = async (mailboxName: string) => {
    await mailStore.bulkMoveToMailboxAsync(selectedIds(), mailboxName);
    selectionStore.clearSelection();
  };

  return { markReadAsync, archiveAsync, deleteAsync, moveToMailboxAsync };
};
