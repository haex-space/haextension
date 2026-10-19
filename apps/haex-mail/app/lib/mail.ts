import * as schema from "~/database/schemas";
import { decodeMailboxName } from "~/lib/imap";

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
