<script setup lang="ts">
import type { AccountWithCredentials } from "~/stores/accounts";

const haexVault = useHaexVaultStore();
const accountsStore = useAccountsStore();
const mailStore = useMailStore();

const showCompose = ref(false);
const showSetup = ref(false);
const currentAccount = shallowRef<AccountWithCredentials | null>(null);
const initError = ref<string | null>(null);

onMounted(async () => {
  try {
    await haexVault.initializeAsync();
  } catch (err) {
    initError.value = (err as any)?.message ?? String(err);
    console.error('[haex-mail] Initialization failed:', err);
    return;
  }
  await accountsStore.loadAccountsAsync();
  if (!accountsStore.hasAccounts) {
    showSetup.value = true;
  }
});

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
    const acc = await accountsStore.loadAccountWithCredentialsAsync(id);
    currentAccount.value = acc;
    if (acc) {
      await mailStore.refreshMailboxesAsync(acc);
      // Default to the inbox if we have one.
      const inbox = mailStore.mailboxes.find((m) => m.role === "inbox");
      if (inbox) {
        mailStore.selectMailbox(inbox.name);
      }
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
  () => mailStore.selectedMessageUid,
  async (uid) => {
    if (!uid || !currentAccount.value || !mailStore.selectedMailboxName) return;
    await mailStore.loadMessageBodyAsync(
      currentAccount.value,
      mailStore.selectedMailboxName,
      uid,
    );
  },
);

const onSetupComplete = async () => {
  showSetup.value = false;
  await accountsStore.loadAccountsAsync();
};
</script>

<template>
  <div v-if="initError" class="h-full grid place-items-center p-8">
    <div class="max-w-xl space-y-3 text-center">
      <p class="font-semibold text-destructive">{{ $t("initError") }}</p>
      <pre class="text-xs text-left bg-muted rounded p-3 overflow-auto whitespace-pre-wrap break-all">{{ initError }}</pre>
    </div>
  </div>

  <div v-else-if="!haexVault.isReady" class="h-full grid place-items-center text-muted-foreground">
    <p>{{ $t("loading") }}</p>
  </div>

  <AccountSetupWizard
    v-else-if="showSetup || !accountsStore.hasAccounts"
    @complete="onSetupComplete"
  />

  <div v-else class="h-full grid grid-cols-[260px_360px_1fr]">
    <Sidebar @compose="showCompose = true" />
    <MessageList />
    <MessageView />
  </div>

  <ComposeDialog
    v-if="currentAccount"
    v-model:open="showCompose"
    :account="currentAccount"
  />
</template>

<i18n lang="yaml">
de:
  loading: Lade…
  initError: Initialisierung fehlgeschlagen
en:
  loading: Loading…
  initError: Initialization failed
</i18n>
