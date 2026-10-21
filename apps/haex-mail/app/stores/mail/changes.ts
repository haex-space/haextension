import { inArray } from "drizzle-orm";
import * as schema from "~/database/schemas";
import type { MailSync } from "./sync";

/**
 * Message changes on the server and in the cache that know no visible list: flags and moves of
 * messages named by (account, mailbox, UIDs). The bulk actions of the list UI, the agent tools and
 * the mail rules all go through here; toasts, selection and list reloads stay with the caller.
 * The cache id of a message is `${accountId}::${mailboxName}::${uid}` (see `persistEnvelopesAsync`).
 */
export const useMessageChanges = (
  sync: Pick<MailSync, "refreshMailboxStatusAsync">,
  updateLocalFlagsAsync: (ids: string[], flag: string, add: boolean) => Promise<void>,
) => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const { $i18n } = useNuxtApp();

  const cacheIds = (accountId: string, mailboxName: string, uids: number[]) =>
    uids.map((uid) => `${accountId}::${mailboxName}::${uid}`);

  /** Set or remove one flag (`\Seen`, `\Flagged`, …) on messages of one mailbox. */
  const setFlagForUidsAsync = async (
    accountId: string,
    mailboxName: string,
    uids: number[],
    flag: string,
    add: boolean,
  ) => {
    if (uids.length === 0) return;
    const account = await accountsStore.getCredentialsCachedAsync(accountId);
    if (!account) throw new Error($i18n.t("mail.errors.credentials"));
    await haexVault.client.mail.setFlagsAsync(account.imap, mailboxName, uids, [flag], add);
    await updateLocalFlagsAsync(cacheIds(accountId, mailboxName, uids), flag, add);
    await sync.refreshMailboxStatusAsync(accountId, [mailboxName]);
  };

  /** Move messages of one mailbox to another and drop their cache rows. */
  const moveUidsAsync = async (
    accountId: string,
    mailboxName: string,
    uids: number[],
    destinationName: string,
  ) => {
    if (!haexVault.orm) return;
    if (destinationName === mailboxName) return;
    const account = await accountsStore.getCredentialsCachedAsync(accountId);
    if (!account) throw new Error($i18n.t("mail.errors.credentials"));
    await haexVault.client.mail.moveMessagesAsync(
      account.imap,
      mailboxName,
      destinationName,
      uids,
    );
    // Messages first — an interrupted run then leaves at worst orphaned
    // body rows, never ghost list entries whose UIDs are already moved.
    const ids = cacheIds(accountId, mailboxName, uids);
    await haexVault.orm.delete(schema.messages).where(inArray(schema.messages.id, ids));
    await haexVault.orm
      .delete(schema.messageBodies)
      .where(inArray(schema.messageBodies.messageId, ids));
    await sync.refreshMailboxStatusAsync(accountId, [mailboxName, destinationName]);
  };

  /** Remove messages of one mailbox for good (no trash) and drop their cache rows. */
  const deleteUidsAsync = async (accountId: string, mailboxName: string, uids: number[]) => {
    if (!haexVault.orm || uids.length === 0) return;
    const account = await accountsStore.getCredentialsCachedAsync(accountId);
    if (!account) throw new Error($i18n.t("mail.errors.credentials"));
    await haexVault.client.mail.deleteMessagesAsync(account.imap, mailboxName, uids);
    const ids = cacheIds(accountId, mailboxName, uids);
    await haexVault.orm.delete(schema.messages).where(inArray(schema.messages.id, ids));
    await haexVault.orm
      .delete(schema.messageBodies)
      .where(inArray(schema.messageBodies.messageId, ids));
    await sync.refreshMailboxStatusAsync(accountId, [mailboxName]);
  };

  return { setFlagForUidsAsync, moveUidsAsync, deleteUidsAsync };
};

export type MessageChanges = ReturnType<typeof useMessageChanges>;
