<script setup lang="ts">
import type { AccountWithCredentials } from "~/stores/accounts";

const haexVault = useHaexVaultStore();
const accountsStore = useAccountsStore();
const mailStore = useMailStore();

const showCompose = ref(false);
const showSetup = ref(false);
const currentAccount = shallowRef<AccountWithCredentials | null>(null);

onMounted(async () => {
  await haexVault.initializeAsync();
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
  <div v-if="!haexVault.isReady" class="h-full grid place-items-center text-muted-foreground">
    <p>{{ $t("loading", "Lade…") }}</p>
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
