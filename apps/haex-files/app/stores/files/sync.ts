import type { Ref } from "vue";
import { eq } from "drizzle-orm";
import { isPermissionPromptError, isPermissionDeniedError } from "../haexvault";
import { syncQueue as syncQueueTable, type SelectSyncState } from "~/database/schemas";
import {
  QUEUE_OPERATION,
  QUEUE_STATUS,
  type QueueSummary,
  type SyncError,
  type SyncQueueEntry,
} from "./types";
import { dbRowToQueueEntry, extractErrorMessage, isPathIgnored } from "./helpers";
import type { FilesQueue } from "./queue";
import type { FilesSyncState } from "./syncState";
import type { FilesScan } from "./scan";

interface FilesSyncEngineState {
  isSyncing: Ref<boolean>;
  uploadProgress: Ref<{ current: number; total: number } | null>;
  currentRuleId: Ref<string | null>;
  currentSubpath: Ref<string>;
  queueSummary: Ref<QueueSummary | null>;
  lastSyncTime: Ref<string | null>;
  syncErrors: Ref<SyncError[]>;
}

export function useFilesSyncEngine(
  state: FilesSyncEngineState,
  loadFilesAsync: (ruleId: string, subpath?: string) => Promise<void>,
  queue: FilesQueue,
  syncState: FilesSyncState,
  scan: FilesScan
) {
  const haexVaultStore = useHaexVaultStore();
  const syncRulesStore = useSyncRulesStore();

  const {
    isSyncing,
    uploadProgress,
    currentRuleId,
    currentSubpath,
    queueSummary,
    lastSyncTime,
    syncErrors,
  } = state;
  const {
    loadQueueSummaryAsync,
    addFilesToQueueAsync,
    addDownloadsToQueueAsync,
    startQueueEntryAsync,
    completeQueueEntryAsync,
    failQueueEntryAsync,
    retryFailedQueueAsync,
    recoverQueueAsync,
  } = queue;
  const {
    loadSyncStateAsync,
    updateSyncStateAsync,
    removeSyncStateAsync,
    addDeletesToQueueAsync,
  } = syncState;
  const { scanAllLocalFilesAsync, scanRemoteFilesAsync } = scan;

  // ==========================================================================
  // Sync Operations
  // ==========================================================================

  /**
   * Process an upload queue entry
   */
  const processUploadEntryAsync = async (entry: SyncQueueEntry): Promise<void> => {
    // Read local file
    const fileData = await haexVaultStore.client.filesystem.readFile(entry.localPath);

    // TODO: Encrypt file data with space key before upload
    // For now, upload plaintext (encryption will be added in next phase)

    // Upload to remote storage
    const remoteKey = `sync/${entry.ruleId}/${entry.relativePath}`;
    await haexVaultStore.client.remoteStorage.upload(entry.backendId, remoteKey, fileData);

    console.log(`[haex-files] Uploaded: ${entry.relativePath}`);
  };

  /**
   * Process a download queue entry
   */
  const processDownloadEntryAsync = async (entry: SyncQueueEntry): Promise<void> => {
    // Download from remote storage
    // For downloads, relativePath contains the full remote key
    const remoteKey = entry.relativePath;
    const fileData = await haexVaultStore.client.remoteStorage.download(entry.backendId, remoteKey);

    // TODO: Decrypt file data with space key after download
    // For now, download plaintext (encryption will be added in next phase)

    // Ensure parent directory exists
    const parentPath = entry.localPath.substring(0, entry.localPath.lastIndexOf("/"));
    if (parentPath) {
      try {
        await haexVaultStore.client.filesystem.mkdir(parentPath);
      } catch {
        // Directory might already exist, ignore error
      }
    }

    // Write to local file
    await haexVaultStore.client.filesystem.writeFile(entry.localPath, fileData);

    console.log(`[haex-files] Downloaded: ${entry.relativePath}`);
  };

  /**
   * Process a delete queue entry - removes file from remote storage
   */
  const processDeleteEntryAsync = async (entry: SyncQueueEntry): Promise<void> => {
    // Delete from remote storage
    const remoteKey = `sync/${entry.ruleId}/${entry.relativePath}`;
    await haexVaultStore.client.remoteStorage.delete(entry.backendId, remoteKey);

    // Remove from syncState since file no longer exists
    await removeSyncStateAsync(entry.ruleId, entry.backendId, entry.relativePath);

    console.log(`[haex-files] Deleted from remote: ${entry.relativePath}`);
  };

  /**
   * Process the next pending queue entry (upload, download, or delete)
   */
  const processNextQueueEntryAsync = async (): Promise<boolean> => {
    if (!haexVaultStore.orm) return false;

    // Get next pending entry
    const pending = await haexVaultStore.orm
      .select()
      .from(syncQueueTable)
      .where(eq(syncQueueTable.status, QUEUE_STATUS.PENDING))
      .limit(1);

    if (pending.length === 0) return false;

    const entry = dbRowToQueueEntry(pending[0]!);

    // Mark as started
    await startQueueEntryAsync(entry.id);

    try {
      if (entry.operation === QUEUE_OPERATION.UPLOAD) {
        await processUploadEntryAsync(entry);
        // Update syncState after successful upload
        await updateSyncStateAsync(
          entry.ruleId,
          entry.backendId,
          entry.relativePath,
          entry.fileSize
        );
      } else if (entry.operation === QUEUE_OPERATION.DOWNLOAD) {
        await processDownloadEntryAsync(entry);
        // Update syncState after successful download
        await updateSyncStateAsync(
          entry.ruleId,
          entry.backendId,
          entry.relativePath,
          entry.fileSize
        );
      } else if (entry.operation === QUEUE_OPERATION.DELETE) {
        await processDeleteEntryAsync(entry);
        // syncState is already removed in processDeleteEntryAsync
      } else {
        throw new Error(`Unknown operation: ${entry.operation}`);
      }

      // Mark as completed
      await completeQueueEntryAsync(entry.id);
    } catch (error) {
      // If permission is required, show the dialog and stop processing
      if (isPermissionPromptError(error)) {
        haexVaultStore.setPermissionPrompt(error, () => processQueueAsync());
        return false; // Stop processing queue
      }

      // If permission was denied, show the denied dialog and stop processing
      if (isPermissionDeniedError(error)) {
        haexVaultStore.setPermissionDenied(error);
        // Reset entry back to pending so it can be retried after permission is granted
        await haexVaultStore.orm
          ?.update(syncQueueTable)
          .set({ status: QUEUE_STATUS.PENDING, startedAt: null })
          .where(eq(syncQueueTable.id, entry.id));
        return false; // Stop processing queue - prevent endless loop
      }

      const errorMsg = extractErrorMessage(error);
      await failQueueEntryAsync(entry.id, errorMsg);
      console.warn(`[haex-files] ${entry.operation} failed: ${entry.relativePath}`, error);

      syncErrors.value.push({
        fileId: entry.id,
        fileName: entry.relativePath.split("/").pop() || entry.relativePath,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }

    return true;
  };

  /**
   * Process the entire queue until empty
   */
  const processQueueAsync = async (): Promise<void> => {
    isSyncing.value = true;
    syncErrors.value = [];

    try {
      await recoverQueueAsync();

      let processed = 0;
      while (await processNextQueueEntryAsync()) {
        processed++;
        await loadQueueSummaryAsync();
        uploadProgress.value = {
          current: processed,
          total: processed + (queueSummary.value?.pendingCount ?? 0),
        };
      }

      lastSyncTime.value = new Date().toISOString();
      console.log(`[haex-files] Queue processing complete: ${processed} files processed`);
    } finally {
      isSyncing.value = false;
      uploadProgress.value = null;
      await loadQueueSummaryAsync();
    }
  };

  /**
   * Trigger a manual sync for a specific sync rule
   * Supports bidirectional sync: upload (up), download (down), or both
   *
   * Delete detection: When files exist in syncState but not locally,
   * they are marked for deletion on remote storage (for "up" and "both" directions).
   */
  const triggerSyncAsync = async (ruleId?: string): Promise<void> => {
    const targetRuleId = ruleId || currentRuleId.value;
    if (!targetRuleId) {
      console.warn("[haex-files] No rule ID for sync");
      return;
    }

    if (isSyncing.value) {
      console.log("[haex-files] Sync already in progress, skipping");
      return;
    }

    const rule = syncRulesStore.getRule(targetRuleId);
    if (!rule) {
      console.warn("[haex-files] Sync rule not found:", targetRuleId);
      return;
    }

    isSyncing.value = true;
    syncErrors.value = [];

    try {
      // Reset any failed entries
      await retryFailedQueueAsync();

      // Load syncState to detect deletions
      const syncStateRecords = await loadSyncStateAsync(targetRuleId);
      const syncStateByPath = new Map<string, SelectSyncState>();
      for (const record of syncStateRecords) {
        syncStateByPath.set(`${record.backendId}:${record.relativePath}`, record);
      }

      // UPLOAD: direction = "up" or "both"
      if (rule.direction !== "down") {
        // Scan all local files recursively
        const localFiles = await scanAllLocalFilesAsync(targetRuleId);

        // Filter out directories and ignored files
        const filesToUpload = localFiles.filter(
          (f) => !f.isDirectory && !isPathIgnored(f.relativePath, rule.ignorePatterns)
        );

        // Create set of current local file paths for delete detection
        const localPathSet = new Set(filesToUpload.map((f) => f.relativePath));

        // Detect deleted files: files in syncState that no longer exist locally
        const deletedFiles: Array<{ relativePath: string; backendId: string }> = [];
        for (const record of syncStateRecords) {
          if (!localPathSet.has(record.relativePath)) {
            // File was synced before but no longer exists locally - mark for deletion
            deletedFiles.push({
              relativePath: record.relativePath,
              backendId: record.backendId,
            });
            console.log(`[haex-files] Detected deleted file: ${record.relativePath}`);
          }
        }

        // Queue deleted files for remote deletion
        if (deletedFiles.length > 0) {
          console.log(`[haex-files] Adding ${deletedFiles.length} files for remote deletion...`);
          await addDeletesToQueueAsync(targetRuleId, rule.backendIds, deletedFiles);
        }

        if (filesToUpload.length > 0) {
          console.log(`[haex-files] Adding ${filesToUpload.length} files for upload...`);

          // Add files for each backend
          for (const backendId of rule.backendIds) {
            const queueFiles = filesToUpload.map((f) => ({
              localPath: f.path,
              relativePath: f.relativePath,
              fileSize: f.size,
            }));

            await addFilesToQueueAsync(targetRuleId, backendId, queueFiles);
          }
        }
      }

      // DOWNLOAD: direction = "down" or "both"
      if (rule.direction !== "up") {
        // Scan remote files
        const remoteFiles = await scanRemoteFilesAsync(targetRuleId);

        if (remoteFiles.length > 0) {
          let filesToDownload = remoteFiles;

          if (rule.direction === "both") {
            // For bidirectional sync, only download files that:
            // 1. Don't exist locally AND
            // 2. Were NOT previously synced (not in syncState = new remote file, not a deletion)
            const localFiles = await scanAllLocalFilesAsync(targetRuleId);
            const localPaths = new Set(localFiles.map((f) => f.relativePath));

            filesToDownload = remoteFiles.filter((f) => {
              // File doesn't exist locally
              if (localPaths.has(f.relativePath)) {
                return false;
              }
              // Check if this file was previously synced (= was deleted locally)
              const syncKey = `${f.backendId}:${f.relativePath}`;
              if (syncStateByPath.has(syncKey)) {
                // File was previously synced and now deleted locally - don't re-download
                console.log(`[haex-files] Skipping download of locally deleted file: ${f.relativePath}`);
                return false;
              }
              // New file on remote - download it
              return true;
            });
          }

          if (filesToDownload.length > 0) {
            console.log(`[haex-files] Adding ${filesToDownload.length} files for download...`);
            await addDownloadsToQueueAsync(targetRuleId, rule, filesToDownload);
          }
        }
      }

      console.log("[haex-files] Files added to queue, starting processing...");

      // Process the queue
      await processQueueAsync();

      // Reload local files if we're viewing this rule (to show downloaded files)
      if (currentRuleId.value === targetRuleId) {
        await loadFilesAsync(targetRuleId, currentSubpath.value);
      }
    } catch (error) {
      console.error("[haex-files] Sync failed:", error);

      if (isPermissionPromptError(error)) {
        haexVaultStore.setPermissionPrompt(error, () => triggerSyncAsync(ruleId));
      } else if (isPermissionDeniedError(error)) {
        haexVaultStore.setPermissionDenied(error);
        // Don't rethrow - user needs to grant permission in haex-vault settings
      } else {
        throw error;
      }
    } finally {
      isSyncing.value = false;
      uploadProgress.value = null;
    }
  };

  return {
    processQueueAsync,
    triggerSyncAsync,
  };
}
