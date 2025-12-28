import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";

// Helper function to create prefixed table names
const extensionName = (manifest as { name?: string }).name || packageJson.name;
const tableName = (name: string) => getTableName(manifest.publicKey, extensionName, name);

// Reusable timestamp columns
const createdAt = text("created_at").default(sql`(CURRENT_TIMESTAMP)`);
const updatedAt = text("updated_at").default(sql`(CURRENT_TIMESTAMP)`);
const timestamps = { createdAt, updatedAt };

/**
 * Extension settings (key-value store)
 * Used to store the Master-Key in plaintext (safe because DB is SQLCipher-encrypted)
 */
export const settings = sqliteTable(
  tableName("settings"),
  {
    key: text().primaryKey(),
    value: text().notNull(),
    ...timestamps,
  }
);
export type InsertSettings = typeof settings.$inferInsert;
export type SelectSettings = typeof settings.$inferSelect;

/**
 * File Spaces (like folders/vaults for grouping files)
 * Each space has its own encryption key (wrapped with master key)
 */
export const spaces = sqliteTable(
  tableName("spaces"),
  {
    id: text().primaryKey(),
    name: text().notNull(),
    description: text(),
    // Space key wrapped with master key (Base64 encoded string)
    wrappedKey: text("wrapped_key").notNull(),
    isPersonal: integer("is_personal", { mode: "boolean" }).notNull().default(true),
    fileCount: integer("file_count").notNull().default(0),
    totalSize: integer("total_size").notNull().default(0),
    ...timestamps,
  }
);
export type InsertSpace = typeof spaces.$inferInsert;
export type SelectSpace = typeof spaces.$inferSelect;

/**
 * Files in the sync system
 * Each file has its own encryption key (wrapped with space key)
 */
export const files = sqliteTable(
  tableName("files"),
  {
    id: text().primaryKey(),
    spaceId: text("space_id")
      .references((): AnySQLiteColumn => spaces.id, { onDelete: "cascade" })
      .notNull(),
    name: text().notNull(), // Encrypted filename (TODO: encrypt)
    path: text().notNull(), // Virtual path in space (e.g., "/photos/2024/")
    mimeType: text("mime_type"),
    size: integer().notNull().default(0),
    contentHash: text("content_hash"), // SHA-256 of plaintext content
    isDirectory: integer("is_directory", { mode: "boolean" }).notNull().default(false),
    // File key wrapped with space key (Base64 encoded string)
    wrappedKey: text("wrapped_key"),
    // Sync state
    syncState: text("sync_state").notNull().default("localOnly"), // synced, syncing, localOnly, remoteOnly, conflict, error
    lastSyncedAt: text("last_synced_at"),
    ...timestamps,
  }
);
export type InsertFile = typeof files.$inferInsert;
export type SelectFile = typeof files.$inferSelect;

/**
 * File chunks for large files
 * Stores metadata about encrypted chunks
 */
export const fileChunks = sqliteTable(
  tableName("file_chunks"),
  {
    id: text().primaryKey(),
    fileId: text("file_id")
      .references((): AnySQLiteColumn => files.id, { onDelete: "cascade" })
      .notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    size: integer().notNull(),
    encryptedSize: integer("encrypted_size").notNull(),
    contentHash: text("content_hash").notNull(), // Hash of encrypted chunk
    remoteId: text("remote_id"), // ID on storage backend
    createdAt,
  }
);
export type InsertFileChunk = typeof fileChunks.$inferInsert;
export type SelectFileChunk = typeof fileChunks.$inferSelect;

// NOTE: Storage backends are now managed centrally by haex-vault Core.
// Use client.remoteStorage.backends.* to interact with backends.
// The backends are stored in haex_storage_backends table in Core.

/**
 * Sync rules - which local folders sync to which remote backends
 * Backend IDs reference haex_storage_backends in Core (via remoteStorage API)
 */
export const syncRules = sqliteTable(
  tableName("sync_rules"),
  {
    id: text().primaryKey(),
    spaceId: text("space_id")
      .references((): AnySQLiteColumn => spaces.id, { onDelete: "cascade" })
      .notNull(),
    localPath: text("local_path").notNull(), // Local filesystem path (source for up, destination for down)
    // Remote path/prefix for download rules (optional, only used when direction is "down")
    remotePath: text("remote_path"), // Remote prefix to sync from (e.g., "photos/2024/")
    // JSON array of backend IDs (references Core haex_storage_backends)
    backendIds: text("backend_ids").notNull().default("[]"),
    direction: text().notNull().default("both"), // up, down, both
    enabled: integer({ mode: "boolean" }).notNull().default(true),
    // Gitignore-like patterns for files to exclude
    ignorePatterns: text("ignore_patterns").notNull().default("[]"),
    // Conflict resolution strategy
    conflictStrategy: text("conflict_strategy").notNull().default("ask"), // local, remote, newer, ask, keepBoth
    ...timestamps,
  }
);
export type InsertSyncRule = typeof syncRules.$inferInsert;
export type SelectSyncRule = typeof syncRules.$inferSelect;

/**
 * File-Backend mapping (which file is on which backends)
 * Backend IDs reference haex_storage_backends in Core
 */
export const fileBackends = sqliteTable(
  tableName("file_backends"),
  {
    id: text().primaryKey(),
    fileId: text("file_id")
      .references((): AnySQLiteColumn => files.id, { onDelete: "cascade" })
      .notNull(),
    // Backend ID (references Core haex_storage_backends)
    backendId: text("backend_id").notNull(),
    remoteKey: text("remote_key").notNull(), // Object key on the remote backend
    syncedAt: text("synced_at"),
    createdAt,
  }
);
export type InsertFileBackend = typeof fileBackends.$inferInsert;
export type SelectFileBackend = typeof fileBackends.$inferSelect;

/**
 * Sync queue for pending operations
 * Tracks upload/download operations to remote backends
 */
export const syncQueue = sqliteTable(
  tableName("sync_queue"),
  {
    id: text().primaryKey(),
    // Reference to sync rule
    ruleId: text("rule_id")
      .references((): AnySQLiteColumn => syncRules.id, { onDelete: "cascade" })
      .notNull(),
    // Local file path
    localPath: text("local_path").notNull(),
    // Relative path from sync root (used as remote key)
    relativePath: text("relative_path").notNull(),
    // Backend ID (references Core haex_storage_backends)
    backendId: text("backend_id").notNull(),
    operation: text().notNull(), // upload, download, delete
    priority: integer().notNull().default(100),
    status: text().notNull().default("pending"), // pending, inProgress, completed, failed
    fileSize: integer("file_size").notNull().default(0),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  }
);
export type InsertSyncQueue = typeof syncQueue.$inferInsert;
export type SelectSyncQueue = typeof syncQueue.$inferSelect;

/**
 * Sync state - tracks known files for deletion detection
 * When a file is synced, its path is recorded here
 * If a file exists in syncState but not locally, it was deleted
 * If a file exists locally but not in syncState, it's new
 */
export const syncState = sqliteTable(
  tableName("sync_state"),
  {
    id: text().primaryKey(),
    // Reference to sync rule
    ruleId: text("rule_id")
      .references((): AnySQLiteColumn => syncRules.id, { onDelete: "cascade" })
      .notNull(),
    // Relative path from sync root
    relativePath: text("relative_path").notNull(),
    // Backend ID (references Core haex_storage_backends)
    backendId: text("backend_id").notNull(),
    // File metadata at last sync
    fileSize: integer("file_size").notNull().default(0),
    lastModified: text("last_modified"),
    contentHash: text("content_hash"), // For conflict detection
    // When this file was last synced
    lastSyncedAt: text("last_synced_at").default(sql`(CURRENT_TIMESTAMP)`),
  }
);
export type InsertSyncState = typeof syncState.$inferInsert;
export type SelectSyncState = typeof syncState.$inferSelect;
