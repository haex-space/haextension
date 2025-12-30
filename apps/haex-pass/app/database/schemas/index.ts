import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";

// Helper function to create prefixed table names (with fallback to package.json for name)
const extensionName = (manifest as { name?: string }).name || packageJson.name;
const tableName = (name: string) =>
  getTableName(manifest.publicKey, extensionName, name);

export const haexPasswordsItemDetails = sqliteTable(
  tableName("haex_passwords_item_details"),
  {
    id: text().primaryKey(),
    title: text(),
    username: text(),
    password: text(),
    note: text(),
    icon: text(),
    color: text(),
    tags: text(),
    url: text(),
    otpSecret: text("otp_secret"),
    otpDigits: integer("otp_digits").default(6),
    otpPeriod: integer("otp_period").default(30),
    otpAlgorithm: text("otp_algorithm").default("SHA1"),
    expiresAt: text("expires_at"), // ISO date string for password expiry
    // Autofill aliases: JSON object mapping field keys to alias arrays
    // e.g., { "username": ["email", "login"], "password": ["pass"] }
    autofillAliases: text("autofill_aliases", { mode: "json" }).$type<
      Record<string, string[]>
    >(),
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
    updateAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
      () => new Date()
    ),
  }
);
export type InsertHaexPasswordsItemDetails =
  typeof haexPasswordsItemDetails.$inferInsert;
export type SelectHaexPasswordsItemDetails =
  typeof haexPasswordsItemDetails.$inferSelect;

export const haexPasswordsItemKeyValues = sqliteTable(
  tableName("haex_passwords_item_key_values"),
  {
    id: text().primaryKey(),
    itemId: text("item_id").references(
      (): AnySQLiteColumn => haexPasswordsItemDetails.id,
      { onDelete: "cascade" }
    ),
    key: text(),
    value: text(),
    updateAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
      () => new Date()
    ),
  }
);
export type InserthaexPasswordsItemKeyValues =
  typeof haexPasswordsItemKeyValues.$inferInsert;
export type SelectHaexPasswordsItemKeyValues =
  typeof haexPasswordsItemKeyValues.$inferSelect;

export const haexPasswordsGroups = sqliteTable(
  tableName("haex_passwords_groups"),
  {
    id: text().primaryKey(),
    name: text(),
    description: text(),
    icon: text(),
    order: integer("sort_order"), // Renamed from 'order' to avoid SQL keyword conflict
    color: text(),
    parentId: text("parent_id").references(
      (): AnySQLiteColumn => haexPasswordsGroups.id,
      { onDelete: "cascade" }
    ),
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
    updateAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
      () => new Date()
    ),
  }
);
export type InsertHaexPasswordsGroups = typeof haexPasswordsGroups.$inferInsert;
export type SelectHaexPasswordsGroups = typeof haexPasswordsGroups.$inferSelect;

export const haexPasswordsGroupItems = sqliteTable(
  tableName("haex_passwords_group_items"),
  {
    groupId: text("group_id").references(
      (): AnySQLiteColumn => haexPasswordsGroups.id,
      { onDelete: "cascade" }
    ),
    itemId: text("item_id").references(
      (): AnySQLiteColumn => haexPasswordsItemDetails.id,
      { onDelete: "cascade" }
    ),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.groupId] })]
);
export type InsertHaexPasswordsGroupItems =
  typeof haexPasswordsGroupItems.$inferInsert;
export type SelectHaexPasswordsGroupItems =
  typeof haexPasswordsGroupItems.$inferSelect;

// Zentrale Binary-Tabelle (dedupliziert via SHA-256 Hash)
export const haexPasswordsBinaries = sqliteTable(
  tableName("haex_passwords_binaries"),
  {
    hash: text().primaryKey(), // SHA-256 hash als Primary Key
    data: text().notNull(), // Base64-encoded binary data
    size: integer().notNull(),
    type: text().default("attachment"), // 'icon' or 'attachment'
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  }
);
export type InsertHaexPasswordsBinaries =
  typeof haexPasswordsBinaries.$inferInsert;
export type SelectHaexPasswordsBinaries =
  typeof haexPasswordsBinaries.$inferSelect;

// Entry → Binary Mapping (unterstützt mehrere Attachments pro Entry)
export const haexPasswordsItemBinaries = sqliteTable(
  tableName("haex_passwords_item_binaries"),
  {
    id: text().primaryKey(),
    itemId: text("item_id")
      .references((): AnySQLiteColumn => haexPasswordsItemDetails.id, {
        onDelete: "cascade",
      })
      .notNull(),
    binaryHash: text("binary_hash")
      .references((): AnySQLiteColumn => haexPasswordsBinaries.hash, {
        onDelete: "cascade",
      })
      .notNull(),
    fileName: text("file_name").notNull(), // Dateiname kann pro Entry unterschiedlich sein
  }
);
export type InsertHaexPasswordsItemBinaries =
  typeof haexPasswordsItemBinaries.$inferInsert;
export type SelectHaexPasswordsItemBinaries =
  typeof haexPasswordsItemBinaries.$inferSelect;

// Entry History Snapshots (wie KeePass - komplette Entry-Snapshots)
export const haexPasswordsItemSnapshots = sqliteTable(
  tableName("haex_passwords_item_snapshots"),
  {
    id: text().primaryKey(),
    itemId: text("item_id")
      .references((): AnySQLiteColumn => haexPasswordsItemDetails.id, {
        onDelete: "cascade",
      })
      .notNull(),
    // Snapshot-Daten als JSON (alle Entry-Felder außer Binaries)
    snapshotData: text("snapshot_data").notNull(), // JSON: { title, username, password, url, note, tags, otpSecret, keyValues, ... }
    // Timestamps
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
    modifiedAt: text("modified_at"), // Wann wurde der Entry in diesem Zustand zuletzt geändert
  }
);
export type InsertHaexPasswordsItemSnapshots =
  typeof haexPasswordsItemSnapshots.$inferInsert;
export type SelectHaexPasswordsItemSnapshots =
  typeof haexPasswordsItemSnapshots.$inferSelect;

// Snapshot → Binary Mapping (für History-Attachments)
export const haexPasswordsSnapshotBinaries = sqliteTable(
  tableName("haex_passwords_snapshot_binaries"),
  {
    id: text().primaryKey(),
    snapshotId: text("snapshot_id")
      .references((): AnySQLiteColumn => haexPasswordsItemSnapshots.id, {
        onDelete: "cascade",
      })
      .notNull(),
    binaryHash: text("binary_hash")
      .references((): AnySQLiteColumn => haexPasswordsBinaries.hash, {
        onDelete: "cascade",
      })
      .notNull(),
    fileName: text("file_name").notNull(),
  }
);
export type InsertHaexPasswordsSnapshotBinaries =
  typeof haexPasswordsSnapshotBinaries.$inferInsert;
export type SelectHaexPasswordsSnapshotBinaries =
  typeof haexPasswordsSnapshotBinaries.$inferSelect;

// Password Generator Presets
export const haexPasswordsGeneratorPresets = sqliteTable(
  tableName("haex_passwords_generator_presets"),
  {
    id: text().primaryKey(),
    name: text().notNull(),
    length: integer().notNull().default(16),
    uppercase: integer({ mode: "boolean" }).notNull().default(true),
    lowercase: integer({ mode: "boolean" }).notNull().default(true),
    numbers: integer({ mode: "boolean" }).notNull().default(true),
    symbols: integer({ mode: "boolean" }).notNull().default(true),
    excludeChars: text("exclude_chars").default(""),
    usePattern: integer("use_pattern", { mode: "boolean" })
      .notNull()
      .default(false),
    pattern: text().default(""),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
      () => new Date()
    ),
  }
);
export type InsertHaexPasswordsGeneratorPresets =
  typeof haexPasswordsGeneratorPresets.$inferInsert;
export type SelectHaexPasswordsGeneratorPresets =
  typeof haexPasswordsGeneratorPresets.$inferSelect;

// Passkeys (WebAuthn credentials)
export const haexPasswordsPasskeys = sqliteTable(
  tableName("haex_passwords_passkeys"),
  {
    id: text().primaryKey(),
    // Optional link to a password item
    itemId: text("item_id").references(
      (): AnySQLiteColumn => haexPasswordsItemDetails.id,
      { onDelete: "cascade" }
    ),

    // WebAuthn credential identifier (unique per credential)
    credentialId: text("credential_id").notNull().unique(),

    // Relying Party information
    relyingPartyId: text("relying_party_id").notNull(), // e.g., "github.com"
    relyingPartyName: text("relying_party_name"), // e.g., "GitHub"

    // User information (as provided by the relying party)
    userHandle: text("user_handle").notNull(), // Base64-encoded user ID
    userName: text("user_name"), // e.g., "max@example.com"
    userDisplayName: text("user_display_name"), // e.g., "Max Mustermann"

    // Cryptographic keys (DB file is already encrypted)
    privateKey: text("private_key").notNull(), // PKCS8 format, Base64
    publicKey: text("public_key").notNull(), // SPKI format, Base64

    // COSE algorithm identifier (-7 = ES256, -8 = EdDSA, -257 = RS256)
    algorithm: integer("algorithm").notNull().default(-7),

    // Signature counter for replay protection (incremented after each use)
    signCount: integer("sign_count").notNull().default(0),

    // Metadata
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
    lastUsedAt: text("last_used_at"),

    // Discoverable credential (resident key)
    isDiscoverable: integer("is_discoverable", { mode: "boolean" })
      .notNull()
      .default(true),

    // UI customization
    icon: text(),
    color: text(),
    nickname: text(), // User-defined name for the passkey
  }
);
export type InsertHaexPasswordsPasskeys =
  typeof haexPasswordsPasskeys.$inferInsert;
export type SelectHaexPasswordsPasskeys =
  typeof haexPasswordsPasskeys.$inferSelect;
