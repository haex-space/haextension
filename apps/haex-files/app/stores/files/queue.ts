import type { Ref } from "vue";
import { eq, sql, and, or } from "drizzle-orm";
import {
  syncQueue as syncQueueTable,
  type SelectSyncQueue,
  type InsertSyncQueue,
} from "~/database/schemas";
import type { SyncRule } from "../syncRules";
import {
  QUEUE_OPERATION,
  QUEUE_STATUS,
  type QueueOperation,
  type QueueSummary,
  type RemoteFileInfo,
  type SyncError,
  type SyncQueueEntry,
} from "./types";
import { dbRowToQueueEntry } from "~/lib/fileSync";

interface FilesQueueState {
  queueSummary: Ref<QueueSummary | null>;
  queueEntries: Ref<SyncQueueEntry[]>;
  syncErrors: Ref<SyncError[]>;
  currentRuleId: Ref<string | null>;
}

export type FilesQueue = ReturnType<typeof useFilesQueue>;

export function useFilesQueue({
  queueSummary,
  queueEntries,
  syncErrors,
  currentRuleId,
}: FilesQueueState) {
  const haexVaultStore = useHaexVaultStore();

  // ==========================================================================
  // Queue Management (via local Drizzle DB)
  // ==========================================================================

  /**
   * Load queue summary from local database
   */
  const loadQueueSummaryAsync = async (): Promise<void> => {
    if (!haexVaultStore.orm) return;

    try {
      // Get counts by status
      const allEntries = await haexVaultStore.orm.select().from(syncQueueTable);

      let pendingCount = 0;
      let pendingUploadCount = 0;
      let pendingDownloadCount = 0;
      let inProgressCount = 0;
      let completedCount = 0;
      let failedCount = 0;
      let pendingBytes = 0;
      let currentEntry: SyncQueueEntry | null = null;

      for (const row of allEntries) {
        const entry = dbRowToQueueEntry(row);
        switch (entry.status) {
          case QUEUE_STATUS.PENDING:
            pendingCount++;
            pendingBytes += entry.fileSize;
            if (entry.operation === QUEUE_OPERATION.UPLOAD) {
              pendingUploadCount++;
            } else if (entry.operation === QUEUE_OPERATION.DOWNLOAD) {
              pendingDownloadCount++;
            }
            break;
          case QUEUE_STATUS.IN_PROGRESS:
            inProgressCount++;
            if (!currentEntry) currentEntry = entry;
            break;
          case QUEUE_STATUS.COMPLETED:
            completedCount++;
            break;
          case QUEUE_STATUS.FAILED:
            failedCount++;
            break;
        }
      }

      queueSummary.value = {
        pendingCount,
        pendingUploadCount,
        pendingDownloadCount,
        inProgressCount,
        completedCount,
        failedCount,
        pendingBytes,
        currentEntry,
      };
    } catch (error) {
      console.warn("[haex-files] Failed to load queue summary:", error);
    }
  };

  /**
   * Load queue entries from local database
   */
  const loadQueueEntriesAsync = async (ruleId?: string): Promise<void> => {
    if (!haexVaultStore.orm) return;

    try {
      let rows: SelectSyncQueue[];
      if (ruleId) {
        rows = await haexVaultStore.orm
          .select()
          .from(syncQueueTable)
          .where(eq(syncQueueTable.ruleId, ruleId));
      } else {
        rows = await haexVaultStore.orm.select().from(syncQueueTable);
      }
      queueEntries.value = rows.map(dbRowToQueueEntry);
    } catch (error) {
      console.warn("[haex-files] Failed to load queue entries:", error);
      queueEntries.value = [];
    }
  };

  /**
   * Check if a file is already pending in the queue
   */
  const isFileInQueue = async (
    ruleId: string,
    backendId: string,
    relativePath: string,
    operation: QueueOperation
  ): Promise<boolean> => {
    if (!haexVaultStore.orm) return false;

    const existing = await haexVaultStore.orm
      .select()
      .from(syncQueueTable)
      .where(
        and(
          eq(syncQueueTable.ruleId, ruleId),
          eq(syncQueueTable.backendId, backendId),
          eq(syncQueueTable.relativePath, relativePath),
          eq(syncQueueTable.operation, operation),
          or(
            eq(syncQueueTable.status, QUEUE_STATUS.PENDING),
            eq(syncQueueTable.status, QUEUE_STATUS.IN_PROGRESS)
          )
        )
      )
      .limit(1);

    return existing.length > 0;
  };

  /**
   * Add files to the sync queue (skips files already in queue)
   */
  const addFilesToQueueAsync = async (
    ruleId: string,
    backendId: string,
    filesToAdd: Array<{ localPath: string; relativePath: string; fileSize: number }>
  ): Promise<SyncQueueEntry[]> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const now = new Date().toISOString();
    const entries: SyncQueueEntry[] = [];

    for (const file of filesToAdd) {
      // Skip if file is already pending/in_progress
      const alreadyInQueue = await isFileInQueue(
        ruleId,
        backendId,
        file.relativePath,
        QUEUE_OPERATION.UPLOAD
      );
      if (alreadyInQueue) {
        continue;
      }

      const id = crypto.randomUUID();

      const newRow: InsertSyncQueue = {
        id,
        ruleId,
        localPath: file.localPath,
        relativePath: file.relativePath,
        backendId,
        operation: QUEUE_OPERATION.UPLOAD,
        status: QUEUE_STATUS.PENDING,
        priority: 100,
        fileSize: file.fileSize,
        createdAt: now,
      };

      await haexVaultStore.orm.insert(syncQueueTable).values(newRow);

      entries.push(dbRowToQueueEntry(newRow as SelectSyncQueue));
    }

    await loadQueueSummaryAsync();
    return entries;
  };

  /**
   * Add downloads to the sync queue (skips files already in queue)
   */
  const addDownloadsToQueueAsync = async (
    ruleId: string,
    rule: SyncRule,
    remoteFiles: RemoteFileInfo[]
  ): Promise<SyncQueueEntry[]> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const now = new Date().toISOString();
    const entries: SyncQueueEntry[] = [];

    for (const file of remoteFiles) {
      // Skip if file is already pending/in_progress
      // Use file.key for queue check since that's what we store as relativePath for downloads
      const alreadyInQueue = await isFileInQueue(
        ruleId,
        file.backendId,
        file.key,
        QUEUE_OPERATION.DOWNLOAD
      );
      if (alreadyInQueue) {
        continue;
      }

      const id = crypto.randomUUID();

      // Construct local path from sync rule's localPath + relativePath
      // Normalize paths to avoid double slashes
      const basePath = rule.localPath.replace(/\/+$/, ""); // Remove trailing slashes
      const relPath = file.relativePath.replace(/^\/+/, ""); // Remove leading slashes
      const localPath = `${basePath}/${relPath}`;

      // For downloads, store the actual remote key in relativePath
      // This allows processDownloadEntryAsync to download from the correct location
      const newRow: InsertSyncQueue = {
        id,
        ruleId,
        localPath,
        relativePath: file.key, // Store full remote key for downloads
        backendId: file.backendId,
        operation: QUEUE_OPERATION.DOWNLOAD,
        status: QUEUE_STATUS.PENDING,
        priority: 100,
        fileSize: file.size,
        createdAt: now,
      };

      await haexVaultStore.orm.insert(syncQueueTable).values(newRow);
      entries.push(dbRowToQueueEntry(newRow as SelectSyncQueue));
    }

    await loadQueueSummaryAsync();
    return entries;
  };

  /**
   * Mark a queue entry as started
   */
  const startQueueEntryAsync = async (entryId: string): Promise<void> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .update(syncQueueTable)
      .set({
        status: QUEUE_STATUS.IN_PROGRESS,
        startedAt: new Date().toISOString(),
      })
      .where(eq(syncQueueTable.id, entryId));
  };

  /**
   * Mark a queue entry as completed
   */
  const completeQueueEntryAsync = async (entryId: string): Promise<void> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .update(syncQueueTable)
      .set({
        status: QUEUE_STATUS.COMPLETED,
        completedAt: new Date().toISOString(),
      })
      .where(eq(syncQueueTable.id, entryId));
  };

  /**
   * Mark a queue entry as failed
   */
  const failQueueEntryAsync = async (entryId: string, errorMessage: string): Promise<void> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .update(syncQueueTable)
      .set({
        status: QUEUE_STATUS.FAILED,
        errorMessage,
        completedAt: new Date().toISOString(),
        retryCount: sql`${syncQueueTable.retryCount} + 1`,
      })
      .where(eq(syncQueueTable.id, entryId));
  };

  /**
   * Retry all failed queue entries
   */
  const retryFailedQueueAsync = async (): Promise<void> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .update(syncQueueTable)
      .set({
        status: QUEUE_STATUS.PENDING,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      })
      .where(eq(syncQueueTable.status, QUEUE_STATUS.FAILED));

    syncErrors.value = [];
    await loadQueueSummaryAsync();
  };

  /**
   * Remove a queue entry
   */
  const removeQueueEntryAsync = async (entryId: string): Promise<void> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .delete(syncQueueTable)
      .where(eq(syncQueueTable.id, entryId));

    await loadQueueSummaryAsync();
    await loadQueueEntriesAsync(currentRuleId.value ?? undefined);
  };

  /**
   * Clear entire queue for a sync rule
   */
  const clearQueueAsync = async (ruleId: string): Promise<void> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .delete(syncQueueTable)
      .where(eq(syncQueueTable.ruleId, ruleId));

    await loadQueueSummaryAsync();
    queueEntries.value = [];
  };

  /**
   * Recover stuck in_progress entries (from crash)
   */
  const recoverQueueAsync = async (): Promise<void> => {
    if (!haexVaultStore.orm) return;

    await haexVaultStore.orm
      .update(syncQueueTable)
      .set({
        status: QUEUE_STATUS.PENDING,
        startedAt: null,
      })
      .where(eq(syncQueueTable.status, QUEUE_STATUS.IN_PROGRESS));
  };

  return {
    loadQueueSummaryAsync,
    loadQueueEntriesAsync,
    isFileInQueue,
    addFilesToQueueAsync,
    addDownloadsToQueueAsync,
    startQueueEntryAsync,
    completeQueueEntryAsync,
    failQueueEntryAsync,
    retryFailedQueueAsync,
    removeQueueEntryAsync,
    clearQueueAsync,
    recoverQueueAsync,
  };
}
