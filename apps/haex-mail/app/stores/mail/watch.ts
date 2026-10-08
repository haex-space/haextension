import type * as schema from "~/database/schemas";
import type { MailNewMessagesEvent } from "@haex-space/vault-sdk";
import type { ComputedRef, Ref } from "vue";
import type { MailSync } from "./sync";

/**
 * Mailbox watched for background new-mail push events. "INBOX" is the one
 * mailbox name IMAP servers must recognize case-insensitively (RFC 3501),
 * so it's safe to use as a literal without resolving each account's actual
 * inbox folder name first.
 */
const WATCHED_MAILBOX = "INBOX";
const WATCH_INTERVAL_SECONDS = 90;

interface NewMailWatchState {
  selectedAccountId: Ref<string | null>;
  selectedMailboxName: Ref<string | null>;
  selectedRole: Ref<schema.MailboxRole | null>;
  isUnifiedView: ComputedRef<boolean>;
}

/**
 * Background new-mail push: per-account IMAP watches plus the handler
 * that refreshes the local cache when one fires.
 */
export const useNewMailWatch = (
  state: NewMailWatchState,
  sync: Pick<
    MailSync,
    | "syncMailboxesAsync"
    | "persistEnvelopesAsync"
    | "loadMailboxesAsync"
    | "loadMessagesAsync"
    | "loadUnifiedMessagesAsync"
  >,
) => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const { selectedAccountId, selectedMailboxName, selectedRole, isUnifiedView } = state;
  const {
    syncMailboxesAsync,
    persistEnvelopesAsync,
    loadMailboxesAsync,
    loadMessagesAsync,
    loadUnifiedMessagesAsync,
  } = sync;

  /**
   * Handles a `mail:new-messages` push event from a background watch:
   * fetches + persists the affected account/mailbox, then re-renders from
   * the (now-updated) local cache — but only for whatever is CURRENTLY
   * selected. `load*Async` always reads the current selection rather than
   * the event's account/mailbox, so a background account's update can
   * never clobber a different account/mailbox the user has open.
   */
  const handleMailWatchEventAsync = async (accountId: string, mailboxName: string) => {
    const account = await accountsStore.getCredentialsCachedAsync(accountId);
    if (!account || !haexVault.orm) return;
    try {
      const [remoteMailboxes, envelopes] = await Promise.all([
        haexVault.client.mail.listMailboxesAsync(account.imap, { includeStatus: true }),
        haexVault.client.mail.fetchEnvelopesAsync(account.imap, mailboxName, {
          type: "latest",
          count: 50,
        }),
      ]);
      await syncMailboxesAsync(accountId, remoteMailboxes);
      await persistEnvelopesAsync(accountId, mailboxName, envelopes);
    } catch (err) {
      console.warn("[haex-mail] failed to refresh after new-mail watch event", err);
      return;
    }

    if (isUnifiedView.value) {
      await loadMailboxesAsync();
      if (selectedRole.value === "inbox") await loadUnifiedMessagesAsync("inbox");
    } else if (selectedAccountId.value === accountId) {
      await loadMailboxesAsync(accountId);
      if (selectedMailboxName.value === mailboxName) {
        await loadMessagesAsync(accountId, mailboxName);
      }
    }
  };

  haexVault.client.mail.onNewMessages((event) => {
    const { accountId, mailboxName } = event.data as MailNewMessagesEvent;
    void handleMailWatchEventAsync(accountId, mailboxName);
  });

  /**
   * Keeps background watches in sync with the configured account list:
   * starts a watch for newly-added accounts, stops it for removed ones.
   * `startWatchingAsync` has replace semantics, so re-running for an
   * already-watched account is harmless.
   */
  let watchedAccountIds = new Set<string>();
  watch(
    () => accountsStore.accounts.map((a) => a.id),
    async (ids) => {
      const nextIds = new Set(ids);
      const removed = [...watchedAccountIds].filter((id) => !nextIds.has(id));
      const added = ids.filter((id) => !watchedAccountIds.has(id));
      watchedAccountIds = nextIds;

      await Promise.allSettled(
        removed.map((id) => haexVault.client.mail.stopWatchingAsync(id, WATCHED_MAILBOX)),
      );
      // The host logs in for the watch itself, so it gets the IMAP credentials, as with every
      // other mail call; it keeps them only while the watch runs.
      await Promise.allSettled(
        added.map(async (id) => {
          const loaded = await accountsStore.getCredentialsCachedAsync(id);
          if (!loaded) return;
          await haexVault.client.mail.startWatchingAsync(
            id,
            WATCHED_MAILBOX,
            WATCH_INTERVAL_SECONDS,
            loaded.imap,
          );
        }),
      );
    },
    { immediate: true },
  );
};
