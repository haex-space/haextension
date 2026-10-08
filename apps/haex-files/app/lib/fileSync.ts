import { minimatch } from "minimatch";
import type { DirEntry } from "@haex-space/vault-sdk";
import type { SelectSyncQueue } from "~/database/schemas";
import type { LocalFileInfo, QueueOperation, QueueStatus, SyncQueueEntry } from "~/stores/files/types";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert DirEntry from filesystem API to LocalFileInfo
 */
export function dirEntryToLocalFileInfo(entry: DirEntry, syncRootPath: string): LocalFileInfo {
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
export function dbRowToQueueEntry(row: SelectSyncQueue): SyncQueueEntry {
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
export function extractErrorMessage(error: unknown): string {
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
