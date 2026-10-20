import type { ImapConfig, MailboxInfo } from "@haex-space/vault-sdk";
import { assignRoles } from "../lib/mailboxRoles";
import { decodeMailboxName } from "../lib/imap";
import {
  connectionOf,
  errorText,
  findAccount,
  optionalString,
  type AccountsPort,
  type ToolHandlers,
} from "./context";

export interface CachedMailbox {
  name: string;
  role: string | null;
  unseen: number | null;
  exists: number | null;
}

/** What `list_mailboxes` needs: the accounts, the mail client and the cached mailbox rows. */
export interface MailboxToolDeps {
  accounts: AccountsPort;
  mailClient: {
    listMailboxesAsync(
      imap: ImapConfig,
      options: { includeStatus: boolean },
    ): Promise<MailboxInfo[]>;
  };
  cachedMailboxes(accountId: string): Promise<CachedMailbox[]>;
}

const isSelectable = (m: MailboxInfo) => !m.flags.some((f) => f.toLowerCase() === "\\noselect");

/**
 * `list_mailboxes`: the folders of one or every account with their role and the number of unread
 * and all messages, asked of the server now (the cache can be minutes old). An account that cannot
 * be reached answers from the cache, marked `cached`, and is named in `errors`.
 */
export const createMailboxTools = (deps: () => Promise<MailboxToolDeps>): ToolHandlers => ({
  list_mailboxes: async (input) => {
    const { accounts, mailClient, cachedMailboxes } = await deps();
    const wanted = optionalString(input, "account");
    const accountRows = wanted ? [findAccount(accounts.accounts, wanted)] : accounts.accounts;
    const mailboxes: Record<string, unknown>[] = [];
    const errors: { account: string; error: string }[] = [];
    await Promise.all(
      accountRows.map(async (account) => {
        try {
          const { imap } = await connectionOf(accounts, account.id);
          const remote = (await mailClient.listMailboxesAsync(imap, { includeStatus: true })).filter(
            isSelectable,
          );
          const roles = assignRoles(remote);
          remote.forEach((m, i) =>
            mailboxes.push({
              account: account.id,
              name: decodeMailboxName(m.name),
              role: roles[i] ?? null,
              unseen: m.unseen ?? 0,
              total: m.exists ?? 0,
            }),
          );
        } catch (err) {
          errors.push({ account: account.id, error: errorText(err) });
          for (const m of await cachedMailboxes(account.id)) {
            mailboxes.push({
              account: account.id,
              name: decodeMailboxName(m.name),
              role: m.role,
              unseen: m.unseen ?? 0,
              total: m.exists ?? 0,
              cached: true,
            });
          }
        }
      }),
    );
    // The accounts answered in parallel; the order the user knows them in is the one to keep.
    const order = new Map(accountRows.map((a, i) => [a.id, i]));
    mailboxes.sort((a, b) => order.get(a.account as string)! - order.get(b.account as string)!);
    return errors.length > 0 ? { mailboxes, errors } : { mailboxes };
  },
});
