import type { MailboxRole } from "~/database/schemas";
import { decodeMailboxName } from "./imap";

interface ListedMailbox {
  name: string;
  flags: string[];
  delimiter?: string | null;
}

/** RFC 6154 SPECIAL-USE flags (plus the \Inbox some servers send). */
const FLAG_ROLES: Record<string, MailboxRole> = {
  "\\inbox": "inbox",
  "\\sent": "sent",
  "\\drafts": "drafts",
  "\\trash": "trash",
  "\\junk": "junk",
  "\\archive": "archive",
};

/** Well-known folder names (last hierarchy level, lower case) for servers without SPECIAL-USE. */
const KNOWN_NAMES: Record<Exclude<MailboxRole, "inbox">, string[]> = {
  sent: [
    "sent",
    "sent items",
    "sent mail",
    "sent messages",
    "gesendet",
    "gesendete objekte",
    "gesendete elemente",
    "gesendete nachrichten",
  ],
  drafts: ["drafts", "draft", "entwürfe", "entwurf"],
  trash: [
    "trash",
    "deleted",
    "deleted items",
    "deleted messages",
    "bin",
    "papierkorb",
    "gelöscht",
    "gelöschte objekte",
    "gelöschte elemente",
    "gelöschte nachrichten",
  ],
  junk: ["junk", "spam", "junk e-mail", "junk email", "junk-e-mail", "spamverdacht"],
  archive: ["archive", "archives", "archiv"],
};

const NAME_ROLES = new Map<string, MailboxRole>(
  Object.entries(KNOWN_NAMES).flatMap(([role, names]) =>
    names.map((name) => [name, role as MailboxRole] as const),
  ),
);

const flagRole = (box: ListedMailbox): MailboxRole | null => {
  if (box.name.toUpperCase() === "INBOX") return "inbox";
  for (const flag of box.flags) {
    const role = FLAG_ROLES[flag.toLowerCase()];
    if (role) return role;
  }
  return null;
};

const segments = (box: ListedMailbox): string[] =>
  box.delimiter ? box.name.split(box.delimiter) : [box.name];

const nameRole = (box: ListedMailbox): MailboxRole | null =>
  NAME_ROLES.get(decodeMailboxName(segments(box).at(-1) ?? "").trim().toLowerCase()) ?? null;

/**
 * The standardized role of every mailbox of one account's LIST, in input
 * order. SPECIAL-USE flags win; well-known names only fill roles no flag
 * claimed. Each role goes to at most one mailbox — the first flagged one, or
 * the shallowest name match — so "move to trash" has exactly one target.
 */
export const assignRoles = (boxes: ListedMailbox[]): (MailboxRole | null)[] => {
  const roles: (MailboxRole | null)[] = boxes.map(() => null);
  const taken = new Set<MailboxRole>();

  boxes.forEach((box, i) => {
    const role = flagRole(box);
    if (role && !taken.has(role)) {
      roles[i] = role;
      taken.add(role);
    }
  });

  const byDepth = boxes
    .map((box, i) => ({ i, depth: segments(box).length, role: nameRole(box) }))
    .sort((a, b) => a.depth - b.depth || a.i - b.i);
  for (const { i, role } of byDepth) {
    if (role && roles[i] === null && !taken.has(role)) {
      roles[i] = role;
      taken.add(role);
    }
  }
  return roles;
};
