// stores/files.ts
import type {
  LocalFileInfo,
  ScanLocalOptions,
  FileInfo,
  SyncStatus,
  UploadFileOptions,
  FileSyncState,
  SyncRule,
} from "@haex-space/vault-sdk";
import { minimatch } from "minimatch";

export type { LocalFileInfo, FileInfo, SyncStatus, FileSyncState };
export type ConflictResolution = "local" | "remote" | "keepBoth";

/**
 * Check if a file path matches any of the ignore patterns.
 * Supports gitignore-like patterns.
 */
export function isPathIgnored(relativePath: string, ignorePatterns: string[]): boolean {
  for (const pattern of ignorePatterns) {
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern || trimmedPattern.startsWith("#")) continue;

    // Match against the pattern
    if (minimatch(relativePath, trimmedPattern, { dot: true, matchBase: true })) {
      return true;
    }

    // For directory patterns (ending with /), also check if path starts with it
    if (trimmedPattern.endsWith("/")) {
      const dirPattern = trimmedPattern.slice(0, -1);
      if (relativePath.startsWith(dirPattern + "/") || relativePath === dirPattern) {
        return true;
      }
    }
  }
  return false;
}

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
   * Trigger a manual sync for a specific sync rule
   * Since the backend sync engine isn't fully implemented yet,
   * we manually scan local files and upload them.
   */
  const triggerSyncAsync = async (ruleId?: string): Promise<void> => {
    const targetRuleId = ruleId || currentRuleId.value;
    if (!targetRuleId) {
      console.warn("[haex-files] No rule ID for sync");
      return;
    }

    isSyncing.value = true;
    try {
      // Get the sync rule to know spaceId and backendIds
      const rules = await haexVaultStore.client.filesystem.sync.listSyncRulesAsync();
      const rule = rules.find((r) => r.id === targetRuleId);
      if (!rule) {
        console.warn("[haex-files] Sync rule not found:", targetRuleId);
        return;
      }

      // Only sync if direction allows uploads (up or both)
      if (rule.direction === "down") {
        console.log("[haex-files] Sync rule is download-only, skipping upload sync");
        return;
      }

      // Scan all local files recursively
      const localFiles = await scanAllLocalFilesAsync(targetRuleId);
      const filesToUpload = localFiles.filter((f) => !f.isDirectory);

      if (filesToUpload.length === 0) {
        console.log("[haex-files] No files to sync");
        return;
      }

      console.log(`[haex-files] Syncing ${filesToUpload.length} files...`);
      uploadProgress.value = { current: 0, total: filesToUpload.length };

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        if (!file) continue;

        uploadProgress.value = { current: i + 1, total: filesToUpload.length };

        try {
          await haexVaultStore.client.filesystem.sync.uploadFileAsync({
            spaceId: rule.spaceId,
            localPath: file.path,
            remotePath: file.relativePath,
            backendIds: rule.backendIds,
          });
          successCount++;
        } catch (error) {
          console.warn(`[haex-files] Failed to upload ${file.name}:`, error);
          failCount++;
        }
      }

      console.log(`[haex-files] Sync complete: ${successCount} uploaded, ${failCount} failed`);
    } catch (error) {
      console.error("[haex-files] Sync failed:", error);
      throw error;
    } finally {
      isSyncing.value = false;
      uploadProgress.value = null;
      await loadSyncStatusAsync();
    }
  };

  /**
   * Recursively scan all local files for a sync rule
   */
  const scanAllLocalFilesAsync = async (ruleId: string, subpath: string = ""): Promise<LocalFileInfo[]> => {
    const options: ScanLocalOptions = {
      ruleId,
      subpath: subpath || undefined,
    };
    const entries = await haexVaultStore.client.filesystem.sync.scanLocalAsync(options);

    const allFiles: LocalFileInfo[] = [];
    for (const entry of entries) {
      allFiles.push(entry);
      if (entry.isDirectory) {
        const subFiles = await scanAllLocalFilesAsync(ruleId, entry.relativePath);
        allFiles.push(...subFiles);
      }
    }
    return allFiles;
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

  /**
   * Get files with conflict state
   */
  const conflictedFiles = computed(() => {
    return remoteFiles.value.filter((f) => f.syncState === "conflict");
  });

  /**
   * Resolve a file conflict via SDK
   */
  const resolveConflictAsync = async (
    fileId: string,
    resolution: ConflictResolution
  ): Promise<void> => {
    try {
      await haexVaultStore.client.filesystem.sync.resolveConflictAsync(fileId, resolution);
      console.log(`[haex-files] Resolved conflict for ${fileId}: ${resolution}`);
      // Reload sync status to reflect changes
      await loadSyncStatusAsync();
    } catch (error) {
      console.error("[haex-files] Failed to resolve conflict:", error);
      throw error;
    }
  };

  return {
    files: computed(() => files.value),
    remoteFiles: computed(() => remoteFiles.value),
    sortedFiles,
    conflictedFiles,
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
    resolveConflictAsync,
    clear,
  };
});
