import { toast } from "vue-sonner";
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

  // Loads driven by selection watchers and refresh buttons have no caller
  // that could report a failure (wrong password, unreachable server).
  const reportFailuresAsync = async (load: () => Promise<void>) => {
    try {
      await load();
    } catch (err) {
      console.warn("[haex-mail] loading mail failed", err);
      toast.error(getErrorMessage(err));
    }
  };

  onMounted(async () => {
    try {
      await haexVault.initializeAsync();
    } catch (err) {
      initError.value = getErrorMessage(err);
      console.error('[haex-mail] Initialization failed:', err);
      return;
    }
    await reportFailuresAsync(() => restoreSelectionAsync());
  });

  const restoreSelectionAsync = async () => {
    const restoredId = mailStore.selectedAccountId;
    await accountsStore.loadAccountsAsync();
    if (!accountsStore.hasAccounts) {
      showSetup.value = true;
      return;
    }
    // Restore credentials after a remount (e.g. returning from /settings) —
    // the selectedAccountId watcher only fires on change. A selection made
    // while the accounts loaded (the first launch defaults to the unified
    // view) is the watcher's job; restoring it here too would load twice.
    const id = mailStore.selectedAccountId;
    if (!id || id !== restoredId) return;
    if (id === ALL_ACCOUNTS_ID) {
      await initUnifiedAsync();
    } else {
      const acc = await accountsStore.loadAccountWithCredentialsAsync(id);
      if (mailStore.selectedAccountId !== id) return;
      currentAccount.value = acc;
      // The selection may have changed while unmounted (e.g. account deleted
      // in settings) — refresh when the cached mailboxes belong to another one.
      if (acc && mailStore.mailboxes[0]?.accountId !== acc.account.id) {
        await refreshMailboxesAndSelectInboxAsync(acc);
      }
    }
  };

  const refreshMailboxesAndSelectInboxAsync = async (
    acc: AccountWithCredentials,
  ) => {
    await mailStore.refreshMailboxesAsync(acc);
    // Another account (or the unified view) was picked meanwhile.
    if (mailStore.selectedAccountId !== acc.account.id) return;
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
    if (!mailStore.isUnifiedView) return;
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
    (id) => reportFailuresAsync(async () => {
      if (!id) {
        currentAccount.value = null;
        return;
      }
      if (id === ALL_ACCOUNTS_ID) {
        await initUnifiedAsync();
        return;
      }
      // Until this account's credentials are in, folder loads must not run
      // with the previous account's.
      currentAccount.value = null;
      const acc = await accountsStore.loadAccountWithCredentialsAsync(id);
      if (mailStore.selectedAccountId !== id) return;
      currentAccount.value = acc;
      if (acc) {
        await refreshMailboxesAndSelectInboxAsync(acc);
      }
    }),
  );

  watch(
    () => mailStore.selectedMailboxName,
    (mailbox) => reportFailuresAsync(async () => {
      if (!mailbox || !currentAccount.value) return;
      await mailStore.refreshMessagesAsync(currentAccount.value, mailbox);
    }),
  );

  watch(
    () => mailStore.selectedRole,
    (role) => reportFailuresAsync(async () => {
      if (!role || !mailStore.isUnifiedView) return;
      await mailStore.refreshUnifiedAsync(role, unifiedAccounts.value);
    }),
  );

  const onRefresh = () => reportFailuresAsync(async () => {
    if (mailStore.isUnifiedView) {
      if (mailStore.selectedRole) {
        await mailStore.refreshUnifiedAsync(mailStore.selectedRole, unifiedAccounts.value);
      }
    } else {
      if (currentAccount.value && mailStore.selectedMailboxName) {
        await mailStore.refreshMessagesAsync(currentAccount.value, mailStore.selectedMailboxName);
      }
    }
  });

  watch(
    () => mailStore.selectedMessageId,
    async (id) => {
      if (!id) return;
      const row = mailStore.messageList.find((m) => m.id === id);
      if (!row) return;
      await mailStore.loadMessageBodyAsync(row);
    },
  );

  const onSetupComplete = () => reportFailuresAsync(async () => {
    showSetup.value = false;
    await accountsStore.loadAccountsAsync();
  });

  return { showSetup, currentAccount, initError, onRefresh, onSetupComplete };
};
