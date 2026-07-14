<script setup lang="ts">
import { onLongPress, useMediaQuery } from "@vueuse/core";
import { PanelLeftClose, PanelLeftOpen, Paperclip, Search } from "lucide-vue-next";
import type { SelectMessage } from "~/database/schemas";
import { getAvatarColor, getAvatarInitials } from "~/lib/avatar";
import { isMessageUnread, roleLabelKey } from "~/stores/mail";

const props = defineProps<{ sidebarCollapsed?: boolean }>();
const emit = defineEmits<{
  reply: [msg: SelectMessage];
  replyAll: [msg: SelectMessage];
  forward: [msg: SelectMessage];
  fullscreen: [msg: SelectMessage];
  toggleSidebar: [];
}>();

const { t } = useI18n();
const mailStore = useMailStore();
const accountsStore = useAccountsStore();
const selectionStore = useSelectionStore();

// --- Selection (haex-pass semantics; plain click opens because mail
// has a detail pane — ctrl/cmd-click or long-press start selecting) ---

const longPressedHook = ref(false);

// The inline :ref callback re-runs on every list re-render — guard so a
// row's long-press handler is only registered once per element.
const longPressWired = new WeakSet<HTMLElement>();

const setupLongPress = (el: unknown, msg: SelectMessage) => {
  const element = el as HTMLElement | { $el?: HTMLElement } | null;
  const target = element instanceof HTMLElement ? element : element?.$el;
  if (!target || longPressWired.has(target)) return;
  longPressWired.add(target);
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

  if (event.shiftKey && !selectionStore.isSelectionMode) {
    selectionStore.selectItem(msg.id);
    return;
  }

  if (event.ctrlKey || event.metaKey || selectionStore.isSelectionMode) {
    selectionStore.toggleSelection(msg.id);
    return;
  }

  mailStore.selectMessage(msg.id);
};

const onActivateMessage = (msg: SelectMessage) => {
  if (selectionStore.isSelectionMode) {
    selectionStore.toggleSelection(msg.id);
    return;
  }
  mailStore.selectMessage(msg.id);
};

// --- Context menu actions ---

// On touch, long-press already enters selection mode; reka's built-in
// long-press-to-open would fire on the same hold, so the context menu
// stays a fine-pointer (mouse) affordance.
const isCoarsePointer = useMediaQuery("(pointer: coarse)");

const onContextDelete = async (msg: SelectMessage) => {
  await mailStore.bulkMoveToRoleAsync([msg.id], "trash");
  // The row is gone — a stale selection id would keep selection mode on.
  if (selectionStore.isSelected(msg.id)) selectionStore.toggleSelection(msg.id);
};

const rowClass = (msg: SelectMessage) => {
  if (selectionStore.isSelected(msg.id))
    return "bg-primary/20 ring-1 ring-inset ring-primary/30";
  if (mailStore.selectedMessageId === msg.id) return "bg-accent";
  return "";
};

// --- Bulk actions (shared with the mobile toolbar in index.vue) ---

const bulkActions = useBulkMailActions();

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
  return first.name || first.email;
};

const senderEmail = (msg: SelectMessage) => msg.fromJson[0]?.email ?? "";

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

// For non-today messages, provide the time as a second display line.
const formatTime = (ts: number | null): string => {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  if (d.toDateString() === new Date().toDateString()) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

</script>

<template>
  <section class="h-full md:border-r border-border flex flex-col">
    <!-- Desktop-only selection toolbar.
         On mobile it lives in the page header (index.vue) to avoid layout jump. -->
    <div v-if="selectionStore.isSelectionMode" class="hidden md:block shrink-0">
      <MailSelectionToolbar
        :can-move="!!moveContext"
        @mark-read="bulkActions.markReadAsync(true)"
        @mark-unread="bulkActions.markReadAsync(false)"
        @archive="bulkActions.archiveAsync"
        @move="showMoveDialog = true"
        @delete="bulkActions.deleteAsync"
      />
    </div>

    <!-- Folder header with inline search + sort (desktop only; mobile handled in index.vue). -->
    <header
      v-else
      class="h-12 border-b border-border hidden md:flex items-center gap-0.5 px-1 shrink-0"
    >
      <template v-if="!mailStore.isSearching">
        <!-- Desktop-only sidebar toggle -->
        <UiButton
          variant="ghost"
          size="icon-lg"
          :icon="props.sidebarCollapsed ? PanelLeftOpen : PanelLeftClose"
          :tooltip="props.sidebarCollapsed ? t('openSidebar') : t('closeSidebar')"
          :aria-label="props.sidebarCollapsed ? t('openSidebar') : t('closeSidebar')"
          class="hidden md:flex shrink-0"
          @click="emit('toggleSidebar')"
        />
        <span class="hidden md:block flex-1 truncate pl-1 text-sm font-medium">{{ headerLabel }}</span>
        <span class="flex-1 md:hidden" />
        <span v-if="mailStore.isLoadingMessages" class="text-muted-foreground text-sm pr-1">…</span>
        <UiButton
          variant="ghost"
          size="icon-lg"
          :icon="Search"
          :aria-label="t('search')"
          @click="mailStore.isSearching = true"
        />
        <MailSortMenu />
      </template>

      <MailSearchBar v-else />
    </header>

    <ul v-if="mailStore.filteredMessageList.length > 0" class="flex-1 overflow-y-auto">
      <ShadcnContextMenu v-for="msg in mailStore.filteredMessageList" :key="msg.id">
        <ShadcnContextMenuTrigger as-child :disabled="isCoarsePointer">
          <li
            :ref="(el) => setupLongPress(el, msg)"
            tabindex="0"
            class="border-b border-border py-3 pr-4 pl-3 flex gap-2.5 cursor-pointer hover:bg-accent/50 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            :class="rowClass(msg)"
            @click="onClickMessage(msg, $event)"
            @dblclick="emit('fullscreen', msg)"
            @keydown.enter="onActivateMessage(msg)"
            @keydown.space.prevent="onActivateMessage(msg)"
          >
            <!-- Sender avatar: colored circle with initials; ring when unread -->
            <div class="shrink-0 pt-0.5">
              <div
                class="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white select-none leading-none"
                :class="[
                  getAvatarColor(senderEmail(msg)),
                  isMessageUnread(msg) ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : '',
                ]"
              >
                {{ getAvatarInitials(msg.fromJson[0]?.name, senderEmail(msg)) }}
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-start gap-2">
                <span
                  class="truncate text-sm flex-1 leading-tight"
                  :class="isMessageUnread(msg) ? 'font-semibold' : 'font-medium text-muted-foreground'"
                >{{ formatSender(msg) }}</span>
                <div class="text-xs text-muted-foreground tabular-nums shrink-0 text-right leading-tight">
                  <div>{{ formatDate(msg.internalDate) }}</div>
                  <div v-if="formatTime(msg.internalDate)" class="mt-0.5 text-muted-foreground/70">
                    {{ formatTime(msg.internalDate) }}
                  </div>
                </div>
              </div>
              <div
                class="flex items-center gap-1 text-sm mt-0.5"
                :class="isMessageUnread(msg) ? 'font-medium' : 'text-muted-foreground'"
              >
                <span class="truncate">{{ msg.subject ?? t("noSubject") }}</span>
                <Paperclip
                  v-if="msg.hasAttachments"
                  class="size-3.5 shrink-0 text-muted-foreground"
                  role="img"
                  :aria-label="t('hasAttachments')"
                />
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
        </ShadcnContextMenuTrigger>
        <ShadcnContextMenuContent>
          <ShadcnContextMenuItem @select="mailStore.bulkSetFlagAsync([msg.id], '\\Seen', true)">
            {{ t("contextRead") }}
          </ShadcnContextMenuItem>
          <ShadcnContextMenuItem @select="emit('reply', msg)">
            {{ t("contextReply") }}
          </ShadcnContextMenuItem>
          <ShadcnContextMenuItem @select="emit('replyAll', msg)">
            {{ t("contextReplyAll") }}
          </ShadcnContextMenuItem>
          <ShadcnContextMenuItem @select="emit('forward', msg)">
            {{ t("contextForward") }}
          </ShadcnContextMenuItem>
          <ShadcnContextMenuSeparator />
          <ShadcnContextMenuItem class="text-destructive focus:text-destructive" @select="onContextDelete(msg)">
            {{ t("contextDelete") }}
          </ShadcnContextMenuItem>
        </ShadcnContextMenuContent>
      </ShadcnContextMenu>
    </ul>

    <div v-else class="flex-1 grid place-items-center text-sm text-muted-foreground">
      <p v-if="mailStore.isLoadingMessages">{{ t("loading") }}</p>
      <p v-else-if="mailStore.searchQuery">{{ t("noResults") }}</p>
      <p v-else>{{ t("empty") }}</p>
    </div>

    <MailMoveDialog
      v-if="moveContext"
      v-model:open="showMoveDialog"
      :account-id="moveContext.accountId"
      :exclude-mailbox-name="moveContext.mailboxName"
      @select="bulkActions.moveToMailboxAsync"
    />
  </section>
</template>

<i18n lang="yaml">
de:
  closeSidebar: Seitenleiste schließen
  openSidebar: Seitenleiste öffnen
  noMailbox: Kein Postfach gewählt
  loading: Lade Nachrichten…
  empty: Keine Nachrichten.
  noResults: Keine Ergebnisse.
  noSubject: (kein Betreff)
  unknownSender: (unbekannt)
  hasAttachments: Hat Anhänge
  search: Suchen
  contextRead: Als gelesen markieren
  contextReply: Antworten
  contextReplyAll: Allen antworten
  contextForward: Weiterleiten
  contextDelete: Löschen
en:
  closeSidebar: Close sidebar
  openSidebar: Open sidebar
  noMailbox: No mailbox selected
  loading: Loading messages…
  empty: No messages.
  noResults: No results.
  noSubject: (no subject)
  unknownSender: (unknown)
  hasAttachments: Has attachments
  search: Search
  contextRead: Mark as read
  contextReply: Reply
  contextReplyAll: Reply all
  contextForward: Forward
  contextDelete: Delete
</i18n>
