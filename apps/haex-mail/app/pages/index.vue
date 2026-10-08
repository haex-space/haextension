<script setup lang="ts">
import { ArrowLeft, Menu, Pencil, Reply, Search, Trash2 } from "@lucide/vue";
import { toast } from "vue-sonner";
import { roleLabelKey } from "~/lib/mail";
import type { ReplyContext, ReplyMode } from "~/stores/mail/reply";
import { getErrorMessage } from "~/lib/utils";
import type { SelectMessage } from "~/database/schemas";

const { t } = useI18n();
// mail.roles.* lives only in the global messages (plugins/i18n-messages.ts); look it
// up on the global scope so the local <i18n> block doesn't fall back and warn.
const { t: tRole } = useI18n({ useScope: "global" });
const haexVault = useHaexVaultStore();
const accountsStore = useAccountsStore();
const mailStore = useMailStore();
const selectionStore = useSelectionStore();
const bulkActions = useBulkMailActions();
const ui = useUiStore();

const showCompose = ref(false);
const showFullscreenMessage = ref(false);

// Sidebar collapse state for 3-column desktop view
const sidebarPanelRef = ref<{ collapse: () => void; expand: () => void } | null>(null);
const sidebarCollapsed = ref(false);

const toggleSidebar = () => {
  if (sidebarCollapsed.value) {
    sidebarPanelRef.value?.expand();
  } else {
    sidebarPanelRef.value?.collapse();
  }
};

const replyContext = ref<ReplyContext | null>(null);

// --- Mobile (1-column) navigation ---
const sheetOpen = ref(false);

const mobileTitle = computed(() => {
  if (mailStore.isUnifiedView) {
    const labelKey = roleLabelKey(mailStore.selectedRole);
    return labelKey ? tRole(labelKey) : t("allAccounts");
  }
  if (mailStore.selectedMailboxName) {
    return mailStore.selectedMailboxName === "INBOX"
      ? tRole("mail.roles.inbox")
      : mailStore.selectedMailboxName;
  }
  return "haex-mail";
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

const onOpenFullscreen = () => {
  showFullscreenMessage.value = true;
};

const onComposeFromList = async (msg: SelectMessage, mode: ReplyMode) => {
  // Forwarding fetches attachment bytes over IMAP, which can fail — surface
  // it instead of leaving the compose dialog silently unopened.
  try {
    replyContext.value = await mailStore.buildReplyContextAsync(msg, mode);
    showCompose.value = true;
  } catch (err) {
    toast.error(getErrorMessage(err));
  }
};

const onReplyFromList = (msg: SelectMessage) => onComposeFromList(msg, "reply");

const onComposeFromView = async (mode: ReplyMode) => {
  const row = mailStore.messageList.find(
    (m) => m.id === mailStore.selectedMessageId,
  );
  if (!row) return;
  await onComposeFromList(row, mode);
};

const onReplyFromView = () => onComposeFromView("reply");

/** Next message to select once the rows in `idSet` are removed. */
const findNextMessageId = (list: SelectMessage[], idSet: Set<string>) => {
  const indices = list
    .map((m, i) => (idSet.has(m.id) ? i : -1))
    .filter((i) => i !== -1);
  if (indices.length === 0) return null;
  const after = list
    .slice(Math.max(...indices) + 1)
    .find((m) => !idSet.has(m.id));
  if (after) return after.id;
  const before = list
    .slice(0, Math.min(...indices))
    .reverse()
    .find((m) => !idSet.has(m.id));
  return before?.id ?? null;
};

const onDeleteFromView = async () => {
  const id = mailStore.selectedMessageId;
  if (!id) return;
  // Follow the visible (filtered/sorted) order, not the raw list order.
  const nextId = findNextMessageId(mailStore.filteredMessageList, new Set([id]));
  await mailStore.bulkMoveToRoleAsync([id], "trash");
  // bulkMoveToRoleAsync swallows failures (toast only) — don't navigate
  // away while the message is in fact still in the list.
  if (mailStore.messageList.some((m) => m.id === id)) return;
  if (selectionStore.isSelected(id)) selectionStore.toggleSelection(id);
  if (nextId) mailStore.selectMessage(nextId);
};

watch(showCompose, (v) => {
  if (!v) replyContext.value = null;
});

useMailKeyboardShortcuts({ showCompose, showFullscreenMessage, onDeleteFromView });

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

const { showSetup, currentAccount, initError, onRefresh, onSetupComplete } =
  useMailPageLoader();

</script>

<template>
  <div class="h-full">
    <div v-if="initError" class="h-full grid place-items-center p-8">
      <div class="max-w-xl space-y-3 text-center">
        <p class="font-semibold text-destructive">{{ t("initError") }}</p>
        <pre class="text-xs text-left bg-muted rounded p-3 overflow-auto whitespace-pre-wrap break-all">{{ initError }}</pre>
      </div>
    </div>

    <div v-else-if="!haexVault.isReady" class="h-full grid place-items-center text-muted-foreground">
      <p>{{ t("loading") }}</p>
    </div>

    <AccountSetupWizard
      v-else-if="showSetup || !accountsStore.hasAccounts"
      @complete="onSetupComplete"
    />

    <!-- Desktop: 3 resizable columns -->
    <div v-else-if="ui.isMediumScreen" class="h-full flex">
      <ShadcnResizablePanelGroup
        id="mail-columns"
        direction="horizontal"
        class="h-full"
        auto-save-id="haex-mail:column-sizes"
      >
        <ShadcnResizablePanel
          id="sidebar-panel"
          ref="sidebarPanelRef"
          :default-size="22"
          :min-size="15"
          :collapsible="true"
          :collapsed-size="0"
          @collapse="sidebarCollapsed = true"
          @expand="sidebarCollapsed = false"
        >
          <MailSidebar class="h-full" @compose="showCompose = true" @refresh="onRefresh" />
        </ShadcnResizablePanel>

        <ShadcnResizableHandle :with-handle="true" />

        <ShadcnResizablePanel id="list-panel" :default-size="30" :min-size="20">
          <MessageList
            :sidebar-collapsed="sidebarCollapsed"
            :refresh="onRefresh"
            @reply="onReplyFromList"
            @reply-all="onComposeFromList($event, 'reply-all')"
            @forward="onComposeFromList($event, 'forward')"
            @fullscreen="onOpenFullscreen"
            @toggle-sidebar="toggleSidebar"
          />
        </ShadcnResizablePanel>

        <ShadcnResizableHandle :with-handle="true" />

        <ShadcnResizablePanel id="view-panel" :default-size="48" :min-size="20">
          <MessageView
            @reply="onReplyFromView"
            @reply-all="onComposeFromView('reply-all')"
            @forward="onComposeFromView('forward')"
            @delete="onDeleteFromView"
          />
        </ShadcnResizablePanel>
      </ShadcnResizablePanelGroup>

      <!-- Fullscreen message overlay (dblclick) -->
      <Transition name="fade">
        <div
          v-if="showFullscreenMessage && mailStore.messageBody"
          class="fixed inset-0 z-50 bg-background flex flex-col"
        >
          <header class="h-14 shrink-0 border-b border-border flex items-center gap-1 px-2">
            <UiButton
              variant="ghost"
              size="icon-lg"
              :icon="ArrowLeft"
              :aria-label="t('back')"
              @click="showFullscreenMessage = false"
            />
            <span class="flex-1" />
            <UiButton
              variant="ghost"
              size="icon-lg"
              :icon="Reply"
              :aria-label="t('reply')"
              @click="onReplyFromView(); showFullscreenMessage = false"
            />
            <MailMoreMenu
              @reply-all="onComposeFromView('reply-all'); showFullscreenMessage = false"
              @forward="onComposeFromView('forward'); showFullscreenMessage = false"
            />
            <UiButton
              variant="ghost"
              size="icon-lg"
              :icon="Trash2"
              :aria-label="t('delete')"
              @click="onDeleteFromView(); showFullscreenMessage = false"
            />
          </header>
          <MessageView
            class="flex-1 min-h-0"
            :show-actions="false"
            @reply="onReplyFromView(); showFullscreenMessage = false"
            @reply-all="onComposeFromView('reply-all'); showFullscreenMessage = false"
            @forward="onComposeFromView('forward'); showFullscreenMessage = false"
            @delete="onDeleteFromView(); showFullscreenMessage = false"
          />
        </div>
      </Transition>
    </div>

    <!-- Mobile: single column, list ↔ detail drill-in, sidebar in a sheet -->
    <div v-else class="h-full flex flex-col">
      <!-- When in selection mode the toolbar replaces the normal header so
           the list does not jump (MessageList's toolbar is desktop-only). -->
      <MailSelectionToolbar
        v-if="selectionStore.isSelectionMode && !mailStore.selectedMessageId"
        :can-move="false"
        @mark-read="bulkActions.markReadAsync(true)"
        @mark-unread="bulkActions.markReadAsync(false)"
        @archive="bulkActions.archiveAsync"
        @move="() => {}"
        @delete="bulkActions.deleteAsync"
      />
      <!-- Mobile search bar (replaces the normal header while searching) -->
      <header v-else-if="mailStore.isSearching && !mailStore.selectedMessageId" class="h-14 shrink-0 border-b border-border flex items-center gap-1 px-2">
        <MailSearchBar />
      </header>

      <!-- Normal mobile header -->
      <header v-else class="h-14 shrink-0 border-b border-border flex items-center gap-1 px-2">
        <!-- Message detail: back + reply + delete -->
        <template v-if="mailStore.selectedMessageId">
          <UiButton
            variant="ghost"
            size="icon-lg"
            :icon="ArrowLeft"
            :aria-label="t('back')"
            @click="mailStore.selectMessage(null)"
          />
          <span class="flex-1" />
          <UiButton
            variant="ghost"
            size="icon-lg"
            :icon="Reply"
            :aria-label="t('reply')"
            @click="onReplyFromView"
          />
          <MailMoreMenu
            @reply-all="onComposeFromView('reply-all')"
            @forward="onComposeFromView('forward')"
          />
          <UiButton
            variant="ghost"
            size="icon-lg"
            :icon="Trash2"
            :aria-label="t('delete')"
            @click="onDeleteFromView"
          />
        </template>
        <!-- Folder list: menu + title + search + sort -->
        <template v-else>
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
            :icon="Search"
            :aria-label="t('search')"
            @click="mailStore.isSearching = true"
          />
          <MailSortMenu />
        </template>
      </header>

      <MessageList
        v-if="!mailStore.selectedMessageId"
        class="flex-1 min-h-0"
        :refresh="onRefresh"
        @reply="onReplyFromList"
        @reply-all="onComposeFromList($event, 'reply-all')"
        @forward="onComposeFromList($event, 'forward')"
      />
      <MessageView
        v-else
        class="flex-1 min-h-0"
        :show-actions="false"
        @reply="onReplyFromView"
        @reply-all="onComposeFromView('reply-all')"
        @forward="onComposeFromView('forward')"
        @delete="onDeleteFromView"
      />

      <ShadcnSheet v-model:open="sheetOpen">
        <ShadcnSheetContent side="left" class="w-[85%] max-w-sm p-0 gap-0">
          <div class="h-14 shrink-0 flex items-center px-4 border-b border-border">
            <ShadcnSheetTitle class="text-base font-semibold">Mail</ShadcnSheetTitle>
          </div>
          <ShadcnSheetDescription class="sr-only">
            {{ t("menuDescription") }}
          </ShadcnSheetDescription>
          <MailSidebar class="flex-1 min-h-0" @compose="onSheetCompose" @refresh="onRefresh" />
        </ShadcnSheetContent>
      </ShadcnSheet>
    </div>

    <!-- FAB: compose button (mobile-only, desktop uses sidebar button).
         Hidden while a message is open so it doesn't cover the mail view. -->
    <button
      v-if="haexVault.isReady && accountsStore.hasAccounts && !showCompose && !mailStore.selectedMessageId"
      class="fixed bottom-6 right-6 z-40 md:hidden flex items-center justify-center size-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      :aria-label="t('compose')"
      @click="showCompose = true"
    >
      <Pencil class="size-5" />
    </button>

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
  reply: Antworten
  delete: Löschen
  search: Suchen
en:
  loading: Loading…
  initError: Initialization failed
  menu: Menu
  menuDescription: Accounts and folders
  compose: New message
  back: Back
  allAccounts: All accounts
  reply: Reply
  delete: Delete
  search: Search
</i18n>
