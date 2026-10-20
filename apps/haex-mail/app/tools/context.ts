import { MAILBOX_ROLES, type MailboxRole } from "../database/schemas";

/**
 * What every tool of the agent shares (spec 019): the handler shape, how ids and mailbox names are
 * read, and the error text. Relative imports only, so the tests need no alias. A tool gets the
 * stores through a `deps()` function that waits until haex-mail has started (see the plugin).
 */

/** What the SDK calls a handler: the input already fits the schema declared in the manifest. */
export type ToolHandler = (
  input: Record<string, unknown>,
  context: { signal: AbortSignal },
) => Promise<unknown>;

export type ToolHandlers = Record<string, ToolHandler>;

/** The longest error text a tool hands to the agent. */
const MAX_ERROR_TEXT = 300;

/** An error the agent sees: short, and made of what the caller wrote, never of credentials. */
export const toolError = (message: string): Error => new Error(message.slice(0, MAX_ERROR_TEXT));

/** The text of any thrown value, cut to the length the agent gets. */
export const errorText = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_TEXT);

/** The cache id of a message, which is also what the tools call it (see `persistEnvelopesAsync`). */
export const formatMessageId = (accountId: string, mailboxName: string, uid: number): string =>
  `${accountId}::${mailboxName}::${uid}`;

/** The parts of a message id; `null` when it is none. The mailbox name may contain `::` itself. */
export const parseMessageId = (
  id: string,
): { accountId: string; mailboxName: string; uid: number } | null => {
  const first = id.indexOf("::");
  const last = id.lastIndexOf("::");
  if (first < 0 || last <= first) return null;
  const uid = Number(id.slice(last + 2));
  const mailboxName = id.slice(first + 2, last);
  if (!Number.isInteger(uid) || uid <= 0 || !mailboxName) return null;
  return { accountId: id.slice(0, first), mailboxName, uid };
};

export const isMailboxRole = (value: string): value is MailboxRole =>
  (MAILBOX_ROLES as readonly string[]).includes(value);

/**
 * The mailbox a name or a role (`inbox`, `trash`, …) means in one account, or `null` when it has
 * none. A role is looked up by role, a name by exact name first and then ignoring case.
 */
export const resolveMailbox = (
  mailboxes: { name: string; role: string | null }[],
  nameOrRole: string,
): string | null => {
  const wanted = nameOrRole.trim();
  if (!wanted) return null;
  const byName =
    mailboxes.find((m) => m.name === wanted) ??
    mailboxes.find((m) => m.name.toLowerCase() === wanted.toLowerCase());
  if (byName) return byName.name;
  const role = wanted.toLowerCase();
  return isMailboxRole(role) ? (mailboxes.find((m) => m.role === role)?.name ?? null) : null;
};

/** A string input the schema made optional, or `undefined`. */
export const optionalString = (input: Record<string, unknown>, key: string): string | undefined => {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
};
