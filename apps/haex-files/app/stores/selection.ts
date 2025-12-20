// stores/selection.ts - File selection state management for haex-files
export const useFileSelectionStore = defineStore("fileSelection", () => {
  const selectedFiles = ref<Set<string>>(new Set());
  const isSelectionMode = ref(false);

  const selectedCount = computed(() => selectedFiles.value.size);

  const toggleSelection = (relativePath: string) => {
    if (selectedFiles.value.has(relativePath)) {
      selectedFiles.value.delete(relativePath);
    } else {
      selectedFiles.value.add(relativePath);
    }
    // Trigger reactivity
    selectedFiles.value = new Set(selectedFiles.value);

    // Update selection mode based on selection count
    isSelectionMode.value = selectedFiles.value.size > 0;
  };

  const selectFile = (relativePath: string) => {
    selectedFiles.value.add(relativePath);
    selectedFiles.value = new Set(selectedFiles.value);
    isSelectionMode.value = true;
  };

  const deselectFile = (relativePath: string) => {
    selectedFiles.value.delete(relativePath);
    selectedFiles.value = new Set(selectedFiles.value);
    if (selectedFiles.value.size === 0) {
      isSelectionMode.value = false;
    }
  };

  const clearSelection = () => {
    selectedFiles.value = new Set();
    isSelectionMode.value = false;
  };

  const selectAll = (filePaths: string[]) => {
    selectedFiles.value = new Set(filePaths);
    isSelectionMode.value = true;
  };

  const isSelected = (relativePath: string) => {
    return selectedFiles.value.has(relativePath);
  };

  return {
    selectedFiles,
    selectedCount,
    isSelectionMode,
    toggleSelection,
    selectFile,
    deselectFile,
    clearSelection,
    selectAll,
    isSelected,
  };
});
