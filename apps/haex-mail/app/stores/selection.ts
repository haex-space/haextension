/**
 * Multi-selection of messages, mirroring the haex-pass selection UX:
 * ctrl/cmd-click and long-press enter selection mode, a toolbar offers
 * bulk actions, and the mode exits when the last item is deselected.
 *
 * Keys are message row ids (`accountId::mailboxName::uid`), so a
 * selection can safely span accounts in the unified view.
 */
export const useSelectionStore = defineStore("selection", () => {
  const selectedIds = ref<Set<string>>(new Set());
  const isSelectionMode = ref(false);
  // Anchor for shift-click range selection: the last id explicitly added
  // to the selection (not cleared on removal, so a range can be extended).
  const lastSelectedId = ref<string | null>(null);

  const selectedCount = computed(() => selectedIds.value.size);

  const isSelected = (id: string) => selectedIds.value.has(id);

  const toggleSelection = (id: string) => {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id);
    } else {
      selectedIds.value.add(id);
      lastSelectedId.value = id;
    }
    if (selectedIds.value.size === 0) {
      isSelectionMode.value = false;
    }
  };

  const selectItem = (id: string) => {
    selectedIds.value.add(id);
    isSelectionMode.value = true;
    lastSelectedId.value = id;
  };

  const clearSelection = () => {
    selectedIds.value.clear();
    isSelectionMode.value = false;
    lastSelectedId.value = null;
  };

  const selectAll = (ids: string[]) => {
    ids.forEach((id) => selectedIds.value.add(id));
    if (selectedIds.value.size > 0) {
      isSelectionMode.value = true;
    }
  };

  // Like selectAll, but leaves the anchor untouched so repeated shift-clicks
  // keep extending/shrinking the range from the same starting point.
  const selectRange = (ids: string[]) => {
    ids.forEach((id) => selectedIds.value.add(id));
    if (selectedIds.value.size > 0) {
      isSelectionMode.value = true;
    }
  };

  return {
    selectedIds,
    isSelectionMode,
    lastSelectedId,
    selectedCount,
    isSelected,
    toggleSelection,
    selectItem,
    clearSelection,
    selectAll,
    selectRange,
  };
});
