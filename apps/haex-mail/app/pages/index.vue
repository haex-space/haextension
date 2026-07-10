<script setup lang="ts">
import { onKeyStroke } from "@vueuse/core";
import { ArrowLeft, Menu, Pencil } from "lucide-vue-next";
import type { AccountWithCredentials } from "~/stores/accounts";
import { ALL_ACCOUNTS_ID, roleLabelKey } from "~/stores/mail";
import type { SelectMessage } from "~/database/schemas";

const { t } = useI18n();
const haexVault = useHaexVaultStore();
const accountsStore = useAccountsStore();
const mailStore = useMailStore();
const selectionStore = useSelectionStore();
const ui = useUiStore();

const showCompose = ref(false);
const replyContext = ref<{ to: string; subject: string } | null>(null);
const showSetup = ref(false);
const currentAccount = shallowRef<AccountWithCredentials | null>(null);
const unifiedAccounts = shallowRef<AccountWithCredentials[]>([]);
const initError = ref<string | null>(null);

// --- Mobile (1-column) navigation ---
const sheetOpen = ref(false);

const mobileTitle = computed(() => {
  if (mailStore.isUnifiedView) {
    const labelKey = roleLabelKey(mailStore.selectedRole);
    return labelKey ? t(labelKey) : t("allAccounts");
  }
  if (mailStore.selectedMailboxName) {
    return mailStore.selectedMailboxName === "INBOX"
      ? t("mail.roles.inbox")
      : mailStore.selectedMailboxName;
  }
  return "haex-mail";
});

const mobileMessageTitle = computed(() => {
  const row = mailStore.messageList.find(
    (m) => m.id === mailStore.selectedMessageId,
  );
  return row?.subject ?? t("noSubject");
});

// Picking a folder (or role) in the sheet navigates — close it.
watch(
  [() => mailStore.selectedMailboxName, () => mailStore.selectedRole],
  () => {
    sheetOpen.value = false;
  },
);

const onSheetCompose = () => {
  sheetOpen.value = false;
  showCompose.value = true;
};

const buildReplyContext = (from: { name?: string; email: string } | undefined, subject: string | null | undefined) => {
  return {
    to: from?.email ?? "",
    subject: (subject ?? "").startsWith("Re:") ? (subject ?? "") : `Re: ${subject ?? ""}`,
  };
};

const onReplyFromList = (msg: SelectMessage) => {
  replyContext.value = buildReplyContext(msg.fromJson[0], msg.subject);
  showCompose.value = true;
};

const onReplyFromView = () => {
  const env = mailStore.messageBody?.envelope;
  if (!env) return;
  replyContext.value = buildReplyContext(env.from?.[0], env.subject);
  showCompose.value = true;
};

const onDeleteFromView = async () => {
  const id = mailStore.selectedMessageId;
  if (!id) return;
  const list = mailStore.messageList;
  const idSet = new Set([id]);
  const idx = list.findIndex((m) => m.id === id);
  const next = list.slice(idx + 1).find((m) => !idSet.has(m.id))
    ?? list.slice(0, idx).reverse().find((m) => !idSet.has(m.id))
    ?? null;
  await mailStore.bulkMoveToRoleAsync([id], "trash");
  if (next) mailStore.selectMessage(next.id);
};

watch(showCompose, (v) => {
  if (!v) replyContext.value = null;
});

// --- Selection keyboard shortcuts (haex-pass parity) ---
// Guard against text inputs and the compose dialog, otherwise Ctrl+A
// would hijack text selection.
const isEditableTarget = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
  );
};

onKeyStroke(["a", "A"], (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (isEditableTarget(e) || showCompose.value) return;
  e.preventDefault();
  selectionStore.selectAll(mailStore.messageList.map((m) => m.id));
});

onKeyStroke("Escape", (e) => {
  if (!selectionStore.isSelectionMode) return;
  e.preventDefault();
  selectionStore.clearSelection();
});

onKeyStroke("Delete", async (e) => {
  if (isEditableTarget(e) || showCompose.value) return;
  if (!selectionStore.isSelectionMode) return;
  e.preventDefault();

  const ids = Array.from(selectionStore.selectedIds);
  const list = mailStore.messageList;
  const idSet = new Set(ids);

  // Find the next message to select after deletion
  const selectedIndices = list
    .map((m, i) => (idSet.has(m.id) ? i : -1))
    .filter((i) => i !== -1);

  let nextId: string | null = null;
  if (selectedIndices.length > 0) {
    const maxIdx = Math.max(...selectedIndices);
    const afterCandidate = list.slice(maxIdx + 1).find((m) => !idSet.has(m.id));
    if (afterCandidate) {
      nextId = afterCandidate.id;
    } else {
      const minIdx = Math.min(...selectedIndices);
      const beforeCandidate = list.slice(0, minIdx).reverse().find((m) => !idSet.has(m.id));
      if (beforeCandidate) nextId = beforeCandidate.id;
    }
  }

  await mailStore.bulkMoveToRoleAsync(ids, "trash");
  selectionStore.clearSelection();
  if (nextId) {
    mailStore.selectMessage(nextId);
  }
});

onKeyStroke("ArrowDown", (e) => {
  if (isEditableTarget(e) || showCompose.value) return;
  if (selectionStore.isSelectionMode || !mailStore.selectedMessageId) return;
  e.preventDefault();
  const list = mailStore.messageList;
  const idx = list.findIndex((m) => m.id === mailStore.selectedMessageId);
  if (idx !== -1 && idx < list.length - 1) {
    mailStore.selectMessage(list[idx + 1].id);
  }
});

onKeyStroke("ArrowUp", (e) => {
  if (isEditableTarget(e) || showCompose.value) return;
  if (selectionStore.isSelectionMode || !mailStore.selectedMessageId) return;
  e.preventDefault();
  const list = mailStore.messageList;
  const idx = list.findIndex((m) => m.id === mailStore.selectedMessageId);
  if (idx > 0) {
    mailStore.selectMessage(list[idx - 1].id);
  }
});

// A different folder/account means a different message set — selection
// keys would go stale.
watch(
  [
    () => mailStore.selectedMailboxName,
    () => mailStore.selectedRole,
    () => mailStore.selectedAccountId,
  ],
  () => {
    selectionStore.clearSelection();
  },
);

onMounted(async () => {
  try {
    await haexVault.initializeAsync();
  } catch (err) {
    initError.value = err instanceof Error ? err.message : String(err);
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
</script>

<template>
  <div class="h-full">
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

    <!-- Desktop: 3 columns -->
    <div
      v-else-if="ui.isMediumScreen"
      class="h-full grid grid-cols-[260px_360px_1fr]"
    >
      <MailSidebar @compose="showCompose = true" />
      <MessageList @reply="onReplyFromList" />
      <MessageView @reply="onReplyFromView" @delete="onDeleteFromView" />
    </div>

    <!-- Mobile: single column, list ↔ detail drill-in, sidebar in a sheet -->
    <div v-else class="h-full flex flex-col">
      <header class="h-14 shrink-0 border-b border-border flex items-center gap-1 px-2">
        <template v-if="!mailStore.selectedMessageId">
          <UiButton
            variant="ghost"
            size="icon-lg"
            :icon="Menu"
            :aria-label="t('menu')"
            @click="sheetOpen = true"
          />
          <span class="flex-1 truncate font-medium">{{ mobileTitle }}</span>
          <UiButton
            variant="ghost"
            size="icon-lg"
            :icon="Pencil"
            :aria-label="t('compose')"
            @click="showCompose = true"
          />
        </template>
        <template v-else>
          <UiButton
            variant="ghost"
            size="icon-lg"
            :icon="ArrowLeft"
            :aria-label="t('back')"
            @click="mailStore.selectMessage(null)"
          />
          <span class="flex-1 truncate font-medium">{{ mobileMessageTitle }}</span>
        </template>
      </header>

      <MessageList v-if="!mailStore.selectedMessageId" class="flex-1 min-h-0" @reply="onReplyFromList" />
      <MessageView v-else class="flex-1 min-h-0" @reply="onReplyFromView" @delete="onDeleteFromView" />

      <ShadcnSheet v-model:open="sheetOpen">
        <ShadcnSheetContent side="left" class="w-[85%] max-w-sm p-0">
          <ShadcnSheetTitle class="sr-only">{{ t("menu") }}</ShadcnSheetTitle>
          <ShadcnSheetDescription class="sr-only">
            {{ t("menuDescription") }}
          </ShadcnSheetDescription>
          <MailSidebar class="h-full" @compose="onSheetCompose" />
        </ShadcnSheetContent>
      </ShadcnSheet>
    </div>

    <ComposeDialog
      v-if="haexVault.isReady && accountsStore.hasAccounts"
      v-model:open="showCompose"
      :account="currentAccount ?? undefined"
      :reply-to="replyContext ?? undefined"
    />
  </div>
</template>

<i18n lang="yaml">
de:
  loading: Lade…
  initError: Initialisierung fehlgeschlagen
  menu: Menü
  menuDescription: Konten und Ordner
  compose: Neue Nachricht
  back: Zurück
  allAccounts: Alle Konten
  noSubject: (kein Betreff)
en:
  loading: Loading…
  initError: Initialization failed
  menu: Menu
  menuDescription: Accounts and folders
  compose: New message
  back: Back
  allAccounts: All accounts
  noSubject: (no subject)
</i18n>
