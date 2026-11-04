import { encodeMailboxName } from "~/lib/imap";
import { isInMailbox, renamedMailboxName } from "~/lib/mailboxName";
import type * as schema from "~/database/schemas";
import type { Ref } from "vue";
import type { MailSync } from "./sync";

interface MailboxManagementState {
  selectedAccountId: Ref<string | null>;
  selectedMailboxName: Ref<string | null>;
  mailboxes: Ref<schema.SelectMailbox[]>;
}

/**
 * Creating, renaming and deleting folders of one account: the server first, then the cache the
 * sidebar shows, the selection and the rules that name the folder. Names are the IMAP-encoded ones
 * (`encodeMailboxName`) the cache and the server use. Failures of the server reach the caller.
 */
export const useMailboxManagement = (
  state: MailboxManagementState,
  sync: Pick<MailSync, "refreshMailboxesAsync">,
  selectMailbox: (mailboxName: string | null) => void,
) => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const rulesStore = useRulesStore();
  const { $i18n } = useNuxtApp();

  const credentialsAsync = async (accountId: string) => {
    const account = await accountsStore.getCredentialsCachedAsync(accountId);
    if (!account) throw new Error($i18n.t("mail.errors.credentials"));
    return account;
  };

  /** Reads the folders from the server again. The change itself is done; a failure here is no failure of it. */
  const refreshAsync = async (accountId: string) => {
    try {
      await sync.refreshMailboxesAsync(await credentialsAsync(accountId));
    } catch (err) {
      console.warn("[haex-mail] failed to refresh the mailboxes after a change", err);
    }
  };

  const delimiterOf = (accountId: string, name: string) =>
    state.mailboxes.value.find((m) => m.accountId === accountId && m.name === name)?.delimiter ??
    null;

  /** The folder on screen is gone or renamed: follow it, or fall back to the inbox. */
  const reselect = (accountId: string, next: string | null) => {
    if (state.selectedAccountId.value !== accountId) return;
    selectMailbox(next ?? state.mailboxes.value.find((m) => m.role === "inbox")?.name ?? null);
  };

  /** Creates a folder named as the user knows it; `false` when the server already had it. */
  const createMailboxAsync = async (accountId: string, name: string): Promise<boolean> => {
    const account = await credentialsAsync(accountId);
    const created = await haexVault.client.mail.createMailboxAsync(
      account.imap,
      encodeMailboxName(name.trim()),
    );
    await refreshAsync(accountId);
    return created;
  };

  /** Renames the folder `from` (IMAP name) to `to` (as the user knows it). Folders below it go along. */
  const renameMailboxAsync = async (accountId: string, from: string, to: string) => {
    const account = await credentialsAsync(accountId);
    const delimiter = delimiterOf(accountId, from);
    const target = encodeMailboxName(to.trim());
    await haexVault.client.mail.renameMailboxAsync(account.imap, from, target);
    // Rules that file into the folder follow it; otherwise they would point at nothing.
    await rulesStore.renameMailboxInRulesAsync(accountId, from, target, delimiter);
    const selected = state.selectedMailboxName.value;
    const followed = selected ? renamedMailboxName(selected, from, target, delimiter) : null;
    await refreshAsync(accountId);
    if (followed) reselect(accountId, followed);
  };

  /** Deletes the folder (IMAP name) with everything in it. The cache of it goes with the next sync. */
  const deleteMailboxAsync = async (accountId: string, name: string) => {
    const account = await credentialsAsync(accountId);
    const delimiter = delimiterOf(accountId, name);
    await haexVault.client.mail.deleteMailboxAsync(account.imap, name);
    const selected = state.selectedMailboxName.value;
    const wasSelected = !!selected && isInMailbox(selected, name, delimiter);
    await refreshAsync(accountId);
    if (wasSelected) reselect(accountId, null);
  };

  return { createMailboxAsync, renameMailboxAsync, deleteMailboxAsync };
};

export type MailboxManagement = ReturnType<typeof useMailboxManagement>;
