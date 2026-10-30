import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";

const tableName = (name: string) =>
  getTableName(manifest.publicKey, packageJson.name, name);

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
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
  /**
   * Highest UID the mail rules have run for (INBOX only); NULL until the mailbox was seen once.
   * Reset with the cache when UIDVALIDITY changes. See lib/rules.ts `planRuleRun`.
   */
  rulesUidThrough: integer("rules_uid_through"),
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
  /** Whether the message has any non-primary-body MIME part (from BODYSTRUCTURE). */
  hasAttachments: integer("has_attachments", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (t) => [
  // Every message list reads one mailbox, newest first.
  index(tableName("messages_mailbox_date_idx")).on(t.accountId, t.mailboxName, t.internalDate),
]);
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

/**
 * Moves the user has made in the list (delete, archive, move to folder) that the server has not
 * confirmed yet. The message vanishes from the list at once; the move is carried out against the
 * server in the background and repeated until it works — also after a restart, hence a table.
 * Rows stay in `messages` until the move is done; the list loaders skip the ones named here.
 */
export const pendingMoves = sqliteTable(tableName("pending_moves"), {
  /** Cache id of the message (`${accountId}::${mailboxName}::${uid}`). */
  messageId: text("message_id").primaryKey(),
  accountId: text("account_id").notNull(),
  /** Mailbox the message is in on the server. */
  mailboxName: text("mailbox_name").notNull(),
  uid: integer().notNull(),
  destinationName: text("destination_name").notNull(),
  /** Failed tries so far; see lib/pendingMoves.ts for when the move is given up. */
  attempts: integer().notNull().default(0),
  /** Unix ms; the move is not tried again before. */
  nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  ...timestamps,
});
export type InsertPendingMove = typeof pendingMoves.$inferInsert;
export type SelectPendingMove = typeof pendingMoves.$inferSelect;

/**
 * Mail rules (spec 019): when a new INBOX message meets all conditions, the actions run. Rules
 * belong to the vault, not to a device (ADR-0001 of holzi): they sync like accounts.
 */
export const rules = sqliteTable(tableName("rules"), {
  id: text().primaryKey(),
  name: text().notNull(),
  /** NULL: the rule covers every account. */
  accountId: text("account_id"),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  conditionsJson: text("conditions_json", { mode: "json" })
    .$type<RuleConditionJson[]>()
    .notNull(),
  actionsJson: text("actions_json", { mode: "json" }).$type<RuleActionJson[]>().notNull(),
  /** Who made the rule: the user in the settings or the agent through a tool. */
  origin: text().$type<"user" | "agent">().notNull().default("user"),
  ...timestamps,
});
export type InsertRule = typeof rules.$inferInsert;
export type SelectRule = typeof rules.$inferSelect;

/**
 * Mails that are being written (spec 022). One row per unsent mail, written a moment after each
 * change so no typed text is lost. `_no_sync` keeps drafts on this device: two devices never edit
 * one draft, and the copy in the server's drafts folder is how a draft reaches other programs.
 */
export const drafts = sqliteTable(tableName("drafts_no_sync"), {
  id: text().primaryKey(),
  accountId: text("account_id").notNull(),
  /** The address fields as the person typed them. */
  toText: text("to_text").notNull().default(""),
  ccText: text("cc_text").notNull().default(""),
  bccText: text("bcc_text").notNull().default(""),
  subject: text().notNull().default(""),
  /** The editor HTML of the body. */
  bodyHtml: text("body_html").notNull().default(""),
  /** Message-ID this mail answers; with `referencesJson` it keeps a reply a reply. */
  inReplyTo: text("in_reply_to"),
  referencesJson: text("references_json", { mode: "json" }).$type<string[]>().notNull().default([]),
  /** Unix ms of the last change by the person; bookkeeping writes leave it alone. */
  editedAt: integer("edited_at").notNull(),
  /** Unix ms from which the draft is copied to the server; NULL when the copy is up to date. */
  uploadDueAt: integer("upload_due_at"),
  attempts: integer().notNull().default(0),
  /** Unix ms; the upload is not tried before. */
  nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  /** Message-ID of the copy in the drafts folder, without angle brackets. */
  serverMessageId: text("server_message_id"),
  /** Earlier copies whose deletion is not confirmed yet; every id stays until it is. */
  previousMessageIdsJson: text("previous_message_ids_json", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  /** Unix ms; set on a draft with a server copy that was deleted or sent, until the copy is gone. */
  removedAt: integer("removed_at"),
  ...timestamps,
});
export type InsertDraft = typeof drafts.$inferInsert;
export type SelectDraft = typeof drafts.$inferSelect;

/** Attachments of a draft, rewritten only when the set of attachments changes. */
export const draftAttachments = sqliteTable(tableName("draft_attachments_no_sync"), {
  id: text().primaryKey(),
  draftId: text("draft_id").notNull(),
  position: integer().notNull(),
  filename: text().notNull(),
  contentType: text("content_type").notNull(),
  contentId: text("content_id"),
  /** Decoded size in bytes. */
  size: integer().notNull(),
  /** Base64, as `OutgoingAttachment.data`. */
  data: text().notNull(),
});
export type InsertDraftAttachment = typeof draftAttachments.$inferInsert;
export type SelectDraftAttachment = typeof draftAttachments.$inferSelect;

// Type definitions

/** All conditions of a rule must hold (AND); see lib/rules.ts. */
export type RuleConditionJson =
  | { field: "from" | "to" | "subject"; contains: string }
  | { field: "attachment" };

/** There is no action that forwards or sends a message, by design. */
export type RuleActionJson =
  | { type: "move"; role: MailboxRole }
  | { type: "move"; mailbox: string }
  | { type: "markRead" }
  | { type: "flag" };

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

/** All standardized mailbox roles — single source for the type and role sets. */
export const MAILBOX_ROLES = [
  "inbox",
  "sent",
  "drafts",
  "trash",
  "junk",
  "archive",
] as const;
export type MailboxRole = (typeof MAILBOX_ROLES)[number];
