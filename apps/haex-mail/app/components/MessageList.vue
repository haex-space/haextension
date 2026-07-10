<script setup lang="ts">
import { onLongPress } from "@vueuse/core";
import type { SelectMessage } from "~/database/schemas";
import { roleLabelKey } from "~/stores/mail";

const { t } = useI18n();
const mailStore = useMailStore();
const accountsStore = useAccountsStore();
const selectionStore = useSelectionStore();

// --- Selection (haex-pass semantics; plain click opens because mail
// has a detail pane — ctrl/cmd-click or long-press start selecting) ---

const longPressedHook = ref(false);

const setupLongPress = (el: unknown, msg: SelectMessage) => {
  const element = el as HTMLElement | { $el?: HTMLElement } | null;
  const target = element instanceof HTMLElement ? element : element?.$el;
  if (!target) return;
  onLongPress(
    target,
    () => {
      longPressedHook.value = true;
      selectionStore.selectItem(msg.id);
    },
    { delay: 500 },
  );
};

watch(
  () => selectionStore.selectedCount,
  (count) => {
    if (count === 0) longPressedHook.value = false;
  },
);

const onClickMessage = (msg: SelectMessage, event: MouseEvent) => {
  // A long press just selected this row — swallow the click it emits.
  if (longPressedHook.value && selectionStore.isSelected(msg.id)) {
    event.preventDefault();
    longPressedHook.value = false;
    return;
  }

  if (event.ctrlKey || event.metaKey || selectionStore.isSelectionMode) {
    selectionStore.toggleSelection(msg.id);
    return;
  }

  mailStore.selectMessage(msg.id);
};

const rowClass = (msg: SelectMessage) => {
  if (selectionStore.isSelected(msg.id)) return "bg-primary/10";
  if (mailStore.selectedMessageId === msg.id) return "bg-accent";
  return "";
};

// --- Bulk actions ---

const selectedIds = () => Array.from(selectionStore.selectedIds);

const onMarkReadAsync = async (add: boolean) => {
  await mailStore.bulkSetFlagAsync(selectedIds(), "\\Seen", add);
};

const onArchiveAsync = async () => {
  await mailStore.bulkMoveToRoleAsync(selectedIds(), "archive");
  selectionStore.clearSelection();
};

const onDeleteAsync = async () => {
  await mailStore.bulkMoveToRoleAsync(selectedIds(), "trash");
  selectionStore.clearSelection();
};

/**
 * Move target context: only defined when the whole selection lives in
 * one account (in the unified view it may span several).
 */
const moveContext = computed(() => {
  let accountId: string | null = null;
  let mailboxName: string | null = null;
  for (const msg of mailStore.messageList) {
    if (!selectionStore.selectedIds.has(msg.id)) continue;
    if (accountId === null) {
      accountId = msg.accountId;
      mailboxName = msg.mailboxName;
    } else if (accountId !== msg.accountId) {
      return null;
    }
  }
  return accountId && mailboxName ? { accountId, mailboxName } : null;
});

const showMoveDialog = ref(false);

watch(moveContext, (ctx) => {
  if (!ctx) showMoveDialog.value = false;
});

const onMoveTargetAsync = async (mailboxName: string) => {
  await mailStore.bulkMoveToMailboxAsync(selectedIds(), mailboxName);
  selectionStore.clearSelection();
};

const headerLabel = computed(() => {
  if (mailStore.isUnifiedView) {
    const labelKey = roleLabelKey(mailStore.selectedRole);
    return labelKey ? t(labelKey) : t("noMailbox");
  }
  return mailStore.selectedMailboxName ?? t("noMailbox");
});

/** Stable per-account color for the unified view's row indicator. */
const ACCOUNT_COLORS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
];

const accountColor = (accountId: string) => {
  const idx = accountsStore.accounts.findIndex((a) => a.id === accountId);
  return ACCOUNT_COLORS[(idx >= 0 ? idx : 0) % ACCOUNT_COLORS.length];
};

const accountEmail = (accountId: string) =>
  accountsStore.accounts.find((a) => a.id === accountId)?.email ?? "";

const formatSender = (msg: SelectMessage) => {
  const first = msg.fromJson[0];
  if (!first) return t("unknownSender");
  return first.name ?? first.email;
};

const formatDate = (ts: number | null) => {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  // Within current year: short month + day; older: full date.
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString();
};

const isUnread = (msg: SelectMessage) => {
  // IMAP delivers \Seen as a flag; absence means unread.
  return !msg.flags.some((f) => f.toLowerCase().includes("seen"));
};
</script>

<template>
  <section class="md:border-r border-border flex flex-col">
    <MailSelectionToolbar
      v-if="selectionStore.isSelectionMode"
      :can-move="!!moveContext"
      @mark-read="onMarkReadAsync(true)"
      @mark-unread="onMarkReadAsync(false)"
      @archive="onArchiveAsync"
      @move="showMoveDialog = true"
      @delete="onDeleteAsync"
    />
    <!-- On mobile the page header already names the folder. -->
    <header
      v-else
      class="h-12 border-b border-border hidden md:flex items-center px-4 text-sm font-medium"
    >
      {{ headerLabel }}
      <span v-if="mailStore.isLoadingMessages" class="ml-2 text-muted-foreground">…</span>
    </header>

    <ul v-if="mailStore.messageList.length > 0" class="flex-1 overflow-y-auto">
      <li
        v-for="msg in mailStore.messageList"
        :key="msg.id"
        :ref="(el) => setupLongPress(el, msg)"
        class="border-b border-border py-3 pr-4 pl-3 flex gap-2.5 cursor-pointer hover:bg-accent/50 select-none"
        :class="rowClass(msg)"
        @click="onClickMessage(msg, $event)"
      >
        <div class="w-1.5 shrink-0 flex justify-center pt-1.5">
          <span
            v-if="isUnread(msg)"
            class="size-1.5 rounded-full bg-primary"
          />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span
              class="truncate text-sm flex-1"
              :class="isUnread(msg) ? 'font-semibold' : 'font-medium text-muted-foreground'"
            >{{ formatSender(msg) }}</span>
            <span class="text-xs text-muted-foreground tabular-nums shrink-0">
              {{ formatDate(msg.internalDate) }}
            </span>
          </div>
          <div
            class="text-sm truncate mt-0.5"
            :class="isUnread(msg) ? 'font-medium' : 'text-muted-foreground'"
          >
            {{ msg.subject ?? t("noSubject") }}
          </div>
          <div
            v-if="mailStore.isUnifiedView"
            class="flex items-center gap-1.5 mt-1"
          >
            <span
              class="size-1.5 rounded-full shrink-0"
              :class="accountColor(msg.accountId)"
            />
            <span class="text-xs text-muted-foreground truncate">
              {{ accountEmail(msg.accountId) }}
            </span>
          </div>
        </div>
      </li>
    </ul>

    <div v-else class="flex-1 grid place-items-center text-sm text-muted-foreground">
      <p v-if="mailStore.isLoadingMessages">{{ t("loading") }}</p>
      <p v-else>{{ t("empty") }}</p>
    </div>

    <MailMoveDialog
      v-if="moveContext"
      v-model:open="showMoveDialog"
      :account-id="moveContext.accountId"
      :exclude-mailbox-name="moveContext.mailboxName"
      @select="onMoveTargetAsync"
    />
  </section>
</template>

<i18n lang="yaml">
de:
  noMailbox: Kein Postfach gewählt
  loading: Lade Nachrichten…
  empty: Keine Nachrichten.
  noSubject: (kein Betreff)
  unknownSender: (unbekannt)
en:
  noMailbox: No mailbox selected
  loading: Loading messages…
  empty: No messages.
  noSubject: (no subject)
  unknownSender: (unknown)
</i18n>
