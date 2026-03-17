import type { FileEntry } from "~/types";

export const useWorkspaceStore = defineStore("workspace", () => {
  const rootPath = ref<string | null>(null);
  const fileTree = ref<FileEntry[]>([]);
  const isLoading = ref(false);

  const workspaceName = computed(() => {
    if (!rootPath.value) return null;
    return rootPath.value.split("/").pop() || rootPath.value;
  });

  const setRootPath = (path: string) => {
    rootPath.value = path;
  };

  const clearWorkspace = () => {
    rootPath.value = null;
    fileTree.value = [];
  };

  return {
    rootPath,
    fileTree,
    isLoading,
    workspaceName,
    setRootPath,
    clearWorkspace,
  };
});
