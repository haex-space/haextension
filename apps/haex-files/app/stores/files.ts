// stores/files.ts
// File sync operations using:
// - Core filesystem API for local file operations
// - Core remoteStorage API for cloud storage operations
// - Local Drizzle DB for sync queue management

import { eq, sql, and, or } from "drizzle-orm";
import { minimatch } from "minimatch";
import type { DirEntry, FileChangeEvent } from "@haex-space/vault-sdk";
import { HAEXTENSION_EVENTS } from "@haex-space/vault-sdk";
import {
  syncQueue as syncQueueTable,
  syncState as syncStateTable,
  type SelectSyncQueue,
  type InsertSyncQueue,
  type SelectSyncState,
  type InsertSyncState,
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

/** Remote file info from storage scan */
export interface RemoteFileInfo {
  /** Full object key on remote storage */
  key: string;
  /** Relative path (key without sync prefix) */
  relativePath: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp (ISO 8601) */
  lastModified: string | null;
  /** Backend ID */
  backendId: string;
}

/** Conflict information for bidirectional sync */
export interface SyncConflict {
  relativePath: string;
  localFile: LocalFileInfo;
  remoteFile: RemoteFileInfo;
  /** User's resolution choice */
  resolution?: "local" | "remote" | "keepBoth" | "skip";
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
  pendingUploadCount: number;
  pendingDownloadCount: number;
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

  // Native file watcher state
  const watcherEnabled = ref(false);
  const watchedRules = ref<Set<string>>(new Set()); // Set of actively watched rule IDs
  const fileChangeEventHandler = ref<((event: FileChangeEvent) => void) | null>(null); // Event listener reference

  // Fallback polling state (runs less frequently as backup)
  const pollingInterval = ref<ReturnType<typeof setInterval> | null>(null);
  const pollingIntervalMs = ref(5 * 60 * 1000); // Fallback polling every 5 minutes
  const lastKnownFileHashes = ref<Map<string, string>>(new Map()); // ruleId -> hash of file list

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
   * Scan all remote files for a sync rule from configured backends
   * Supports multiple remote paths for download rules
   */
  const scanRemoteFilesAsync = async (ruleId: string): Promise<RemoteFileInfo[]> => {
    const rule = syncRulesStore.getRule(ruleId);
    if (!rule) return [];

    const allRemoteFiles: RemoteFileInfo[] = [];

    for (const backendId of rule.backendIds) {
      // Use remotePaths if specified (for download rules), otherwise use sync prefix
      const paths = rule.remotePaths.length > 0 ? rule.remotePaths : [`sync/${ruleId}/`];

      for (const remotePath of paths) {
        try {
          // First, try listing with the path as a folder prefix (with trailing slash)
          const folderPrefix = remotePath.endsWith("/") ? remotePath : remotePath + "/";
          const objects = await haexVaultStore.client.remoteStorage.list(backendId, folderPrefix);

          if (objects.length > 0) {
            // It's a folder - process all files under it
            for (const obj of objects) {
              // Extract relative path by removing the folder prefix
              const relativePath = obj.key.startsWith(folderPrefix)
                ? obj.key.slice(folderPrefix.length)
                : obj.key;

              // Skip empty relative paths (the folder itself) and ignored paths
              if (!relativePath || isPathIgnored(relativePath, rule.ignorePatterns)) {
                continue;
              }

              allRemoteFiles.push({
                key: obj.key,
                relativePath,
                size: obj.size,
                lastModified: obj.lastModified ?? null,
                backendId,
              });
            }
          } else {
            // No files found with folder prefix - might be a single file
            // Try listing with exact path (without trailing slash)
            const exactObjects = await haexVaultStore.client.remoteStorage.list(backendId, remotePath);
            const exactMatch = exactObjects.find(obj => obj.key === remotePath);

            if (exactMatch) {
              // It's a single file
              const fileName = remotePath.split("/").pop() || remotePath;
              if (!isPathIgnored(fileName, rule.ignorePatterns)) {
                allRemoteFiles.push({
                  key: exactMatch.key,
                  relativePath: fileName,
                  size: exactMatch.size,
                  lastModified: exactMatch.lastModified ?? null,
                  backendId,
                });
              }
            }
          }
        } catch (error) {
          console.warn(`[haex-files] Failed to scan remote files from backend ${backendId} with path ${remotePath}:`, error);
        }
      }
    }

    return allRemoteFiles;
  };

  /**
   * Load remote files for display in the UI
   */
  const loadRemoteFilesAsync = async (ruleId: string): Promise<void> => {
    isLoadingRemote.value = true;
    try {
      remoteFiles.value = await scanRemoteFilesAsync(ruleId);
    } catch (error) {
      console.warn("[haex-files] Failed to load remote files:", error);
      remoteFiles.value = [];
    } finally {
      isLoadingRemote.value = false;
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

  // ==========================================================================
  // Auto-Sync Watcher (Native + Fallback Polling)
  // ==========================================================================

  /**
   * Generate a simple hash of file list for change detection (used by fallback polling)
   * Uses file paths, sizes, and modification times
   */
  const generateFileListHash = (fileList: LocalFileInfo[]): string => {
    const sortedFiles = [...fileList]
      .filter(f => !f.isDirectory)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    const hashInput = sortedFiles
      .map(f => `${f.relativePath}:${f.size}:${f.modifiedAt ?? 0}`)
      .join("|");

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  };

  /**
   * Handle file change events from native file watcher
   */
  const handleFileChangeEvent = async (event: FileChangeEvent): Promise<void> => {
    console.log(`[haex-files] Native file change detected:`, event);

    // Skip if already syncing
    if (isSyncing.value) {
      console.log("[haex-files] Sync already in progress, skipping auto-sync");
      return;
    }

    const rule = syncRulesStore.getRule(event.ruleId);
    if (!rule) {
      console.warn(`[haex-files] Unknown rule for file change event: ${event.ruleId}`);
      return;
    }

    // Skip if rule is disabled or direction is download-only
    if (!rule.enabled || rule.direction === "down") {
      return;
    }

    // Refresh file list immediately if viewing this rule (before sync starts)
    if (currentRuleId.value === event.ruleId) {
      await loadFilesAsync(event.ruleId, currentSubpath.value);
    }

    // Trigger sync for this rule
    console.log(`[haex-files] Triggering auto-sync for rule "${event.ruleId}" due to file change`);
    await triggerSyncAsync(event.ruleId);
  };

  /**
   * Start native file watcher for a sync rule
   */
  const startNativeWatcherForRuleAsync = async (rule: SyncRule): Promise<boolean> => {
    // Skip if rule is disabled or direction is download-only (no upload needed)
    if (!rule.enabled || rule.direction === "down") {
      return false;
    }

    try {
      // Check if already watching
      const isWatching = await haexVaultStore.client.filesystem.isWatching(rule.id);
      if (isWatching) {
        watchedRules.value.add(rule.id);
        return true;
      }

      // Start native watcher
      await haexVaultStore.client.filesystem.watch(rule.id, rule.localPath);
      watchedRules.value.add(rule.id);
      console.log(`[haex-files] Native watcher started for rule "${rule.id}" at: ${rule.localPath}`);
      return true;
    } catch (error) {
      console.warn(`[haex-files] Failed to start native watcher for rule "${rule.id}":`, error);
      return false;
    }
  };

  /**
   * Stop native file watcher for a sync rule
   */
  const stopNativeWatcherForRuleAsync = async (ruleId: string): Promise<void> => {
    try {
      await haexVaultStore.client.filesystem.unwatch(ruleId);
      watchedRules.value.delete(ruleId);
      console.log(`[haex-files] Native watcher stopped for rule "${ruleId}"`);
    } catch (error) {
      console.warn(`[haex-files] Failed to stop native watcher for rule "${ruleId}":`, error);
    }
  };

  /**
   * Check a single sync rule for changes (fallback polling)
   */
  const checkRuleForChangesAsync = async (rule: SyncRule): Promise<void> => {
    // Skip if rule is disabled or direction is download-only
    if (!rule.enabled || rule.direction === "down") {
      return;
    }

    try {
      // Scan all files for this rule
      const currentFiles = await scanAllLocalFilesAsync(rule.id);
      const currentHash = generateFileListHash(currentFiles);
      const previousHash = lastKnownFileHashes.value.get(rule.id);

      // Update the stored hash
      lastKnownFileHashes.value.set(rule.id, currentHash);

      // If hash changed and we have a previous hash (not first run), trigger sync
      if (previousHash && currentHash !== previousHash) {
        console.log(`[haex-files] Fallback polling: changes detected in rule "${rule.id}", triggering sync...`);
        await triggerSyncAsync(rule.id);
      }
    } catch (error) {
      // Silently ignore errors during background watching
      console.debug(`[haex-files] Polling error for rule ${rule.id}:`, error);
    }
  };

  /**
   * Run one iteration of the fallback polling (check all rules)
   */
  const runPollingIterationAsync = async (): Promise<void> => {
    // Don't run if already syncing
    if (isSyncing.value) {
      return;
    }

    const rules = syncRulesStore.syncRules;
    for (const rule of rules) {
      await checkRuleForChangesAsync(rule);
    }
  };

  /**
   * Start the auto-sync watcher (native + fallback polling)
   * Uses native file system events for real-time detection with fallback polling every 5 minutes
   * Also triggers initial sync for all enabled rules to catch any pending changes
   */
  const startWatcher = async (): Promise<void> => {
    if (watcherEnabled.value) {
      console.log("[haex-files] Watcher already running");
      return;
    }

    watcherEnabled.value = true;
    const rules = syncRulesStore.syncRules;

    // Start native watchers for all applicable rules
    let nativeWatchersStarted = 0;
    for (const rule of rules) {
      if (rule.enabled && rule.direction !== "down") {
        const success = await startNativeWatcherForRuleAsync(rule);
        if (success) nativeWatchersStarted++;
      }
    }

    // Register event listener for native file change events
    if (fileChangeEventHandler.value) {
      haexVaultStore.client.off(HAEXTENSION_EVENTS.FILE_CHANGED, fileChangeEventHandler.value as any);
    }
    fileChangeEventHandler.value = (event: FileChangeEvent) => {
      handleFileChangeEvent(event);
    };
    haexVaultStore.client.on(
      HAEXTENSION_EVENTS.FILE_CHANGED,
      fileChangeEventHandler.value as any
    );

    // Initialize hashes for fallback polling
    for (const rule of rules) {
      if (rule.enabled && rule.direction !== "down") {
        try {
          const files = await scanAllLocalFilesAsync(rule.id);
          lastKnownFileHashes.value.set(rule.id, generateFileListHash(files));
        } catch {
          // Ignore initialization errors
        }
      }
    }

    // Trigger initial sync for all enabled rules to catch any pending changes
    console.log("[haex-files] Running initial sync for all enabled rules...");
    for (const rule of rules) {
      if (rule.enabled) {
        try {
          await triggerSyncAsync(rule.id);
        } catch (error) {
          console.warn(`[haex-files] Initial sync failed for rule "${rule.id}":`, error);
        }
      }
    }

    // Start fallback polling (every 5 minutes)
    pollingInterval.value = setInterval(() => {
      runPollingIterationAsync();
    }, pollingIntervalMs.value);

    console.log(`[haex-files] Auto-sync watcher started: ${nativeWatchersStarted} native watchers, fallback polling every ${pollingIntervalMs.value / 1000}s`);
  };

  /**
   * Stop the auto-sync watcher
   */
  const stopWatcher = async (): Promise<void> => {
    // Stop native watchers
    for (const ruleId of watchedRules.value) {
      await stopNativeWatcherForRuleAsync(ruleId);
    }
    watchedRules.value.clear();

    // Unsubscribe from events
    if (fileChangeEventHandler.value) {
      haexVaultStore.client.off(HAEXTENSION_EVENTS.FILE_CHANGED, fileChangeEventHandler.value as any);
      fileChangeEventHandler.value = null;
    }

    // Stop fallback polling
    if (pollingInterval.value) {
      clearInterval(pollingInterval.value);
      pollingInterval.value = null;
    }

    watcherEnabled.value = false;
    lastKnownFileHashes.value.clear();
    console.log("[haex-files] Auto-sync watcher stopped");
  };

  /**
   * Check if watcher is running
   */
  const isWatcherRunning = computed(() => watcherEnabled.value);

  /**
   * Get number of active native watchers
   */
  const activeNativeWatchers = computed(() => watchedRules.value.size);

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
