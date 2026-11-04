/** What is wrong with the name typed for a new or renamed folder. */
export type MailboxNameIssue = "empty" | "invalidChars" | "exists";

// `*` and `%` are IMAP wildcards; the host refuses them in a name. Control characters could end
// the command line.
// eslint-disable-next-line no-control-regex
const INVALID_CHARS = /[*%\u0000-\u001f\u007f]/;

/**
 * Checks the name the user typed for a folder; `null` when it is fine. `taken` are the names of the
 * folders that exist (as the user reads them, not IMAP-encoded) — for a rename without the folder
 * itself. INBOX is the one name a server matches case-insensitively.
 */
export const checkMailboxName = (
  input: string,
  taken: readonly string[],
): MailboxNameIssue | null => {
  const name = input.trim();
  if (name === "") return "empty";
  if (INVALID_CHARS.test(name)) return "invalidChars";
  const isInbox = name.toUpperCase() === "INBOX";
  if (taken.some((t) => t === name || (isInbox && t.toUpperCase() === "INBOX"))) return "exists";
  return null;
};

/** Whether `name` is the folder `parent` or lies below it (`parent` + delimiter + …). */
export const isInMailbox = (name: string, parent: string, delimiter: string | null): boolean =>
  name === parent || (!!delimiter && name.startsWith(parent + delimiter));

/**
 * The name `name` has after the folder `from` was renamed to `to` (all IMAP-encoded): `to` itself
 * for `from`, and the same tail under `to` for a folder below it, since a server renames the
 * children along. `null` when the rename does not touch `name`.
 */
export const renamedMailboxName = (
  name: string,
  from: string,
  to: string,
  delimiter: string | null,
): string | null => {
  if (!isInMailbox(name, from, delimiter)) return null;
  return to + name.slice(from.length);
};
