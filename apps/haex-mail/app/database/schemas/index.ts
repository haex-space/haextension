import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";

const tableName = (name: string) =>
  getTableName(manifest.publicKey, packageJson.name, name);

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
};

/**
 * Mail accounts.
 *
 * Connection details (host/port) are stored here. Credentials live in
 * the core passwords vault (tag = "haex-mail") and are referenced by
 * `password_item_id`. The vault's tag scope ensures haex-mail can only
 * read/write its own credentials, never others.
 */
export const accounts = sqliteTable(tableName("accounts"), {
  id: text().primaryKey(),
  /** User-facing display name (e.g. "Work Gmail"). */
  displayName: text("display_name").notNull(),
  /** Email address — both the SMTP "From" and the user's identifier. */
  email: text().notNull(),

  imapHost: text("imap_host").notNull(),
  imapPort: integer("imap_port").notNull().default(993),
  imapSecurity: text("imap_security").notNull().default("tls"),

  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(465),
  smtpSecurity: text("smtp_security").default("tls"),

  /** ID of the password item in the core passwords vault. */
  passwordItemId: text("password_item_id").notNull(),

  /** Sort order in the sidebar account switcher. */
  sortOrder: integer("sort_order").notNull().default(0),

  ...timestamps,
});
export type InsertAccount = typeof accounts.$inferInsert;
export type SelectAccount = typeof accounts.$inferSelect;

/**
 * Cached mailbox metadata.
 *
 * One row per (account, mailbox name). `role` lets the UI find INBOX /
 * Sent / Drafts / Trash without parsing folder names — populated from
 * IMAP LIST flags (\\Inbox, \\Sent, \\Drafts, \\Trash) when available.
 */
export const mailboxes = sqliteTable(tableName("mailboxes"), {
  id: text().primaryKey(),
  accountId: text("account_id").notNull(),
  name: text().notNull(),
  delimiter: text(),
  /** Standardized role, derived from server flags. NULL = unclassified. */
  role: text(),
  unseen: integer().default(0),
  exists: integer("message_count").default(0),
  uidValidity: integer("uid_validity"),
  uidNext: integer("uid_next"),
  ...timestamps,
});
export type InsertMailbox = typeof mailboxes.$inferInsert;
export type SelectMailbox = typeof mailboxes.$inferSelect;

/**
 * Cached message envelopes (list-view data, no body).
 *
 * Bodies are fetched on-demand and stored separately in `messageBodies`
 * to keep this table small.
 *
 * Primary key is composite (accountId, mailboxName, uid) — UIDs are
 * unique only within a (mailbox, uidValidity) pair, so when uidValidity
 * changes we invalidate all rows for that mailbox.
 */
export const messages = sqliteTable(tableName("messages"), {
  id: text().primaryKey(),
  accountId: text("account_id").notNull(),
  mailboxName: text("mailbox_name").notNull(),
  uid: integer().notNull(),
  /** Stable per-thread group key derived from References / In-Reply-To. */
  threadKey: text("thread_key"),
  flags: text({ mode: "json" }).$type<string[]>().notNull().default([]),
  internalDate: integer("internal_date"),
  subject: text(),
  fromJson: text("from_json", { mode: "json" }).$type<MailAddressJson[]>().notNull().default([]),
  toJson: text("to_json", { mode: "json" }).$type<MailAddressJson[]>().notNull().default([]),
  ccJson: text("cc_json", { mode: "json" }).$type<MailAddressJson[]>().notNull().default([]),
  messageId: text("message_id"),
  inReplyTo: text("in_reply_to"),
  references: text({ mode: "json" }).$type<string[]>().notNull().default([]),
  size: integer(),
  ...timestamps,
});
export type InsertMessage = typeof messages.$inferInsert;
export type SelectMessage = typeof messages.$inferSelect;

/**
 * Cached message bodies. Separate table because bodies (especially HTML
 * with inline images) can be large and we usually don't need them for
 * list views.
 */
export const messageBodies = sqliteTable(tableName("message_bodies"), {
  messageId: text("message_id").primaryKey(),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  /** Attachment metadata (no data) — full data fetched on demand by partIndex. */
  attachmentsJson: text("attachments_json", { mode: "json" })
    .$type<AttachmentJson[]>()
    .notNull()
    .default([]),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});
export type InsertMessageBody = typeof messageBodies.$inferInsert;
export type SelectMessageBody = typeof messageBodies.$inferSelect;

// Type definitions

export interface MailAddressJson {
  name?: string;
  email: string;
}

export interface AttachmentJson {
  partIndex: number;
  filename?: string;
  contentType: string;
  size: number;
  contentId?: string;
  isInline: boolean;
}

export type MailboxRole = "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive";
