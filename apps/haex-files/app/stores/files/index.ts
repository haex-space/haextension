// stores/files/index.ts
// File sync operations using:
// - Core filesystem API for local file operations
// - Core remoteStorage API for cloud storage operations
// - Local Drizzle DB for sync queue management

import { isPermissionPromptError, isPermissionDeniedError } from "../haexvault";
import {
  QUEUE_STATUS,
  type LocalFileInfo,
  type RemoteFileInfo,
  type SyncConflict,
  type QueueStatus,
  type SyncQueueEntry,
  type QueueSummary,
  type SyncError,
  type LocalSyncStatus,
} from "./types";
import { dirEntryToLocalFileInfo } from "~/lib/fileSync";
import { useFilesQueue } from "./queue";
import { useFilesSyncState } from "./syncState";
import { useFilesScan } from "./scan";
import { useFilesSyncEngine } from "./sync";
import { useFilesWatcher } from "./watcher";

// ============================================================================
// Store
// ============================================================================

export const useFilesStore = defineStore("files", () => {
  const haexVaultStore = useHaexVaultStore();
  const syncRulesStore = useSyncRulesStore();

  // State
  const files = ref<LocalFileInfo[]>([]);
  const remoteFiles = ref<RemoteFileInfo[]>([]);
  const isLoading = ref(false);
  const isLoadingRemote = ref(false);
  const isUploading = ref(false);
  const isSyncing = ref(false);
  const uploadProgress = ref<{ current: number; total: number } | null>(null);
  const currentRuleId = ref<string | null>(null);
  const currentSubpath = ref<string>("");

  // Queue state
  const queueSummary = ref<QueueSummary | null>(null);
  const queueEntries = ref<SyncQueueEntry[]>([]);
  const lastSyncTime = ref<string | null>(null);
  const syncErrors = ref<SyncError[]>([]);

  // Conflict state
  const pendingConflicts = ref<SyncConflict[]>([]);
  const conflictResolveCallback = ref<(() => void) | null>(null);

  // ==========================================================================
  // Local File Operations (via Core filesystem API)
  // ==========================================================================

  /**
   * Load local files for a sync rule using Core filesystem API
   */
  const loadFilesAsync = async (ruleId: string, subpath: string = ""): Promise<void> => {
    const rule = syncRulesStore.getRule(ruleId);
    if (!rule) {
      console.warn("[haex-files] Sync rule not found:", ruleId);
      return;
    }

    isLoading.value = true;
    currentRuleId.value = ruleId;
    currentSubpath.value = subpath;

    try {
      // Build full path
      let fullPath = rule.localPath;
      if (subpath) {
        fullPath = `${rule.localPath}/${subpath}`;
      }

      // Read directory using Core filesystem API
      const entries = await haexVaultStore.client.filesystem.readDir(fullPath);
      files.value = entries.map((e) => dirEntryToLocalFileInfo(e, rule.localPath));
      haexVaultStore.clearPermissionPrompt();
    } catch (error) {
      console.warn("[haex-files] Failed to load local files:", error);

      if (isPermissionPromptError(error)) {
        haexVaultStore.setPermissionPrompt(error, () => loadFilesAsync(ruleId, subpath));
      } else if (isPermissionDeniedError(error)) {
        haexVaultStore.setPermissionDenied(error);
      }

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
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  });

  const queue = useFilesQueue({ queueSummary, queueEntries, syncErrors, currentRuleId });
  const {
    loadQueueSummaryAsync,
    loadQueueEntriesAsync,
    addFilesToQueueAsync,
    addDownloadsToQueueAsync,
    retryFailedQueueAsync,
    removeQueueEntryAsync,
    clearQueueAsync,
  } = queue;
  const syncState = useFilesSyncState(queue);
  const scan = useFilesScan({ remoteFiles, isLoadingRemote });
  const { loadRemoteFilesAsync } = scan;
  const { processQueueAsync, triggerSyncAsync } = useFilesSyncEngine(
    {
      isSyncing,
      uploadProgress,
      currentRuleId,
      currentSubpath,
      queueSummary,
      lastSyncTime,
      syncErrors,
    },
    loadFilesAsync,
    queue,
    syncState,
    scan
  );

  // ==========================================================================
  // Computed State
  // ==========================================================================

  /**
   * Computed sync status
   */
  const syncStatus = computed<LocalSyncStatus>(() => {
    const summary = queueSummary.value;

    const failedEntryErrors: SyncError[] = queueEntries.value
      .filter((e) => e.status === QUEUE_STATUS.FAILED)
      .map((e) => ({
        fileId: e.id,
        fileName: e.relativePath.split("/").pop() || e.relativePath,
        error: e.errorMessage || (e.operation === "download" ? "Download failed" : "Upload failed"),
        timestamp: e.completedAt || e.createdAt || "",
      }));

    const errorMap = new Map<string, SyncError>();
    for (const err of failedEntryErrors) {
      errorMap.set(err.fileId, err);
    }
    for (const err of syncErrors.value) {
      errorMap.set(err.fileId, err);
    }

    return {
      isSyncing: isSyncing.value || (summary?.inProgressCount ?? 0) > 0,
      pendingUploads: summary?.pendingUploadCount ?? 0,
      pendingDownloads: summary?.pendingDownloadCount ?? 0,
      lastSync: lastSyncTime.value,
      errors: Array.from(errorMap.values()),
    };
  });

  /**
   * Failed queue entries
   */
  const failedQueueEntries = computed(() => {
    return queueEntries.value.filter((e) => e.status === QUEUE_STATUS.FAILED);
  });

  /**
   * Map of relativePath -> queue status for current rule's files
   */
  const fileQueueStatusMap = computed<Map<string, QueueStatus>>(() => {
    const map = new Map<string, QueueStatus>();
    for (const entry of queueEntries.value) {
      map.set(entry.relativePath, entry.status);
    }
    return map;
  });

  /**
   * Get the queue status for a specific file
   */
  const getFileQueueStatus = (relativePath: string): QueueStatus | null => {
    return fileQueueStatusMap.value.get(relativePath) ?? null;
  };

  /**
   * Load sync status (queue summary)
   */
  const loadSyncStatusAsync = async (): Promise<void> => {
    await loadQueueSummaryAsync();
  };

  /**
   * Clear sync errors
   */
  const clearSyncErrors = () => {
    syncErrors.value = [];
  };

  /**
   * Clear files state
   */
  const clear = () => {
    files.value = [];
    currentRuleId.value = null;
    currentSubpath.value = "";
    uploadProgress.value = null;
    syncErrors.value = [];
    queueSummary.value = null;
    queueEntries.value = [];
  };

  const { isWatcherRunning, activeNativeWatchers, startWatcher, stopWatcher } = useFilesWatcher({
    isSyncing,
    currentRuleId,
    currentSubpath,
    loadFilesAsync,
    scanAllLocalFilesAsync: scan.scanAllLocalFilesAsync,
    triggerSyncAsync,
  });

  return {
    // State
    files: computed(() => files.value),
    remoteFiles: computed(() => remoteFiles.value),
    sortedFiles,
    isLoading: computed(() => isLoading.value),
    isLoadingRemote: computed(() => isLoadingRemote.value),
    isUploading: computed(() => isUploading.value),
    isSyncing: computed(() => isSyncing.value),
    syncStatus,
    syncErrors: computed(() => syncErrors.value),
    uploadProgress: computed(() => uploadProgress.value),
    currentRuleId: computed(() => currentRuleId.value),
    currentPath: computed(() => currentSubpath.value),
    pathSegments,
    // Queue state
    queueSummary: computed(() => queueSummary.value),
    queueEntries: computed(() => queueEntries.value),
    failedQueueEntries,
    // File operations
    loadFilesAsync,
    loadRemoteFilesAsync,
    loadSyncStatusAsync,
    navigateToPath,
    navigateUp,
    navigateToRoot,
    // Sync operations
    triggerSyncAsync,
    processQueueAsync,
    // Queue management
    loadQueueSummaryAsync,
    loadQueueEntriesAsync,
    addFilesToQueueAsync,
    addDownloadsToQueueAsync,
    retryFailedQueueAsync,
    removeQueueEntryAsync,
    clearQueueAsync,
    // File sync status
    fileQueueStatusMap,
    getFileQueueStatus,
    // Cleanup
    clearSyncErrors,
    clear,
    // Auto-sync watcher (native + fallback polling)
    isWatcherRunning,
    activeNativeWatchers,
    startWatcher,
    stopWatcher,
  };
});
