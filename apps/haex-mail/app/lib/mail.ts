import * as schema from "~/database/schemas";

/** Read/flagged state from cached IMAP flags (shared: store sort + list UI). */
export const isMessageUnread = (msg: schema.SelectMessage) =>
  !msg.flags.some((f) => f.toLowerCase().includes("seen"));
export const isMessageFlagged = (msg: schema.SelectMessage) =>
  msg.flags.some((f) => f.toLowerCase().includes("flagged"));

export const senderText = (msg: schema.SelectMessage) =>
  msg.fromJson[0]?.name || msg.fromJson[0]?.email || "";

/**
 * Map an IMAP mailbox name + LIST flags to a standardized role used in
 * the sidebar. The IMAP RFC 6154 SPECIAL-USE flags (\Sent, \Drafts,
 * \Trash, \Junk, \Archive) are most reliable; fall back to common
 * folder names when the server doesn't advertise them.
 */
const ROLE_LABEL_KEYS = new Set<string>(schema.MAILBOX_ROLES);

/**
 * i18n key for a standardized mailbox role's UI label (global messages,
 * see plugins/i18n-messages.ts). Null for unknown/custom folders.
 */
export function roleLabelKey(role: string | null | undefined): string | null {
  return role && ROLE_LABEL_KEYS.has(role) ? `mail.roles.${role}` : null;
}

export function inferRole(name: string, flags: string[]): schema.MailboxRole | null {
  const flagSet = new Set(flags.map((f) => f.toLowerCase()));
  if (flagSet.has("\\inbox") || name.toUpperCase() === "INBOX") return "inbox";
  if (flagSet.has("\\sent")) return "sent";
  if (flagSet.has("\\drafts")) return "drafts";
  if (flagSet.has("\\trash")) return "trash";
  if (flagSet.has("\\junk")) return "junk";
  if (flagSet.has("\\archive")) return "archive";

  const lower = name.toLowerCase();
  if (lower.includes("sent") || lower.includes("gesend")) return "sent";
  if (lower.includes("draft") || lower.includes("entwurf")) return "drafts";
  if (lower.includes("trash") || lower.includes("papierkorb") || lower.includes("deleted"))
    return "trash";
  if (lower.includes("spam") || lower.includes("junk")) return "junk";
  if (lower.includes("archiv")) return "archive";
  return null;
}
