// stores/files.ts
import type {
  LocalFileInfo,
  ScanLocalOptions,
  FileInfo,
  SyncStatus,
  UploadFileOptions,
} from "@haex-space/vault-sdk";

export type { LocalFileInfo, FileInfo, SyncStatus };

export const useFilesStore = defineStore("files", () => {
  const haexVaultStore = useHaexVaultStore();

  const files = ref<LocalFileInfo[]>([]);
  const remoteFiles = ref<FileInfo[]>([]);
  const isLoading = ref(false);
  const isUploading = ref(false);
  const isSyncing = ref(false);
  const syncStatus = ref<SyncStatus | null>(null);
  const uploadProgress = ref<{ current: number; total: number } | null>(null);
  const currentRuleId = ref<string | null>(null);
  const currentSubpath = ref<string>("");

  /**
   * Load local files for a sync rule via SDK
   */
  const loadFilesAsync = async (ruleId: string, subpath: string = ""): Promise<void> => {
    isLoading.value = true;
    currentRuleId.value = ruleId;
    currentSubpath.value = subpath;

    try {
      const options: ScanLocalOptions = {
        ruleId,
        subpath: subpath || undefined,
      };
      files.value = await haexVaultStore.client.filesystem.sync.scanLocalAsync(options);
    } catch (error) {
      console.warn("[haex-files] Failed to load local files:", error);
      files.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Navigate to a subdirectory
   */
  const navigateToPath = async (subpath: string): Promise<void> => {
    if (!currentRuleId.value) return;
    await loadFilesAsync(currentRuleId.value, subpath);
  };

  /**
   * Navigate up one directory level
   */
  const navigateUp = async (): Promise<void> => {
    if (!currentRuleId.value || !currentSubpath.value) return;

    const segments = currentSubpath.value.split("/").filter(Boolean);
    segments.pop();
    const parentPath = segments.join("/");

    await loadFilesAsync(currentRuleId.value, parentPath);
  };

  /**
   * Navigate to root of current sync rule
   */
  const navigateToRoot = async (): Promise<void> => {
    if (!currentRuleId.value) return;
    await loadFilesAsync(currentRuleId.value, "");
  };

  /**
   * Get path segments for breadcrumb navigation
   */
  const pathSegments = computed(() => {
    if (!currentSubpath.value) return [];
    return currentSubpath.value.split("/").filter(Boolean);
  });

  /**
   * Get files sorted (directories first, then by name)
   */
  const sortedFiles = computed(() => {
    return [...files.value].sort((a, b) => {
      // Directories first
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      // Then alphabetically by name
      return a.name.localeCompare(b.name);
    });
  });

  /**
   * Clear files state
   */
  const clear = () => {
    files.value = [];
    remoteFiles.value = [];
    currentRuleId.value = null;
    currentSubpath.value = "";
    uploadProgress.value = null;
  };

  /**
   * Load sync status via SDK
   */
  const loadSyncStatusAsync = async (): Promise<void> => {
    try {
      syncStatus.value = await haexVaultStore.client.filesystem.sync.getSyncStatusAsync();
      isSyncing.value = syncStatus.value.isSyncing;
    } catch (error) {
      console.warn("[haex-files] Failed to load sync status:", error);
      syncStatus.value = null;
    }
  };

  /**
   * Upload a single file via SDK
   */
  const uploadFileAsync = async (
    spaceId: string,
    localPath: string,
    remotePath?: string,
    backendIds?: string[]
  ): Promise<FileInfo | null> => {
    isUploading.value = true;
    try {
      const options: UploadFileOptions = {
        spaceId,
        localPath,
        remotePath,
        backendIds,
      };
      const fileInfo = await haexVaultStore.client.filesystem.sync.uploadFileAsync(options);
      console.log(`[haex-files] Uploaded file: ${localPath}`);
      return fileInfo;
    } catch (error) {
      console.error("[haex-files] Failed to upload file:", error);
      throw error;
    } finally {
      isUploading.value = false;
    }
  };

  /**
   * Upload all files in the current folder (non-recursive)
   */
  const uploadCurrentFolderAsync = async (
    spaceId: string,
    backendIds: string[]
  ): Promise<{ success: number; failed: number }> => {
    const filesToUpload = files.value.filter((f) => !f.isDirectory);
    const total = filesToUpload.length;
    let success = 0;
    let failed = 0;

    isUploading.value = true;
    uploadProgress.value = { current: 0, total };

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        if (!file) continue;

        uploadProgress.value = { current: i + 1, total };

        try {
          await uploadFileAsync(spaceId, file.path, file.relativePath, backendIds);
          success++;
        } catch {
          failed++;
        }
      }
    } finally {
      isUploading.value = false;
      uploadProgress.value = null;
    }

    return { success, failed };
  };

  /**
   * Trigger a manual sync via SDK
   */
  const triggerSyncAsync = async (): Promise<void> => {
    isSyncing.value = true;
    try {
      await haexVaultStore.client.filesystem.sync.triggerSyncAsync();
      console.log("[haex-files] Sync triggered");
      // Reload sync status after trigger
      await loadSyncStatusAsync();
    } catch (error) {
      console.error("[haex-files] Failed to trigger sync:", error);
      throw error;
    } finally {
      isSyncing.value = false;
    }
  };

  /**
   * Pause sync via SDK
   */
  const pauseSyncAsync = async (): Promise<void> => {
    try {
      await haexVaultStore.client.filesystem.sync.pauseSyncAsync();
      console.log("[haex-files] Sync paused");
      await loadSyncStatusAsync();
    } catch (error) {
      console.error("[haex-files] Failed to pause sync:", error);
      throw error;
    }
  };

  /**
   * Resume sync via SDK
   */
  const resumeSyncAsync = async (): Promise<void> => {
    try {
      await haexVaultStore.client.filesystem.sync.resumeSyncAsync();
      console.log("[haex-files] Sync resumed");
      await loadSyncStatusAsync();
    } catch (error) {
      console.error("[haex-files] Failed to resume sync:", error);
      throw error;
    }
  };

  /**
   * Load remote files for a space via SDK
   */
  const loadRemoteFilesAsync = async (spaceId: string, path?: string): Promise<void> => {
    try {
      remoteFiles.value = await haexVaultStore.client.filesystem.sync.listFilesAsync({
        spaceId,
        path,
      });
    } catch (error) {
      console.warn("[haex-files] Failed to load remote files:", error);
      remoteFiles.value = [];
    }
  };

  return {
    files: computed(() => files.value),
    remoteFiles: computed(() => remoteFiles.value),
    sortedFiles,
    isLoading: computed(() => isLoading.value),
    isUploading: computed(() => isUploading.value),
    isSyncing: computed(() => isSyncing.value),
    syncStatus: computed(() => syncStatus.value),
    uploadProgress: computed(() => uploadProgress.value),
    currentRuleId: computed(() => currentRuleId.value),
    currentPath: computed(() => currentSubpath.value),
    pathSegments,
    loadFilesAsync,
    loadRemoteFilesAsync,
    loadSyncStatusAsync,
    navigateToPath,
    navigateUp,
    navigateToRoot,
    uploadFileAsync,
    uploadCurrentFolderAsync,
    triggerSyncAsync,
    pauseSyncAsync,
    resumeSyncAsync,
    clear,
  };
});
