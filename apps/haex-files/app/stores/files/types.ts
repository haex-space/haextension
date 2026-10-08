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
