import { toast } from "vue-sonner";
import type * as schema from "~/database/schemas";
import { adoptedDraftFields, draftIdOfRow, isDraftRowId, mergeDraftRows } from "~/lib/drafts";
import {
  ALL_ACCOUNTS_ID,
  isMessageFlagged,
  isMessageUnread,
  senderText,
  type MessageSortField,
} from "~/lib/mail";
import { getErrorMessage } from "~/lib/utils";
import type { MailMessage } from "@haex-space/vault-sdk";
import { useBulkMessageOps } from "./mail/bulk";
import { useMessageChanges } from "./mail/changes";
import { useMoveOutbox } from "./mail/outbox";
import { useMailRules, type AfterEnvelopesPersisted } from "./mail/rules";
import { useMessageBody } from "./mail/message";
import { useReplyBuilder } from "./mail/reply";
import { useMailSync } from "./mail/sync";
import { useNewMailWatch } from "./mail/watch";

/**
 * Currently-selected account + mailbox + message. The mail UI is
 * driven by these three IDs — switching any of them triggers fetches.
 */
export const useMailStore = defineStore("mail", () => {
  const accountsStore = useAccountsStore();
  const draftsStore = useDraftsStore();
  const ui = useUiStore();
  const { $i18n } = useNuxtApp();

  const selectedAccountId = ref<string | null>(null);
  const selectedMailboxName = ref<string | null>(null);
  const selectedRole = ref<schema.MailboxRole | null>(null);
  const selectedMessageId = ref<string | null>(null);

  const isUnifiedView = computed(
    () => selectedAccountId.value === ALL_ACCOUNTS_ID,
  );

  const mailboxes = ref<schema.SelectMailbox[]>([]);
  const messageList = ref<schema.SelectMessage[]>([]);
  const messageBody = ref<MailMessage | null>(null);

  const isLoadingMailboxes = ref(false);
  const isLoadingMessages = ref(false);
  const isLoadingMessage = ref(false);

  // --- Client-side search + sort ---
  // Owned by the store so the visible order is shared: MessageList renders
  // filteredMessageList and the page's keyboard nav / Ctrl+A consume it too.

  const searchQuery = ref("");
  const isSearching = ref(false);
  const sortField = ref<MessageSortField>("date");
  const sortDir = ref<"asc" | "desc">("desc");

  const toggleSort = (field: MessageSortField) => {
    if (sortField.value === field) {
      sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
    } else {
      sortField.value = field;
      sortDir.value = "desc";
    }
  };

  // --- Local drafts (spec 022): shown in the drafts view next to the server's drafts ---

  const isDraftsView = computed(() =>
    isUnifiedView.value
      ? selectedRole.value === "drafts"
      : mailboxes.value.find(
          (m) => m.accountId === selectedAccountId.value && m.name === selectedMailboxName.value,
        )?.role === "drafts",
  );
  const localDraftRows = ref<schema.SelectMessage[]>([]);

  const loadLocalDraftsAsync = async () => {
    if (!isDraftsView.value) {
      localDraftRows.value = [];
      return;
    }
    const accountIds = isUnifiedView.value
      ? accountsStore.accounts.map((a) => a.id)
      : selectedAccountId.value
        ? [selectedAccountId.value]
        : [];
    localDraftRows.value = await draftsStore.listRowsAsync(
      accountIds,
      (accountId) => mailboxes.value.find((m) => m.accountId === accountId && m.role === "drafts")?.name,
    );
  };

  watch(
    [isDraftsView, selectedAccountId, mailboxes, () => draftsStore.revision],
    () => void loadLocalDraftsAsync().catch((err) => console.warn("[haex-mail] local drafts not listed", err)),
    { immediate: true },
  );

  const filteredMessageList = computed(() => {
    let list = isDraftsView.value
      ? mergeDraftRows(messageList.value, localDraftRows.value)
      : messageList.value;

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      list = list.filter(
        (msg) =>
          senderText(msg).toLowerCase().includes(q) ||
          (msg.subject ?? "").toLowerCase().includes(q),
      );
    }

    // Default order from DB is date/desc — skip the sort copy in that case.
    if (sortField.value === "date" && sortDir.value === "desc") return list;

    // Every comparator is ascending-style; `dir` flips it. "desc" on
    // flagged/read therefore means flagged/unread first.
    const dir = sortDir.value === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField.value) {
        case "date":
          cmp = (a.internalDate ?? 0) - (b.internalDate ?? 0);
          break;
        case "subject":
          cmp = (a.subject ?? "").localeCompare(b.subject ?? "");
          break;
        case "sender":
          cmp = senderText(a).localeCompare(senderText(b));
          break;
        case "flagged":
          cmp = (isMessageFlagged(a) ? 1 : 0) - (isMessageFlagged(b) ? 1 : 0);
          break;
        case "read":
          cmp = (isMessageUnread(a) ? 1 : 0) - (isMessageUnread(b) ? 1 : 0);
          break;
      }
      return cmp * dir;
    });
  });

  const state = {
    selectedAccountId,
    selectedMailboxName,
    selectedRole,
    selectedMessageId,
    isUnifiedView,
    mailboxes,
    messageList,
    messageBody,
    isLoadingMailboxes,
    isLoadingMessages,
    isLoadingMessage,
  };

  // The rules need the message changes, which need the sync: bound once all of them exist.
  const afterPersist: { run: AfterEnvelopesPersisted } = { run: async () => {} };
  const sync = useMailSync(state, (accountId, mailboxName, envelopes) =>
    afterPersist.run(accountId, mailboxName, envelopes),
  );
  const {
    refreshMailboxesAsync,
    loadMailboxesAsync,
    refreshMessagesAsync,
    loadMessagesAsync,
    loadUnifiedMessagesAsync,
    refreshUnifiedAsync,
  } = sync;

  const { persistMessageBodyAsync, loadMessageBodyAsync, updateLocalFlagsAsync } =
    useMessageBody(state, sync);

  const { setFlagForUidsAsync, moveUidsAsync, deleteUidsAsync } = useMessageChanges(
    sync,
    updateLocalFlagsAsync,
  );
  const { enqueueMovesAsync, flushPendingMovesAsync } = useMoveOutbox(sync, { moveUidsAsync });
  const { applyRulesToNewInboxAsync, applyRuleToExistingAsync } = useMailRules({
    setFlagForUidsAsync,
    moveUidsAsync,
  });
  afterPersist.run = applyRulesToNewInboxAsync;

  useNewMailWatch(state, sync, applyRulesToNewInboxAsync);

  const { buildReplyContextAsync, fetchAttachmentBase64Async, getBodyContextAsync } =
    useReplyBuilder(persistMessageBodyAsync);

  const selectMailbox = (mailboxName: string | null) => {
    selectedMailboxName.value = mailboxName;
    selectedRole.value = null;
    selectedMessageId.value = null;
    messageBody.value = null;
    isSearching.value = false;
    searchQuery.value = "";
  };

  /** Unified-view counterpart to selectMailbox — selects by role. */
  const selectRole = (role: schema.MailboxRole | null) => {
    selectedRole.value = role;
    selectedMailboxName.value = null;
    selectedMessageId.value = null;
    messageBody.value = null;
    isSearching.value = false;
    searchQuery.value = "";
  };

  /** Continue a draft that only exists on the server: it becomes a local draft the dialog opens. */
  const openServerDraftAsync = async (row: schema.SelectMessage) => {
    try {
      const { bodyText, attachments } = await getBodyContextAsync(row);
      const loaded = await Promise.allSettled(
        attachments.map(async (a) => ({
          filename: a.filename ?? `attachment-${a.partIndex}`,
          contentType: a.contentType,
          data: await fetchAttachmentBase64Async(row, a.partIndex),
          ...(a.contentId ? { contentId: a.contentId } : {}),
        })),
      );
      const failed = loaded.filter((r) => r.status === "rejected").length;
      if (failed > 0) toast.warning($i18n.t("mail.forwardAttachmentsFailed", { count: failed }));
      const fields = adoptedDraftFields(
        row,
        bodyText,
        loaded.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
      );
      ui.openDraftId = await draftsStore.adoptAsync(fields, row.messageId);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  /**
   * Opening a message. A draft opens in the compose dialog instead of the reading pane: a local
   * one at once, one that only exists on the server after it was made a local one.
   */
  const selectMessage = (id: string | null) => {
    if (id && isDraftRowId(id)) {
      ui.openDraftId = draftIdOfRow(id);
      return;
    }
    const serverDraft = id && isDraftsView.value ? messageList.value.find((m) => m.id === id) : undefined;
    if (serverDraft) {
      void openServerDraftAsync(serverDraft);
      return;
    }
    selectedMessageId.value = id;
    if (!id) messageBody.value = null;
  };

  const selectAccount = (accountId: string | null) => {
    selectedAccountId.value = accountId;
    selectedMailboxName.value = null;
    selectedRole.value = null;
    selectedMessageId.value = null;
    mailboxes.value = [];
    messageList.value = [];
    messageBody.value = null;
    isSearching.value = false;
    searchQuery.value = "";
  };

  const { bulkSetFlagAsync, bulkMoveToRoleAsync, bulkMoveToMailboxAsync } =
    useBulkMessageOps(
      state,
      sync,
      { setFlagForUidsAsync },
      { enqueueMovesAsync, flushPendingMovesAsync },
      selectMessage,
      draftsStore,
    );

  // Default to the unified view when no account is selected yet.
  watch(
    () => accountsStore.accounts,
    (list) => {
      if (!selectedAccountId.value && list.length > 0) {
        selectedAccountId.value = ALL_ACCOUNTS_ID;
      }
    },
    { immediate: true },
  );

  return {
    selectedAccountId,
    selectedMailboxName,
    selectedRole,
    selectedMessageId,
    isUnifiedView,
    mailboxes,
    messageList,
    filteredMessageList,
    searchQuery,
    isSearching,
    sortField,
    sortDir,
    toggleSort,
    messageBody,
    isLoadingMailboxes,
    isLoadingMessages,
    isLoadingMessage,
    refreshMailboxesAsync,
    loadMailboxesAsync,
    refreshMessagesAsync,
    loadMessagesAsync,
    loadUnifiedMessagesAsync,
    refreshUnifiedAsync,
    loadMessageBodyAsync,
    buildReplyContextAsync,
    fetchAttachmentBase64Async,
    updateLocalFlagsAsync,
    bulkSetFlagAsync,
    bulkMoveToRoleAsync,
    bulkMoveToMailboxAsync,
    flushPendingMovesAsync,
    setFlagForUidsAsync,
    moveUidsAsync,
    deleteUidsAsync,
    applyRuleToExistingAsync,
    persistEnvelopesAsync: sync.persistEnvelopesAsync,
    selectAccount,
    selectMailbox,
    selectRole,
    selectMessage,
  };
});
