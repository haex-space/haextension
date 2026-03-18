export interface GitFile {
  path: string;
  status: string;
}

export const useGitStore = defineStore("git", () => {
  const branch = ref<string | null>(null);
  const isRepo = ref(false);
  const files = ref<GitFile[]>([]);
  const isLoading = ref(false);

  const { isRepo: checkIsRepo, currentBranch, getStatus } = useGit();

  const changedCount = computed(
    () => files.value.filter((f) => !f.status.startsWith("staged")).length
  );

  const stagedFiles = computed(() => files.value.filter((f) => f.status.startsWith("staged")));
  const unstagedFiles = computed(() => files.value.filter((f) => !f.status.startsWith("staged")));

  // Quick lookup: relative path -> status
  const statusMap = computed(() => {
    const m = new Map<string, string>();
    for (const f of files.value) m.set(f.path, f.status);
    return m;
  });

  const getFileStatus = (absolutePath: string, rootPath: string): string | null => {
    const rel = absolutePath.startsWith(rootPath + "/")
      ? absolutePath.slice(rootPath.length + 1)
      : absolutePath;
    return statusMap.value.get(rel) ?? null;
  };

  const refresh = async (dir: string) => {
    isLoading.value = true;
    try {
      isRepo.value = await checkIsRepo(dir);
      if (!isRepo.value) {
        branch.value = null;
        files.value = [];
        return;
      }
      const [b, status] = await Promise.all([currentBranch(dir), getStatus(dir)]);
      branch.value = b;
      files.value = status;
    } catch (e) {
      console.error("[haex-code] Git refresh failed:", e);
    } finally {
      isLoading.value = false;
    }
  };

  const clear = () => {
    branch.value = null;
    isRepo.value = false;
    files.value = [];
  };

  return {
    branch,
    isRepo,
    files,
    isLoading,
    changedCount,
    stagedFiles,
    unstagedFiles,
    statusMap,
    getFileStatus,
    refresh,
    clear,
  };
});
