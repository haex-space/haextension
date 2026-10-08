import { eq } from "drizzle-orm";
import {
  syncQueue as syncQueueTable,
  syncState as syncStateTable,
  type SelectSyncQueue,
  type InsertSyncQueue,
  type SelectSyncState,
  type InsertSyncState,
} from "~/database/schemas";
import { QUEUE_OPERATION, QUEUE_STATUS, type SyncQueueEntry } from "./types";
import { dbRowToQueueEntry } from "~/lib/fileSync";
import type { FilesQueue } from "./queue";

export type FilesSyncState = ReturnType<typeof useFilesSyncState>;

export function useFilesSyncState({ isFileInQueue, loadQueueSummaryAsync }: FilesQueue) {
  const haexVaultStore = useHaexVaultStore();

  // ==========================================================================
  // Sync State Management (for delete detection)
  // ==========================================================================

  /**
   * Load known synced files from syncState for a rule
   */
  const loadSyncStateAsync = async (ruleId: string): Promise<SelectSyncState[]> => {
    if (!haexVaultStore.orm) return [];

    return await haexVaultStore.orm
      .select()
      .from(syncStateTable)
      .where(eq(syncStateTable.ruleId, ruleId));
  };

  /**
   * Update syncState after successful sync operation
   * Adds or updates the record for a synced file
   */
  const updateSyncStateAsync = async (
    ruleId: string,
    backendId: string,
    relativePath: string,
    fileSize: number,
    lastModified?: string | null
  ): Promise<void> => {
    if (!haexVaultStore.orm) return;

    const id = `${ruleId}:${backendId}:${relativePath}`;
    const now = new Date().toISOString();

    // Try to update existing record
    const result = await haexVaultStore.orm
      .update(syncStateTable)
      .set({
        fileSize,
        lastModified: lastModified ?? null,
        lastSyncedAt: now,
      })
      .where(eq(syncStateTable.id, id));

    // If no rows updated, insert new record
    if (!result || (result as any).rowsAffected === 0) {
      try {
        await haexVaultStore.orm.insert(syncStateTable).values({
          id,
          ruleId,
          relativePath,
          backendId,
          fileSize,
          lastModified: lastModified ?? null,
          lastSyncedAt: now,
        });
      } catch {
        // Record might already exist due to race condition, ignore
      }
    }
  };

  /**
   * Remove a file from syncState (after successful deletion)
   */
  const removeSyncStateAsync = async (
    ruleId: string,
    backendId: string,
    relativePath: string
  ): Promise<void> => {
    if (!haexVaultStore.orm) return;

    const id = `${ruleId}:${backendId}:${relativePath}`;
    await haexVaultStore.orm
      .delete(syncStateTable)
      .where(eq(syncStateTable.id, id));
  };

  /**
   * Add delete operations to queue for files that were synced but no longer exist locally
   */
  const addDeletesToQueueAsync = async (
    ruleId: string,
    backendIds: string[],
    deletedFiles: Array<{ relativePath: string; backendId: string }>
  ): Promise<SyncQueueEntry[]> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const now = new Date().toISOString();
    const entries: SyncQueueEntry[] = [];

    for (const file of deletedFiles) {
      // Skip if delete is already pending/in_progress
      const alreadyInQueue = await isFileInQueue(
        ruleId,
        file.backendId,
        file.relativePath,
        QUEUE_OPERATION.DELETE
      );
      if (alreadyInQueue) {
        continue;
      }

      const id = crypto.randomUUID();

      const newRow: InsertSyncQueue = {
        id,
        ruleId,
        localPath: "", // No local path for deletes
        relativePath: file.relativePath,
        backendId: file.backendId,
        operation: QUEUE_OPERATION.DELETE,
        status: QUEUE_STATUS.PENDING,
        priority: 100,
        fileSize: 0,
        createdAt: now,
      };

      await haexVaultStore.orm.insert(syncQueueTable).values(newRow);
      entries.push(dbRowToQueueEntry(newRow as SelectSyncQueue));
    }

    await loadQueueSummaryAsync();
    return entries;
  };

  return {
    loadSyncStateAsync,
    updateSyncStateAsync,
    removeSyncStateAsync,
    addDeletesToQueueAsync,
  };
}
