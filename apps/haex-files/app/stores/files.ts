// stores/files.ts
// File sync operations using:
// - Core filesystem API for local file operations
// - Core remoteStorage API for cloud storage operations
// - Local Drizzle DB for sync queue management

import { eq, sql } from "drizzle-orm";
import { minimatch } from "minimatch";
import type { DirEntry } from "@haex-space/vault-sdk";
import {
  syncQueue as syncQueueTable,
  type SelectSyncQueue,
  type InsertSyncQueue,
} from "~/database/schemas";
import type { SyncRule } from "./syncRules";

// ============================================================================
// Types
// ============================================================================

/** Local file info from filesystem scan */
export interface LocalFileInfo {
  /** File name */
  name: string;
  /** Full local path */
  path: string;
  /** Relative path from sync root */
  relativePath: string;
  /** File size in bytes */
  size: number;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Last modified timestamp (Unix ms) */
  modifiedAt: number | null;
}

/** Queue operation type */
export type QueueOperation = "upload" | "download" | "delete";

/** Queue entry status */
export type QueueStatus = "pending" | "inProgress" | "completed" | "failed";

/** Queue status constants */
export const QUEUE_STATUS = {
  PENDING: "pending" as const,
  IN_PROGRESS: "inProgress" as const,
  COMPLETED: "completed" as const,
  FAILED: "failed" as const,
};

/** Queue operation constants */
export const QUEUE_OPERATION = {
  UPLOAD: "upload" as const,
  DOWNLOAD: "download" as const,
  DELETE: "delete" as const,
};

/** A sync queue entry */
export interface SyncQueueEntry {
  id: string;
  ruleId: string;
  localPath: string;
  relativePath: string;
  backendId: string;
  operation: QueueOperation;
  status: QueueStatus;
  priority: number;
  fileSize: number;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

/** Aggregated queue summary */
export interface QueueSummary {
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  failedCount: number;
  pendingBytes: number;
  currentEntry: SyncQueueEntry | null;
}

/** Sync error for display */
export interface SyncError {
  fileId: string;
  fileName: string;
  error: string;
  timestamp: string;
}

/** Sync status */
export interface LocalSyncStatus {
  isSyncing: boolean;
  pendingUploads: number;
  pendingDownloads: number;
  lastSync: string | null;
  errors: SyncError[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert DirEntry from filesystem API to LocalFileInfo
 */
function dirEntryToLocalFileInfo(entry: DirEntry, syncRootPath: string): LocalFileInfo {
  // Calculate relative path from sync root
  let relativePath = entry.path;
  if (entry.path.startsWith(syncRootPath)) {
    relativePath = entry.path.slice(syncRootPath.length);
    if (relativePath.startsWith("/") || relativePath.startsWith("\\")) {
      relativePath = relativePath.slice(1);
    }
  }

  return {
    name: entry.name,
    path: entry.path,
    relativePath,
    size: entry.size,
    isDirectory: entry.isDirectory,
    modifiedAt: entry.modified ?? null,
  };
}

/**
 * Convert database row to SyncQueueEntry
 */
function dbRowToQueueEntry(row: SelectSyncQueue): SyncQueueEntry {
  return {
    id: row.id,
    ruleId: row.ruleId,
    localPath: row.localPath,
    relativePath: row.relativePath,
    backendId: row.backendId,
    operation: row.operation as QueueOperation,
    status: row.status as QueueStatus,
    priority: row.priority ?? 100,
    fileSize: row.fileSize ?? 0,
    errorMessage: row.errorMessage,
    retryCount: row.retryCount ?? 0,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

/**
 * Check if a file path matches any of the ignore patterns
 */
export function isPathIgnored(relativePath: string, ignorePatterns: string[]): boolean {
  for (const pattern of ignorePatterns) {
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern || trimmedPattern.startsWith("#")) continue;

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

/**
 * Extract a readable error message from various error types
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    if ("message" in error && typeof error.message === "string") return error.message;
    if ("reason" in error && typeof error.reason === "string") return error.reason;
    if ("error" in error && typeof error.error === "string") return error.error;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }
  return "Unknown error";
}

// ============================================================================
// Store
// ============================================================================

export const useFilesStore = defineStore("files", () => {
  const haexVaultStore = useHaexVaultStore();
  const syncRulesStore = useSyncRulesStore();

  // State
  const files = ref<LocalFileInfo[]>([]);
  const isLoading = ref(false);
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
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  });

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
   * Add files to the sync queue
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

      // Use INSERT OR REPLACE to handle duplicates
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

  // ==========================================================================
  // Sync Operations
  // ==========================================================================

  /**
   * Process the next pending queue entry
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
      // Read local file
      const fileData = await haexVaultStore.client.filesystem.readFile(entry.localPath);

      // TODO: Encrypt file data with space key before upload
      // For now, upload plaintext (encryption will be added in next phase)

      // Upload to remote storage
      const remoteKey = `sync/${entry.ruleId}/${entry.relativePath}`;
      await haexVaultStore.client.remoteStorage.upload(entry.backendId, remoteKey, fileData);

      // Mark as completed
      await completeQueueEntryAsync(entry.id);
      console.log(`[haex-files] Uploaded: ${entry.relativePath}`);
    } catch (error) {
      const errorMsg = extractErrorMessage(error);
      await failQueueEntryAsync(entry.id, errorMsg);
      console.warn(`[haex-files] Upload failed: ${entry.relativePath}`, error);

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
   * Recursively scan all local files for a sync rule
   */
  const scanAllLocalFilesAsync = async (
    ruleId: string,
    subpath: string = ""
  ): Promise<LocalFileInfo[]> => {
    const rule = syncRulesStore.getRule(ruleId);
    if (!rule) return [];

    let fullPath = rule.localPath;
    if (subpath) {
      fullPath = `${rule.localPath}/${subpath}`;
    }

    const entries = await haexVaultStore.client.filesystem.readDir(fullPath);
    const allFiles: LocalFileInfo[] = [];

    for (const entry of entries) {
      const fileInfo = dirEntryToLocalFileInfo(entry, rule.localPath);
      allFiles.push(fileInfo);

      if (entry.isDirectory) {
        const subFiles = await scanAllLocalFilesAsync(ruleId, fileInfo.relativePath);
        allFiles.push(...subFiles);
      }
    }

    return allFiles;
  };

  /**
   * Trigger a manual sync for a specific sync rule
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

    // Only sync if direction allows uploads
    if (rule.direction === "down") {
      console.log("[haex-files] Sync rule is download-only, skipping upload sync");
      lastSyncTime.value = new Date().toISOString();
      return;
    }

    isSyncing.value = true;
    syncErrors.value = [];

    try {
      // Reset any failed entries
      await retryFailedQueueAsync();

      // Scan all local files recursively
      const localFiles = await scanAllLocalFilesAsync(targetRuleId);

      // Filter out directories and ignored files
      const filesToSync = localFiles.filter(
        (f) => !f.isDirectory && !isPathIgnored(f.relativePath, rule.ignorePatterns)
      );

      if (filesToSync.length === 0) {
        console.log("[haex-files] No files to sync");
        lastSyncTime.value = new Date().toISOString();
        return;
      }

      console.log(`[haex-files] Adding ${filesToSync.length} files to queue...`);

      // Add files for each backend
      for (const backendId of rule.backendIds) {
        const queueFiles = filesToSync.map((f) => ({
          localPath: f.path,
          relativePath: f.relativePath,
          fileSize: f.size,
        }));

        await addFilesToQueueAsync(targetRuleId, backendId, queueFiles);
      }

      console.log("[haex-files] Files added to queue, starting processing...");

      // Process the queue
      await processQueueAsync();
    } catch (error) {
      console.error("[haex-files] Sync failed:", error);
      throw error;
    } finally {
      isSyncing.value = false;
      uploadProgress.value = null;
    }
  };

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
        error: e.errorMessage || "Upload failed",
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
      pendingUploads: summary?.pendingCount ?? 0,
      pendingDownloads: 0,
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

  return {
    // State
    files: computed(() => files.value),
    sortedFiles,
    isLoading: computed(() => isLoading.value),
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
    retryFailedQueueAsync,
    removeQueueEntryAsync,
    clearQueueAsync,
    // File sync status
    fileQueueStatusMap,
    getFileQueueStatus,
    // Cleanup
    clearSyncErrors,
    clear,
  };
});
