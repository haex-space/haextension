import {
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";

// Helper function to create prefixed table names (with fallback to package.json for name)
const extensionName = (manifest as { name?: string }).name || packageJson.name;
const tableName = (name: string) =>
  getTableName(manifest.publicKey, extensionName, name);

// LocalSend Settings table - stores user preferences
export const haexSendSettings = sqliteTable(
  tableName("haex_send_settings"),
  {
    // Single row table - use constant ID
    id: text().primaryKey().default("settings"),
    // Device alias
    alias: text(),
    // Port to use
    port: integer().default(53317),
    // Auto-accept transfers from known devices
    autoAccept: integer("auto_accept", { mode: "boolean" }).default(false),
    // Default save directory
    saveDirectory: text("save_directory"),
    // Require PIN for incoming transfers
    requirePin: integer("require_pin", { mode: "boolean" }).default(false),
    // PIN (if require_pin is true)
    pin: text(),
    // Show notification on incoming transfer
    showNotifications: integer("show_notifications", { mode: "boolean" }).default(true),
    // Timestamps
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
      () => new Date()
    ),
  }
);
export type InsertHaexSendSettings = typeof haexSendSettings.$inferInsert;
export type SelectHaexSendSettings = typeof haexSendSettings.$inferSelect;
