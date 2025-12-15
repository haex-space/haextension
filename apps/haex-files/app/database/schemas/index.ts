import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  blob,
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
    // Space key wrapped with master key (Base64 encoded)
    wrappedKey: blob("wrapped_key", { mode: "buffer" }).notNull(),
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
    // File key wrapped with space key (Base64 encoded)
    wrappedKey: blob("wrapped_key", { mode: "buffer" }),
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

/**
 * Storage backends (S3, R2, MinIO, etc.)
 * Credentials are stored encrypted
 */
export const backends = sqliteTable(
  tableName("backends"),
  {
    id: text().primaryKey(),
    name: text().notNull(),
    type: text().notNull(), // s3, r2, minio, gdrive, dropbox
    // Encrypted config (contains credentials)
    encryptedConfig: blob("encrypted_config", { mode: "buffer" }).notNull(),
    enabled: integer({ mode: "boolean" }).notNull().default(true),
    lastTestedAt: text("last_tested_at"),
    ...timestamps,
  }
);
export type InsertBackend = typeof backends.$inferInsert;
export type SelectBackend = typeof backends.$inferSelect;

/**
 * Sync rules - which folders sync to which backends
 */
export const syncRules = sqliteTable(
  tableName("sync_rules"),
  {
    id: text().primaryKey(),
    spaceId: text("space_id")
      .references((): AnySQLiteColumn => spaces.id, { onDelete: "cascade" })
      .notNull(),
    localPath: text("local_path").notNull(), // Path within the space
    backendId: text("backend_id")
      .references((): AnySQLiteColumn => backends.id, { onDelete: "cascade" })
      .notNull(),
    direction: text().notNull().default("both"), // up, down, both
    enabled: integer({ mode: "boolean" }).notNull().default(true),
    ...timestamps,
  }
);
export type InsertSyncRule = typeof syncRules.$inferInsert;
export type SelectSyncRule = typeof syncRules.$inferSelect;

/**
 * File-Backend mapping (which file is on which backends)
 */
export const fileBackends = sqliteTable(
  tableName("file_backends"),
  {
    id: text().primaryKey(),
    fileId: text("file_id")
      .references((): AnySQLiteColumn => files.id, { onDelete: "cascade" })
      .notNull(),
    backendId: text("backend_id")
      .references((): AnySQLiteColumn => backends.id, { onDelete: "cascade" })
      .notNull(),
    remoteId: text("remote_id").notNull(), // ID/path on the remote backend
    syncedAt: text("synced_at"),
    createdAt,
  }
);
export type InsertFileBackend = typeof fileBackends.$inferInsert;
export type SelectFileBackend = typeof fileBackends.$inferSelect;

/**
 * Sync queue for pending operations
 */
export const syncQueue = sqliteTable(
  tableName("sync_queue"),
  {
    id: text().primaryKey(),
    fileId: text("file_id")
      .references((): AnySQLiteColumn => files.id, { onDelete: "cascade" })
      .notNull(),
    backendId: text("backend_id")
      .references((): AnySQLiteColumn => backends.id, { onDelete: "cascade" })
      .notNull(),
    operation: text().notNull(), // upload, download, delete
    priority: integer().notNull().default(0),
    status: text().notNull().default("pending"), // pending, in_progress, completed, failed
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    scheduledAt: text("scheduled_at").default(sql`(CURRENT_TIMESTAMP)`),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  }
);
export type InsertSyncQueue = typeof syncQueue.$inferInsert;
export type SelectSyncQueue = typeof syncQueue.$inferSelect;
