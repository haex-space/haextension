import type * as schema from "~/database/schemas";
import { isMessageFlagged, isMessageUnread, senderText } from "~/lib/mail";
import type { MailMessage } from "@haex-space/vault-sdk";
import { useBulkMessageOps } from "./mail/bulk";
import { useMessageBody } from "./mail/message";
import { useReplyBuilder } from "./mail/reply";
import { useMailSync } from "./mail/sync";
import { useNewMailWatch } from "./mail/watch";

/**
 * Pseudo-account id for the unified view across all accounts. Folder
 * selection then works by mailbox *role* instead of name (per-account
 * inbox/trash names differ).
 */
export const ALL_ACCOUNTS_ID = "__all__";

/** Field the message list can be sorted by (shared: list UI + keyboard nav). */
export type MessageSortField = "date" | "subject" | "sender" | "flagged" | "read";

/** Ordered sort options for the sort dropdown (shared between desktop and mobile). */
export const SORT_OPTIONS: { field: MessageSortField; labelKey: string }[] = [
  { field: "date", labelKey: "sortDate" },
  { field: "subject", labelKey: "sortSubject" },
  { field: "sender", labelKey: "sortSender" },
  { field: "flagged", labelKey: "sortFlagged" },
  { field: "read", labelKey: "sortRead" },
];

/**
 * Currently-selected account + mailbox + message. The mail UI is
 * driven by these three IDs — switching any of them triggers fetches.
 */
export const useMailStore = defineStore("mail", () => {
  const accountsStore = useAccountsStore();

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

  const filteredMessageList = computed(() => {
    let list = messageList.value;

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

  const sync = useMailSync(state);
  const {
    refreshMailboxesAsync,
    loadMailboxesAsync,
    refreshMessagesAsync,
    loadMessagesAsync,
    loadUnifiedMessagesAsync,
    refreshUnifiedAsync,
  } = sync;

  useNewMailWatch(state, sync);

  const { persistMessageBodyAsync, loadMessageBodyAsync, updateLocalFlagsAsync } =
    useMessageBody(state, sync);

  const { buildReplyContextAsync, fetchAttachmentBase64Async } =
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

  const selectMessage = (id: string | null) => {
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
    useBulkMessageOps(state, sync, updateLocalFlagsAsync, selectMessage);

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
    selectAccount,
    selectMailbox,
    selectRole,
    selectMessage,
  };
});
