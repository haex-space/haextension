<script setup lang="ts">
<<<<<<< Updated upstream
import { onLongPress } from "@vueuse/core";
=======
import { onLongPress, useMediaQuery } from "@vueuse/core";
import { ArrowUpDown, ChevronDown, ChevronUp, Search, X } from "lucide-vue-next";
>>>>>>> Stashed changes
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
  if (selectionStore.isSelected(msg.id))
    return "bg-primary/20 ring-1 ring-inset ring-primary/30";
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

// --- Search ---

const isSearching = ref(false);
const searchQuery = ref("");
const searchInputRef = ref<HTMLInputElement | null>(null);

const startSearch = async () => {
  isSearching.value = true;
  await nextTick();
  searchInputRef.value?.focus();
};

const closeSearch = () => {
  isSearching.value = false;
  searchQuery.value = "";
};

watch(
  [
    () => mailStore.selectedMailboxName,
    () => mailStore.selectedRole,
    () => mailStore.selectedAccountId,
  ],
  () => closeSearch(),
);

// --- Sort ---

type SortField = "date" | "subject" | "sender" | "flagged" | "read";

const sortField = ref<SortField>("date");
const sortDir = ref<"asc" | "desc">("desc");

const SORT_OPTIONS: { field: SortField; labelKey: string }[] = [
  { field: "date", labelKey: "sortDate" },
  { field: "subject", labelKey: "sortSubject" },
  { field: "sender", labelKey: "sortSender" },
  { field: "flagged", labelKey: "sortFlagged" },
  { field: "read", labelKey: "sortRead" },
];

const toggleSort = (field: SortField) => {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortField.value = field;
    sortDir.value = "desc";
  }
};

// --- Filtered + sorted message list ---

const filteredAndSortedMessages = computed(() => {
  let list = mailStore.messageList;

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((msg) => {
      const sender = formatSender(msg).toLowerCase();
      const subject = (msg.subject ?? "").toLowerCase();
      return sender.includes(q) || subject.includes(q);
    });
  }

  // Default order from DB is date/desc — skip sort copy in that case.
  if (sortField.value === "date" && sortDir.value === "desc") return list;

  const sorted = [...list];
  const dir = sortDir.value === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortField.value) {
      case "date":
        cmp = (a.internalDate ?? 0) - (b.internalDate ?? 0);
        break;
      case "subject":
        cmp = (a.subject ?? "").localeCompare(b.subject ?? "");
        break;
      case "sender":
        cmp = formatSender(a).localeCompare(formatSender(b));
        break;
      case "flagged":
        cmp = (isFlagged(b) ? 1 : 0) - (isFlagged(a) ? 1 : 0);
        break;
      case "read":
        cmp = (isUnread(b) ? 1 : 0) - (isUnread(a) ? 1 : 0);
        break;
    }
    return cmp * dir;
  });
  return sorted;
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

const isUnread = (msg: SelectMessage) => {
  // IMAP delivers \Seen as a flag; absence means unread.
  return !msg.flags.some((f) => f.toLowerCase().includes("seen"));
};

const isFlagged = (msg: SelectMessage) =>
  msg.flags.some((f) => f.toLowerCase().includes("flagged"));

// --- Avatar ---

const AVATAR_COLORS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-pink-500",
];

const getInitials = (name: string | undefined, email: string): string => {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
    }
    return (parts[0]?.[0] ?? "?").toUpperCase();
  }
  return (email[0] ?? "?").toUpperCase();
};

const getAvatarColor = (email: string): string => {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
};
</script>

<template>
  <section class="md:border-r border-border flex flex-col">
    <!-- Desktop-only selection toolbar.
         On mobile it lives in the page header (index.vue) to avoid layout jump. -->
    <div v-if="selectionStore.isSelectionMode" class="hidden md:block shrink-0">
      <MailSelectionToolbar
        :can-move="!!moveContext"
        @mark-read="onMarkReadAsync(true)"
        @mark-unread="onMarkReadAsync(false)"
        @archive="onArchiveAsync"
        @move="showMoveDialog = true"
        @delete="onDeleteAsync"
      />
    </div>

    <!-- Desktop-only folder header with inline search + sort. -->
    <header
      v-else
      class="h-12 border-b border-border hidden md:flex items-center gap-0.5 px-1 shrink-0"
    >
      <template v-if="!isSearching">
        <span class="flex-1 truncate pl-3 text-sm font-medium">{{ headerLabel }}</span>
        <span v-if="mailStore.isLoadingMessages" class="text-muted-foreground text-sm pr-1">…</span>
        <UiButton
          variant="ghost"
          size="icon-lg"
          :icon="Search"
          :aria-label="t('search')"
          @click="startSearch"
        />
        <ShadcnDropdownMenu>
          <ShadcnDropdownMenuTrigger as-child>
            <UiButton
              variant="ghost"
              size="icon-lg"
              :icon="ArrowUpDown"
              :aria-label="t('sort')"
            />
          </ShadcnDropdownMenuTrigger>
          <ShadcnDropdownMenuContent align="end" class="w-44">
            <ShadcnDropdownMenuItem
              v-for="opt in SORT_OPTIONS"
              :key="opt.field"
              class="justify-between"
              @click.prevent="toggleSort(opt.field)"
            >
              <span>{{ t(opt.labelKey) }}</span>
              <ChevronUp
                v-if="sortField === opt.field && sortDir === 'asc'"
                class="h-3.5 w-3.5 text-muted-foreground"
              />
              <ChevronDown
                v-else-if="sortField === opt.field && sortDir === 'desc'"
                class="h-3.5 w-3.5 text-muted-foreground"
              />
            </ShadcnDropdownMenuItem>
          </ShadcnDropdownMenuContent>
        </ShadcnDropdownMenu>
      </template>

      <template v-else>
        <UiButton
          variant="ghost"
          size="icon-lg"
          :icon="X"
          :aria-label="t('closeSearch')"
          @click="closeSearch"
        />
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="search"
          class="flex-1 h-8 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
          :placeholder="t('searchPlaceholder')"
        />
        <UiButton
          v-if="searchQuery"
          variant="ghost"
          size="icon-lg"
          :icon="X"
          :aria-label="t('clearSearch')"
          @click="searchQuery = ''"
        />
      </template>
    </header>

<<<<<<< Updated upstream
    <ul v-if="mailStore.messageList.length > 0" class="flex-1 overflow-y-auto">
      <li
        v-for="msg in mailStore.messageList"
        :key="msg.id"
        :ref="(el) => setupLongPress(el, msg)"
        class="border-b border-border px-4 py-3 cursor-pointer hover:bg-accent/50 select-none"
        :class="[rowClass(msg), { 'font-semibold': isUnread(msg) }]"
        @click="onClickMessage(msg, $event)"
      >
        <div class="flex items-baseline gap-2">
          <span class="truncate text-sm flex-1">{{ formatSender(msg) }}</span>
          <span class="text-xs text-muted-foreground tabular-nums shrink-0">
            {{ formatDate(msg.internalDate) }}
          </span>
        </div>
        <div class="text-sm truncate mt-0.5">
          {{ msg.subject ?? t("noSubject") }}
        </div>
        <div
          v-if="mailStore.isUnifiedView"
          class="flex items-center gap-1.5 mt-1"
        >
          <span
            class="size-2 rounded-full shrink-0"
            :class="accountColor(msg.accountId)"
          />
          <span class="text-xs font-normal text-muted-foreground truncate">
            {{ accountEmail(msg.accountId) }}
          </span>
        </div>
      </li>
=======
    <ul v-if="filteredAndSortedMessages.length > 0" class="flex-1 overflow-y-auto">
      <ShadcnContextMenu v-for="msg in filteredAndSortedMessages" :key="msg.id">
        <ShadcnContextMenuTrigger as-child :disabled="isCoarsePointer">
          <li
            :ref="(el) => setupLongPress(el, msg)"
            tabindex="0"
            class="border-b border-border py-3 pr-4 pl-3 flex gap-2.5 cursor-pointer hover:bg-accent/50 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            :class="rowClass(msg)"
            @click="onClickMessage(msg, $event)"
            @keydown.enter="onActivateMessage(msg)"
            @keydown.space.prevent="onActivateMessage(msg)"
          >
            <!-- Sender avatar: colored circle with initials; ring when unread -->
            <div class="shrink-0 pt-0.5">
              <div
                class="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white select-none leading-none"
                :class="[
                  getAvatarColor(senderEmail(msg)),
                  isUnread(msg) ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : '',
                ]"
              >
                {{ getInitials(msg.fromJson[0]?.name, senderEmail(msg)) }}
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-start gap-2">
                <span
                  class="truncate text-sm flex-1 leading-tight"
                  :class="isUnread(msg) ? 'font-semibold' : 'font-medium text-muted-foreground'"
                >{{ formatSender(msg) }}</span>
                <div class="text-xs text-muted-foreground tabular-nums shrink-0 text-right leading-tight">
                  <div>{{ formatDate(msg.internalDate) }}</div>
                  <div v-if="formatTime(msg.internalDate)" class="mt-0.5 text-muted-foreground/70">
                    {{ formatTime(msg.internalDate) }}
                  </div>
                </div>
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
        </ShadcnContextMenuTrigger>
        <ShadcnContextMenuContent>
          <ShadcnContextMenuItem @select="mailStore.bulkSetFlagAsync([msg.id], '\\Seen', true)">
            {{ t("contextRead") }}
          </ShadcnContextMenuItem>
          <ShadcnContextMenuItem @select="emit('reply', msg)">
            {{ t("contextReply") }}
          </ShadcnContextMenuItem>
          <ShadcnContextMenuSeparator />
          <ShadcnContextMenuItem class="text-destructive focus:text-destructive" @select="onContextDelete(msg)">
            {{ t("contextDelete") }}
          </ShadcnContextMenuItem>
        </ShadcnContextMenuContent>
      </ShadcnContextMenu>
>>>>>>> Stashed changes
    </ul>

    <div v-else class="flex-1 grid place-items-center text-sm text-muted-foreground">
      <p v-if="mailStore.isLoadingMessages">{{ t("loading") }}</p>
      <p v-else-if="searchQuery">{{ t("noResults") }}</p>
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
  noResults: Keine Ergebnisse.
  noSubject: (kein Betreff)
  unknownSender: (unbekannt)
<<<<<<< Updated upstream
=======
  search: Suchen
  sort: Sortieren
  closeSearch: Suche schließen
  clearSearch: Eingabe löschen
  searchPlaceholder: Nachrichten durchsuchen…
  sortDate: Datum
  sortSubject: Betreff
  sortSender: Absender
  sortFlagged: Wichtigkeit
  sortRead: Gelesen/Ungelesen
  contextRead: Als gelesen markieren
  contextReply: Antworten
  contextDelete: Löschen
>>>>>>> Stashed changes
en:
  noMailbox: No mailbox selected
  loading: Loading messages…
  empty: No messages.
  noResults: No results.
  noSubject: (no subject)
  unknownSender: (unknown)
<<<<<<< Updated upstream
=======
  search: Search
  sort: Sort
  closeSearch: Close search
  clearSearch: Clear input
  searchPlaceholder: Search messages…
  sortDate: Date
  sortSubject: Subject
  sortSender: Sender
  sortFlagged: Importance
  sortRead: Read/Unread
  contextRead: Mark as read
  contextReply: Reply
  contextDelete: Delete
>>>>>>> Stashed changes
</i18n>
