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

  const archiveAsync = async () => {
    await mailStore.bulkMoveToRoleAsync(selectedIds(), "archive");
    selectionStore.clearSelection();
  };

  const deleteAsync = async () => {
    await mailStore.bulkMoveToRoleAsync(selectedIds(), "trash");
    selectionStore.clearSelection();
  };

  const moveToMailboxAsync = async (mailboxName: string) => {
    await mailStore.bulkMoveToMailboxAsync(selectedIds(), mailboxName);
    selectionStore.clearSelection();
  };

  return { markReadAsync, archiveAsync, deleteAsync, moveToMailboxAsync };
};
