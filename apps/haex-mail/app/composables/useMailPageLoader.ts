import type { AccountWithCredentials } from "~/stores/accounts";
import { ALL_ACCOUNTS_ID } from "~/stores/mail";
import { getErrorMessage } from "~/lib/utils";

/**
 * Data loading for the mail page: vault init, credentials of the selected
 * account(s), and refreshing mailboxes/messages/body as the selection
 * changes.
 */
export const useMailPageLoader = () => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const mailStore = useMailStore();

  const showSetup = ref(false);
  const currentAccount = shallowRef<AccountWithCredentials | null>(null);
  const unifiedAccounts = shallowRef<AccountWithCredentials[]>([]);
  const initError = ref<string | null>(null);

  onMounted(async () => {
    try {
      await haexVault.initializeAsync();
    } catch (err) {
      initError.value = getErrorMessage(err);
      console.error('[haex-mail] Initialization failed:', err);
      return;
    }
    await accountsStore.loadAccountsAsync();
    if (!accountsStore.hasAccounts) {
      showSetup.value = true;
      return;
    }
    // Restore credentials after a remount (e.g. returning from /settings) —
    // the selectedAccountId watcher only fires on change.
    if (mailStore.selectedAccountId === ALL_ACCOUNTS_ID) {
      await initUnifiedAsync();
    } else if (mailStore.selectedAccountId) {
      const acc = await accountsStore.loadAccountWithCredentialsAsync(
        mailStore.selectedAccountId,
      );
      currentAccount.value = acc;
      // The selection may have changed while unmounted (e.g. account deleted
      // in settings) — refresh when the cached mailboxes belong to another one.
      if (acc && mailStore.mailboxes[0]?.accountId !== acc.account.id) {
        await refreshMailboxesAndSelectInboxAsync(acc);
      }
    }
  });

  const refreshMailboxesAndSelectInboxAsync = async (
    acc: AccountWithCredentials,
  ) => {
    await mailStore.refreshMailboxesAsync(acc);
    // Default to the inbox if we have one.
    const inbox = mailStore.mailboxes.find((m) => m.role === "inbox");
    if (inbox) {
      mailStore.selectMailbox(inbox.name);
    }
  };

  /**
   * Unified view: load credentials for every account (may surface vault
   * permission prompts), then refresh the selected role — default inbox.
   */
  const initUnifiedAsync = async () => {
    currentAccount.value = null;
    const creds = await Promise.all(
      accountsStore.accounts.map((a) =>
        accountsStore.getCredentialsCachedAsync(a.id),
      ),
    );
    unifiedAccounts.value = creds.filter(
      (c): c is AccountWithCredentials => c !== null,
    );
    if (mailStore.selectedRole) {
      // Restored selection — the role watcher won't fire, refresh directly.
      await mailStore.refreshUnifiedAsync(
        mailStore.selectedRole,
        unifiedAccounts.value,
      );
    } else {
      mailStore.selectRole("inbox");
    }
  };

  /**
   * When the selected account changes, load credentials and refresh
   * mailboxes. Credentials live in the core passwords vault — accessing
   * them may surface a permission prompt the first time.
   */
  watch(
    () => mailStore.selectedAccountId,
    async (id) => {
      if (!id) {
        currentAccount.value = null;
        return;
      }
      if (id === ALL_ACCOUNTS_ID) {
        await initUnifiedAsync();
        return;
      }
      const acc = await accountsStore.loadAccountWithCredentialsAsync(id);
      currentAccount.value = acc;
      if (acc) {
        await refreshMailboxesAndSelectInboxAsync(acc);
      }
    },
  );

  watch(
    () => mailStore.selectedMailboxName,
    async (mailbox) => {
      if (!mailbox || !currentAccount.value) return;
      await mailStore.refreshMessagesAsync(currentAccount.value, mailbox);
    },
  );

  watch(
    () => mailStore.selectedRole,
    async (role) => {
      if (!role || !mailStore.isUnifiedView) return;
      await mailStore.refreshUnifiedAsync(role, unifiedAccounts.value);
    },
  );

  const onRefresh = async () => {
    if (mailStore.isUnifiedView) {
      if (mailStore.selectedRole) {
        await mailStore.refreshUnifiedAsync(mailStore.selectedRole, unifiedAccounts.value);
      }
    } else {
      if (currentAccount.value && mailStore.selectedMailboxName) {
        await mailStore.refreshMessagesAsync(currentAccount.value, mailStore.selectedMailboxName);
      }
    }
  };

  watch(
    () => mailStore.selectedMessageId,
    async (id) => {
      if (!id) return;
      const row = mailStore.messageList.find((m) => m.id === id);
      if (!row) return;
      await mailStore.loadMessageBodyAsync(row);
    },
  );

  const onSetupComplete = async () => {
    showSetup.value = false;
    await accountsStore.loadAccountsAsync();
  };

  return { showSetup, currentAccount, initError, onRefresh, onSetupComplete };
};
