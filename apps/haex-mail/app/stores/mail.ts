import { and, desc, eq, inArray } from "drizzle-orm";
import { toast } from "vue-sonner";
import * as schema from "~/database/schemas";
import type {
  MailMessage,
  MailboxInfo,
  MessageEnvelope,
} from "@haex-space/vault-sdk";
import type { AccountWithCredentials } from "./accounts";

/**
 * Pseudo-account id for the unified view across all accounts. Folder
 * selection then works by mailbox *role* instead of name (per-account
 * inbox/trash names differ).
 */
export const ALL_ACCOUNTS_ID = "__all__";

/**
 * Currently-selected account + mailbox + message. The mail UI is
 * driven by these three IDs — switching any of them triggers fetches.
 */
export const useMailStore = defineStore("mail", () => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
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

  const refreshMailboxesAsync = async (account: AccountWithCredentials) => {
    if (!haexVault.orm) return;
    isLoadingMailboxes.value = true;
    try {
      const remote = await haexVault.client.mail.listMailboxesAsync(account.imap, {
        includeStatus: true,
      });
      await syncMailboxesAsync(account.account.id, remote);
      await loadMailboxesAsync(account.account.id);
    } finally {
      isLoadingMailboxes.value = false;
    }
  };

  const loadMailboxesAsync = async (accountId?: string) => {
    if (!haexVault.orm) return;
    const rows = accountId
      ? await haexVault.orm
          .select()
          .from(schema.mailboxes)
          .where(eq(schema.mailboxes.accountId, accountId))
      : await haexVault.orm.select().from(schema.mailboxes);
    mailboxes.value = rows;
  };

  const syncMailboxesAsync = async (accountId: string, remote: MailboxInfo[]) => {
    if (!haexVault.orm) return;
    for (const m of remote) {
      const id = `${accountId}::${m.name}`;
      const role = inferRole(m.name, m.flags);
      const existing = await haexVault.orm
        .select()
        .from(schema.mailboxes)
        .where(eq(schema.mailboxes.id, id))
        .limit(1);

      if (existing.length === 0) {
        await haexVault.orm.insert(schema.mailboxes).values({
          id,
          accountId,
          name: m.name,
          delimiter: m.delimiter ?? null,
          role,
          unseen: m.unseen ?? 0,
          exists: m.exists ?? 0,
          uidValidity: m.uidValidity ?? null,
          uidNext: m.uidNext ?? null,
        });
      } else {
        // UIDs are only unique per uidValidity generation — when the
        // server resets it, cached messages and bodies are stale and a
        // recycled UID would otherwise serve the wrong cached body.
        const prev = existing[0]!;
        if (
          prev.uidValidity != null &&
          m.uidValidity != null &&
          prev.uidValidity !== m.uidValidity
        ) {
          await invalidateMailboxCacheAsync(accountId, m.name);
        }
        await haexVault.orm
          .update(schema.mailboxes)
          .set({
            delimiter: m.delimiter ?? null,
            role,
            unseen: m.unseen ?? 0,
            exists: m.exists ?? 0,
            uidValidity: m.uidValidity ?? null,
            uidNext: m.uidNext ?? null,
          })
          .where(eq(schema.mailboxes.id, id));
      }
    }
  };

  /** Drop cached messages + bodies of one mailbox (uidValidity reset). */
  const invalidateMailboxCacheAsync = async (
    accountId: string,
    mailboxName: string,
  ) => {
    if (!haexVault.orm) return;
    const scope = and(
      eq(schema.messages.accountId, accountId),
      eq(schema.messages.mailboxName, mailboxName),
    );
    // Bodies first, scoped via subquery (an id list could exceed
    // SQLite's bind-parameter limit) — it needs the message rows still
    // present. An interrupted run leaves messages without bodies,
    // which simply re-fetch on demand.
    await haexVault.orm.delete(schema.messageBodies).where(
      inArray(
        schema.messageBodies.messageId,
        haexVault.orm
          .select({ id: schema.messages.id })
          .from(schema.messages)
          .where(scope),
      ),
    );
    await haexVault.orm.delete(schema.messages).where(scope);
  };

  const refreshMessagesAsync = async (
    account: AccountWithCredentials,
    mailboxName: string,
    count: number = 50,
  ) => {
    if (!haexVault.orm) return;
    isLoadingMessages.value = true;
    try {
      const envelopes = await haexVault.client.mail.fetchEnvelopesAsync(
        account.imap,
        mailboxName,
        { type: "latest", count },
      );

      // Reverse so newest is first in the list.
      envelopes.sort((a, b) => (b.internalDate ?? 0) - (a.internalDate ?? 0));

      await persistEnvelopesAsync(account.account.id, mailboxName, envelopes);
      await loadMessagesAsync(account.account.id, mailboxName);
    } finally {
      isLoadingMessages.value = false;
    }
  };

  const persistEnvelopesAsync = async (
    accountId: string,
    mailboxName: string,
    envelopes: MessageEnvelope[],
  ) => {
    if (!haexVault.orm) return;
    for (const env of envelopes) {
      const id = `${accountId}::${mailboxName}::${env.uid}`;
      const threadKey = env.references[0] ?? env.inReplyTo ?? env.messageId ?? id;

      const existing = await haexVault.orm
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.id, id))
        .limit(1);

      const row = {
        id,
        accountId,
        mailboxName,
        uid: env.uid,
        threadKey,
        flags: env.flags.map((f) => f.replace(/^\\/, "")),
        internalDate: env.internalDate ?? null,
        subject: env.subject ?? null,
        fromJson: env.from,
        toJson: env.to,
        ccJson: env.cc,
        messageId: env.messageId ?? null,
        inReplyTo: env.inReplyTo ?? null,
        references: env.references,
        size: env.size ?? null,
      };

      if (existing.length === 0) {
        await haexVault.orm.insert(schema.messages).values(row);
      } else {
        // Flags can change between fetches (e.g. \Seen); update them.
        await haexVault.orm
          .update(schema.messages)
          .set({ flags: env.flags.map((f) => f.replace(/^\\/, "")) })
          .where(eq(schema.messages.id, id));
      }
    }
  };

  const loadMessagesAsync = async (accountId: string, mailboxName: string) => {
    if (!haexVault.orm) return;
    const rows = await haexVault.orm
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.accountId, accountId),
          eq(schema.messages.mailboxName, mailboxName),
        ),
      )
      .orderBy(desc(schema.messages.internalDate));
    messageList.value = rows;
  };

  /**
   * Unified view: cached messages of every account's mailbox with the
   * given role, merged and sorted by date.
   */
  const loadUnifiedMessagesAsync = async (role: schema.MailboxRole) => {
    if (!haexVault.orm) return;
    const rows = await haexVault.orm
      .select({ message: schema.messages })
      .from(schema.messages)
      .innerJoin(
        schema.mailboxes,
        and(
          eq(schema.mailboxes.accountId, schema.messages.accountId),
          eq(schema.mailboxes.name, schema.messages.mailboxName),
        ),
      )
      .where(eq(schema.mailboxes.role, role))
      .orderBy(desc(schema.messages.internalDate));
    messageList.value = rows.map((r) => r.message);
  };

  /**
   * Unified refresh: for every account, sync mailboxes and fetch the
   * latest envelopes of its role mailbox. Per-account failures don't
   * abort the others.
   */
  const refreshUnifiedAsync = async (
    role: schema.MailboxRole,
    accounts: AccountWithCredentials[],
    count: number = 50,
  ) => {
    if (!haexVault.orm) return;
    isLoadingMailboxes.value = true;
    isLoadingMessages.value = true;
    try {
      const results = await Promise.allSettled(
        accounts.map(async (acc) => {
          const remote = await haexVault.client.mail.listMailboxesAsync(
            acc.imap,
            { includeStatus: true },
          );
          await syncMailboxesAsync(acc.account.id, remote);
          const roleName = remote.find(
            (m) => inferRole(m.name, m.flags) === role,
          )?.name;
          if (!roleName) return;
          const envelopes = await haexVault.client.mail.fetchEnvelopesAsync(
            acc.imap,
            roleName,
            { type: "latest", count },
          );
          await persistEnvelopesAsync(acc.account.id, roleName, envelopes);
        }),
      );
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.warn(
            "[haex-mail] unified refresh failed for account",
            accounts[i]?.account.id,
            r.reason,
          );
        }
      });
      // The user may have switched views while fetches were in flight.
      if (isUnifiedView.value) {
        await loadMailboxesAsync();
        if (selectedRole.value === role) {
          await loadUnifiedMessagesAsync(role);
        }
      }
    } finally {
      isLoadingMailboxes.value = false;
      isLoadingMessages.value = false;
    }
  };

  const persistMessageBodyAsync = async (messageId: string, msg: MailMessage) => {
    if (!haexVault.orm) return;
    const attachmentsJson: schema.AttachmentJson[] = msg.attachments.map((a) => ({
      partIndex: a.partIndex,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      contentId: a.contentId,
      isInline: a.isInline,
    }));
    await haexVault.orm
      .insert(schema.messageBodies)
      .values({
        messageId,
        bodyText: msg.bodyText ?? null,
        bodyHtml: msg.bodyHtml ?? null,
        attachmentsJson,
      })
      .onConflictDoNothing();
  };

  const buildMailMessage = (
    message: schema.SelectMessage,
    body: schema.SelectMessageBody,
  ): MailMessage => {
    return {
      envelope: {
        uid: message.uid,
        flags: message.flags,
        internalDate: message.internalDate ?? undefined,
        subject: message.subject ?? undefined,
        from: message.fromJson,
        to: message.toJson,
        cc: message.ccJson,
        messageId: message.messageId ?? undefined,
        inReplyTo: message.inReplyTo ?? undefined,
        references: message.references,
      },
      bodyText: body.bodyText ?? undefined,
      bodyHtml: body.bodyHtml ?? undefined,
      attachments: body.attachmentsJson,
    };
  };

  /**
   * Best-effort: mark a message \Seen on the server and mirror it into
   * the local cache. Accepts flags in wire ("\Seen") or bare ("Seen")
   * format. Callers fire-and-forget so rendering never waits on the
   * IMAP round-trip (offline reads would otherwise hang on it).
   */
  const markSeenAsync = async (
    message: schema.SelectMessage,
    flags: string[],
  ) => {
    if (flags.some((f) => f.replace(/^\\/, "") === "Seen")) return;
    try {
      const account = await accountsStore.getCredentialsCachedAsync(
        message.accountId,
      );
      if (!account) return;
      await haexVault.client.mail.setFlagsAsync(
        account.imap,
        message.mailboxName,
        [message.uid],
        ["\\Seen"],
        true,
      );
      await updateLocalFlagsAsync([message.id], "\\Seen", true);
    } catch (err) {
      console.warn("[haex-mail] failed to set \\Seen flag", err);
    }
  };

  /** Monotonic token so an outdated load can't overwrite a newer one. */
  let loadMessageSeq = 0;

  const loadMessageBodyAsync = async (message: schema.SelectMessage) => {
    const seq = ++loadMessageSeq;
    const isCurrent = () =>
      seq === loadMessageSeq && selectedMessageId.value === message.id;
    isLoadingMessage.value = true;
    messageBody.value = null;
    try {
      // Check local cache first — allows offline reading.
      if (haexVault.orm) {
        const cached = await haexVault.orm
          .select()
          .from(schema.messageBodies)
          .where(eq(schema.messageBodies.messageId, message.id))
          .limit(1);
        if (cached.length > 0) {
          if (isCurrent()) {
            messageBody.value = buildMailMessage(message, cached[0]!);
          }
          void markSeenAsync(message, message.flags);
          return;
        }
      }

      const account = await accountsStore.getCredentialsCachedAsync(
        message.accountId,
      );
      if (!account) throw new Error($i18n.t("mail.errors.credentials"));
      const msg = await haexVault.client.mail.fetchMessageAsync(
        account.imap,
        message.mailboxName,
        message.uid,
      );
      if (isCurrent()) messageBody.value = msg;
      persistMessageBodyAsync(message.id, msg).catch((err) =>
        console.warn("[haex-mail] failed to cache message body", err),
      );
      void markSeenAsync(message, msg.envelope.flags);
    } finally {
      if (seq === loadMessageSeq) isLoadingMessage.value = false;
    }
  };

  /**
   * Mirror a flag change into the cached rows (DB + in-memory list) so
   * the list reflects read/unread state without a server re-fetch.
   */
  const updateLocalFlagsAsync = async (
    ids: string[],
    flag: string,
    add: boolean,
  ) => {
    if (!haexVault.orm) return;
    const bare = flag.replace(/^\\/, "");
    for (const id of ids) {
      const row = messageList.value.find((m) => m.id === id);
      const current = row?.flags ?? [];
      const next = add
        ? current.includes(bare)
          ? current
          : [...current, bare]
        : current.filter((f) => f.replace(/^\\/, "") !== bare);
      await haexVault.orm
        .update(schema.messages)
        .set({ flags: next })
        .where(eq(schema.messages.id, id));
      if (row) row.flags = next;
    }
  };

  // --- Bulk actions ------------------------------------------------------
  // All bulk actions group the selected rows by (accountId, mailboxName),
  // so they work identically in per-account and unified view.

  interface MessageGroup {
    accountId: string;
    mailboxName: string;
    rows: schema.SelectMessage[];
  }

  const groupSelectedRows = (ids: string[]): MessageGroup[] => {
    const groups = new Map<string, MessageGroup>();
    for (const id of ids) {
      const row = messageList.value.find((m) => m.id === id);
      if (!row) continue;
      const key = `${row.accountId}::${row.mailboxName}`;
      let group = groups.get(key);
      if (!group) {
        group = { accountId: row.accountId, mailboxName: row.mailboxName, rows: [] };
        groups.set(key, group);
      }
      group.rows.push(row);
    }
    return [...groups.values()];
  };

  const reloadCurrentListAsync = async () => {
    if (isUnifiedView.value && selectedRole.value) {
      await loadUnifiedMessagesAsync(selectedRole.value);
    } else if (selectedAccountId.value && selectedMailboxName.value) {
      await loadMessagesAsync(selectedAccountId.value, selectedMailboxName.value);
    }
  };

  const reportBulkFailures = (results: PromiseSettledResult<unknown>[]) => {
    const failed = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (failed) {
      console.warn("[haex-mail] bulk action failed", failed.reason);
      toast.error(
        failed.reason instanceof Error
          ? failed.reason.message
          : String(failed.reason),
      );
    }
  };

  /** Mark messages read/unread (\Seen) or set any other flag. */
  const bulkSetFlagAsync = async (ids: string[], flag: string, add: boolean) => {
    const groups = groupSelectedRows(ids);
    const results = await Promise.allSettled(
      groups.map(async (g) => {
        const account = await accountsStore.getCredentialsCachedAsync(g.accountId);
        if (!account) throw new Error($i18n.t("mail.errors.credentials"));
        await haexVault.client.mail.setFlagsAsync(
          account.imap,
          g.mailboxName,
          g.rows.map((r) => r.uid),
          [flag],
          add,
        );
        await updateLocalFlagsAsync(g.rows.map((r) => r.id), flag, add);
      }),
    );
    reportBulkFailures(results);
    await reloadCurrentListAsync();
  };

  /** Move messages of one group to a destination mailbox and drop the cache rows. */
  const moveGroupAsync = async (g: MessageGroup, destinationName: string) => {
    if (!haexVault.orm) return;
    if (destinationName === g.mailboxName) return;
    const account = await accountsStore.getCredentialsCachedAsync(g.accountId);
    if (!account) throw new Error($i18n.t("mail.errors.credentials"));
    await haexVault.client.mail.moveMessagesAsync(
      account.imap,
      g.mailboxName,
      destinationName,
      g.rows.map((r) => r.uid),
    );
    // Messages first — an interrupted run then leaves at worst orphaned
    // body rows, never ghost list entries whose UIDs are already moved.
    const ids = g.rows.map((r) => r.id);
    await haexVault.orm
      .delete(schema.messages)
      .where(inArray(schema.messages.id, ids));
    await haexVault.orm
      .delete(schema.messageBodies)
      .where(inArray(schema.messageBodies.messageId, ids));
  };

  /** Delete (role "trash") or archive (role "archive") messages. */
  const bulkMoveToRoleAsync = async (ids: string[], role: "trash" | "archive") => {
    if (!haexVault.orm) return;
    if (selectedMessageId.value && ids.includes(selectedMessageId.value)) {
      selectMessage(null);
    }
    const groups = groupSelectedRows(ids);
    const results = await Promise.allSettled(
      groups.map(async (g) => {
        const dest = (
          await haexVault.orm!
            .select()
            .from(schema.mailboxes)
            .where(
              and(
                eq(schema.mailboxes.accountId, g.accountId),
                eq(schema.mailboxes.role, role),
              ),
            )
            .limit(1)
        )[0];
        if (!dest) {
          throw new Error(
            $i18n.t("mail.errors.noFolderForRole", {
              folder: $i18n.t(`mail.roles.${role}`),
            }),
          );
        }
        await moveGroupAsync(g, dest.name);
      }),
    );
    reportBulkFailures(results);
    await reloadCurrentListAsync();
  };

  /** Move messages to a specific mailbox — caller ensures a single account. */
  const bulkMoveToMailboxAsync = async (ids: string[], mailboxName: string) => {
    if (selectedMessageId.value && ids.includes(selectedMessageId.value)) {
      selectMessage(null);
    }
    const groups = groupSelectedRows(ids);
    const results = await Promise.allSettled(
      groups.map((g) => moveGroupAsync(g, mailboxName)),
    );
    reportBulkFailures(results);
    await reloadCurrentListAsync();
  };

  const selectMailbox = (mailboxName: string | null) => {
    selectedMailboxName.value = mailboxName;
    selectedRole.value = null;
    selectedMessageId.value = null;
    messageBody.value = null;
  };

  /** Unified-view counterpart to selectMailbox — selects by role. */
  const selectRole = (role: schema.MailboxRole | null) => {
    selectedRole.value = role;
    selectedMailboxName.value = null;
    selectedMessageId.value = null;
    messageBody.value = null;
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
  };

  // Auto-select the first account when the list loads.
  watch(
    () => accountsStore.accounts,
    (list) => {
      if (!selectedAccountId.value && list.length > 0) {
        selectedAccountId.value = list[0]!.id;
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

/**
 * Map an IMAP mailbox name + LIST flags to a standardized role used in
 * the sidebar. The IMAP RFC 6154 SPECIAL-USE flags (\Sent, \Drafts,
 * \Trash, \Junk, \Archive) are most reliable; fall back to common
 * folder names when the server doesn't advertise them.
 */
const ROLE_LABEL_KEYS = new Set([
  "inbox",
  "sent",
  "drafts",
  "trash",
  "junk",
  "archive",
]);

/**
 * i18n key for a standardized mailbox role's UI label (global messages,
 * see plugins/i18n-messages.ts). Null for unknown/custom folders.
 */
export function roleLabelKey(role: string | null | undefined): string | null {
  return role && ROLE_LABEL_KEYS.has(role) ? `mail.roles.${role}` : null;
}

export function inferRole(name: string, flags: string[]): string | null {
  const flagSet = new Set(flags.map((f) => f.toLowerCase()));
  if (flagSet.has("\\inbox") || name.toUpperCase() === "INBOX") return "inbox";
  if (flagSet.has("\\sent")) return "sent";
  if (flagSet.has("\\drafts")) return "drafts";
  if (flagSet.has("\\trash")) return "trash";
  if (flagSet.has("\\junk")) return "junk";
  if (flagSet.has("\\archive")) return "archive";

  const lower = name.toLowerCase();
  if (lower.includes("sent") || lower.includes("gesend")) return "sent";
  if (lower.includes("draft") || lower.includes("entwurf")) return "drafts";
  if (lower.includes("trash") || lower.includes("papierkorb") || lower.includes("deleted"))
    return "trash";
  if (lower.includes("spam") || lower.includes("junk")) return "junk";
  if (lower.includes("archiv")) return "archive";
  return null;
}
