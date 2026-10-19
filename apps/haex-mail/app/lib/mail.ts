import * as schema from "~/database/schemas";
import { decodeMailboxName } from "~/lib/imap";

/**
 * Pseudo-account id for the unified view across all accounts. Folder
 * selection then works by mailbox *role* instead of name (per-account
 * inbox/trash names differ).
 */
export const ALL_ACCOUNTS_ID = "__all__";

/** Field the message list can be sorted by (shared: list UI + keyboard nav). */
export type MessageSortField = "date" | "subject" | "sender" | "flagged" | "read";

/** Ordered sort options for the sort dropdown (shared between desktop and mobile). */
export const SORT_OPTIONS: { field: MessageSortField; labelKey: string }[] = [
  { field: "date", labelKey: "sortDate" },
  { field: "subject", labelKey: "sortSubject" },
  { field: "sender", labelKey: "sortSender" },
  { field: "flagged", labelKey: "sortFlagged" },
  { field: "read", labelKey: "sortRead" },
];

/** Read/flagged state from cached IMAP flags (shared: store sort + list UI). */
export const isMessageUnread = (msg: schema.SelectMessage) =>
  !msg.flags.some((f) => f.toLowerCase().includes("seen"));
export const isMessageFlagged = (msg: schema.SelectMessage) =>
  msg.flags.some((f) => f.toLowerCase().includes("flagged"));

/** UI label of a mailbox: the localized inbox label, otherwise the decoded name. */
export const mailboxDisplayName = (name: string, inboxLabel: string) =>
  name === "INBOX" ? inboxLabel : decodeMailboxName(name);

export const senderText = (msg: schema.SelectMessage) =>
  msg.fromJson[0]?.name || msg.fromJson[0]?.email || "";

const ROLE_LABEL_KEYS = new Set<string>(schema.MAILBOX_ROLES);

/**
 * i18n key for a standardized mailbox role's UI label (global messages,
 * see plugins/i18n-messages.ts). Null for unknown/custom folders.
 */
export function roleLabelKey(role: string | null | undefined): string | null {
  return role && ROLE_LABEL_KEYS.has(role) ? `mail.roles.${role}` : null;
}
