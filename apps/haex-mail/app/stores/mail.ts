import { and, desc, eq, inArray } from "drizzle-orm";
import { toast } from "vue-sonner";
import * as schema from "~/database/schemas";
import { getErrorMessage } from "~/lib/utils";
import type {
  MailMessage,
  MailboxInfo,
  MessageEnvelope,
  OutgoingAttachment,
} from "@haex-space/vault-sdk";
import type { AccountWithCredentials } from "./accounts";

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
 * Prefill for the compose dialog when replying. `inReplyTo`/`references`
 * carry the RFC 5322 threading headers, `body` the quoted original.
 */
export interface ReplyContext {
  accountId: string;
  to: string;
  cc?: string;
  subject: string;
  inReplyTo?: string;
  references?: string[];
  body?: string;
  /** Original attachments carried over when forwarding. */
  attachments?: OutgoingAttachment[];
}

/** How the compose dialog is prefilled from an existing message. */
export type ReplyMode = "reply" | "reply-all" | "forward";

/** Read/flagged state from cached IMAP flags (shared: store sort + list UI). */
export const isMessageUnread = (msg: schema.SelectMessage) =>
  !msg.flags.some((f) => f.toLowerCase().includes("seen"));
export const isMessageFlagged = (msg: schema.SelectMessage) =>
  msg.flags.some((f) => f.toLowerCase().includes("flagged"));

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

  const senderText = (msg: schema.SelectMessage) =>
    msg.fromJson[0]?.name || msg.fromJson[0]?.email || "";

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
    const existing = await haexVault.orm
      .select()
      .from(schema.mailboxes)
      .where(eq(schema.mailboxes.accountId, accountId));
    const existingById = new Map(existing.map((m) => [m.id, m]));

    for (const m of remote) {
      const id = `${accountId}::${m.name}`;
      const values = {
        delimiter: m.delimiter ?? null,
        role: inferRole(m.name, m.flags),
        unseen: m.unseen ?? 0,
        exists: m.exists ?? 0,
        uidValidity: m.uidValidity ?? null,
        uidNext: m.uidNext ?? null,
      };

      const prev = existingById.get(id);
      if (!prev) {
        await haexVault.orm
          .insert(schema.mailboxes)
          .values({ id, accountId, name: m.name, ...values });
      } else {
        // UIDs are only unique per uidValidity generation — when the
        // server resets it, cached messages and bodies are stale and a
        // recycled UID would otherwise serve the wrong cached body.
        if (
          prev.uidValidity != null &&
          m.uidValidity != null &&
          prev.uidValidity !== m.uidValidity
        ) {
          await invalidateMailboxCacheAsync(accountId, m.name);
        }
        await haexVault.orm
          .update(schema.mailboxes)
          .set(values)
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
      await loadMessagesAsync(account.account.id, mailboxName);
      const envelopes = await haexVault.client.mail.fetchEnvelopesAsync(
        account.imap,
        mailboxName,
        { type: "latest", count },
      );
      await persistEnvelopesAsync(account.account.id, mailboxName, envelopes);
      await purgeDeletedMessagesAsync(account, mailboxName, new Set(envelopes.map((e) => e.uid)));
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
      const flags = env.flags.map((f) => f.replace(/^\\/, ""));

      // Envelope fields are immutable per UID — only flags change between
      // fetches (e.g. \Seen added by another client). Insert the row if it
      // is new, then always update flags so they stay in sync regardless.
      // hasAttachments rides along on that same update: rows cached before
      // this field existed default to false and would otherwise never
      // self-correct on a later refresh of the same UID.
      await haexVault.orm
        .insert(schema.messages)
        .values({
          id,
          accountId,
          mailboxName,
          uid: env.uid,
          threadKey,
          flags,
          internalDate: env.internalDate ?? null,
          subject: env.subject ?? null,
          fromJson: env.from,
          toJson: env.to,
          ccJson: env.cc,
          messageId: env.messageId ?? null,
          inReplyTo: env.inReplyTo ?? null,
          references: env.references,
          size: env.size ?? null,
          hasAttachments: env.hasAttachments,
        })
        .onConflictDoNothing();
      await haexVault.orm
        .update(schema.messages)
        .set({ flags, hasAttachments: env.hasAttachments })
        .where(eq(schema.messages.id, id));
    }
  };

  /**
   * Remove cached messages that no longer exist on the server.
   * After a "latest" fetch we know which UIDs exist in that window, but older
   * cached UIDs could have been expunged from another client. We verify them
   * via a single uidList round-trip and delete any the server doesn't return.
   */
  const purgeDeletedMessagesAsync = async (
    account: AccountWithCredentials,
    mailboxName: string,
    confirmedUids: Set<number>,
  ) => {
    if (!haexVault.orm) return;
    const cached = await haexVault.orm
      .select({ uid: schema.messages.uid, id: schema.messages.id })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.accountId, account.account.id),
          eq(schema.messages.mailboxName, mailboxName),
        ),
      );

    const unverified = cached.filter((r) => !confirmedUids.has(r.uid));
    if (!unverified.length) return;

    const stillPresent = await haexVault.client.mail.fetchEnvelopesAsync(
      account.imap,
      mailboxName,
      { type: "uidList", uids: unverified.map((r) => r.uid) },
    );
    await persistEnvelopesAsync(account.account.id, mailboxName, stillPresent);

    const presentUids = new Set(stillPresent.map((e) => e.uid));
    const toDelete = unverified.filter((r) => !presentUids.has(r.uid)).map((r) => r.id);
    if (!toDelete.length) return;

    // Batch deletes to stay within SQLite's bind-parameter limit (same
    // rationale as the subquery approach in invalidateMailboxCacheAsync).
    const BATCH_SIZE = 500;
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = toDelete.slice(i, i + BATCH_SIZE);
      await haexVault.orm
        .delete(schema.messageBodies)
        .where(inArray(schema.messageBodies.messageId, batch));
      await haexVault.orm
        .delete(schema.messages)
        .where(inArray(schema.messages.id, batch));
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
      await loadMailboxesAsync();
      await loadUnifiedMessagesAsync(role);
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
          await purgeDeletedMessagesAsync(acc, roleName, new Set(envelopes.map((e) => e.uid)));
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
        hasAttachments: message.hasAttachments,
      },
      bodyText: body.bodyText ?? undefined,
      bodyHtml: body.bodyHtml ?? undefined,
      attachments: body.attachmentsJson,
    };
  };

  const formatAddressList = (addrs: schema.MailAddressJson[]) =>
    addrs.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ");

  /**
   * The original body text + attachment metadata for a message — from the
   * local cache when available, otherwise a one-off full fetch (which also
   * populates the cache). Attachment bytes are never included here; fetch
   * them by `partIndex`. Used by forward, which needs both the quoted body
   * and the attachments even for a message that was never opened.
   */
  const getBodyContextAsync = async (
    msg: schema.SelectMessage,
  ): Promise<{ bodyText?: string; attachments: schema.AttachmentJson[] }> => {
    if (haexVault.orm) {
      const rows = await haexVault.orm
        .select({
          bodyText: schema.messageBodies.bodyText,
          attachmentsJson: schema.messageBodies.attachmentsJson,
        })
        .from(schema.messageBodies)
        .where(eq(schema.messageBodies.messageId, msg.id))
        .limit(1);
      if (rows.length > 0) {
        return {
          bodyText: rows[0]!.bodyText ?? undefined,
          attachments: rows[0]!.attachmentsJson,
        };
      }
    }
    const account = await accountsStore.getCredentialsCachedAsync(msg.accountId);
    if (!account) return { attachments: [] };
    const full = await haexVault.client.mail.fetchMessageAsync(
      account.imap,
      msg.mailboxName,
      msg.uid,
    );
    await persistMessageBodyAsync(msg.id, full).catch(() => {});
    return {
      bodyText: full.bodyText,
      attachments: full.attachments.map((a) => ({
        partIndex: a.partIndex,
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        contentId: a.contentId,
        isInline: a.isInline,
      })),
    };
  };

  /**
   * Fetch a single attachment's raw bytes (base64) by `partIndex`. Used
   * for opening/downloading and for re-attaching when forwarding.
   */
  const fetchAttachmentBase64Async = async (
    msg: schema.SelectMessage,
    partIndex: number,
  ): Promise<string> => {
    const account = await accountsStore.getCredentialsCachedAsync(msg.accountId);
    if (!account) throw new Error($i18n.t("mail.errors.credentials"));
    return haexVault.client.mail.fetchAttachmentAsync(
      account.imap,
      msg.mailboxName,
      msg.uid,
      partIndex,
    );
  };

  /**
   * Prefill for replying to / forwarding a message.
   *
   * - `reply` (default): recipient = sender, quoted original, RFC 5322
   *   threading headers (In-Reply-To, References = original references +
   *   its Message-ID).
   * - `reply-all`: as reply, but every other original recipient (To + Cc,
   *   minus the sender and our own address) lands in Cc.
   * - `forward`: empty recipient, `Fwd:` subject, the original quoted under
   *   a forwarded header, and no threading headers (starts a new thread).
   */
  const buildReplyContextAsync = async (
    msg: schema.SelectMessage,
    mode: ReplyMode = "reply",
  ): Promise<ReplyContext> => {
    const subject = msg.subject ?? "";

    const date = msg.internalDate
      ? new Date(msg.internalDate * 1000).toLocaleString($i18n.locale.value)
      : "";

    if (mode === "forward") {
      // Forward needs the original body + attachments even for a message
      // that was never opened (list context menu) — fetch the full message
      // once when it isn't cached and reuse it for both.
      const { bodyText, attachments: metas } = await getBodyContextAsync(msg);
      const headerLines = [
        $i18n.t("mail.forwardHeader"),
        `${$i18n.t("mail.forwardFrom")}: ${formatAddressList(msg.fromJson)}`,
        `${$i18n.t("mail.forwardDate")}: ${date}`,
        `${$i18n.t("mail.forwardSubject")}: ${subject}`,
        `${$i18n.t("mail.forwardTo")}: ${formatAddressList(msg.toJson)}`,
      ];
      // Carry the original attachments over. Fetched sequentially — a
      // forward has a handful at most. A per-attachment failure drops only
      // that one, but we warn the user so a forward is never silently
      // missing files.
      const attachments: OutgoingAttachment[] = [];
      let failedAttachments = 0;
      for (const a of metas) {
        try {
          attachments.push({
            filename: a.filename ?? `attachment-${a.partIndex}`,
            contentType: a.contentType,
            data: await fetchAttachmentBase64Async(msg, a.partIndex),
          });
        } catch (err) {
          failedAttachments++;
          console.warn("[haex-mail] failed to fetch attachment for forward", err);
        }
      }
      if (failedAttachments > 0) {
        toast.error(
          $i18n.t("mail.forwardAttachmentsFailed", { count: failedAttachments }),
        );
      }
      return {
        accountId: msg.accountId,
        to: "",
        subject: /^fwd?:/i.test(subject) ? subject : `Fwd: ${subject}`,
        body: `\n\n${headerLines.join("\n")}\n\n${bodyText ?? ""}`,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    }

    // reply / reply-all: quote the cached body only (stays instant, no
    // network — an empty quote is acceptable when replying).
    let text: string | undefined;
    if (haexVault.orm) {
      const cached = await haexVault.orm
        .select({ bodyText: schema.messageBodies.bodyText })
        .from(schema.messageBodies)
        .where(eq(schema.messageBodies.messageId, msg.id))
        .limit(1);
      text = cached[0]?.bodyText ?? undefined;
    }

    let body: string | undefined;
    if (text) {
      const header = $i18n.t("mail.quoteHeader", {
        date,
        sender: senderText(msg),
      });
      const quoted = text.split("\n").map((line) => `> ${line}`).join("\n");
      body = `\n\n${header}\n${quoted}`;
    }

    const to = msg.fromJson[0]?.email ?? "";

    let cc: string | undefined;
    if (mode === "reply-all") {
      const ownEmail = accountsStore.accounts
        .find((a) => a.id === msg.accountId)
        ?.email.toLowerCase();
      const seen = new Set<string>([to.toLowerCase()]);
      if (ownEmail) seen.add(ownEmail);
      const others: string[] = [];
      for (const addr of [...msg.toJson, ...msg.ccJson]) {
        const key = addr.email.toLowerCase();
        if (!addr.email || seen.has(key)) continue;
        seen.add(key);
        others.push(addr.email);
      }
      cc = others.length > 0 ? others.join(", ") : undefined;
    }

    const references = [
      ...msg.references,
      ...(msg.messageId ? [msg.messageId] : []),
    ];
    return {
      accountId: msg.accountId,
      to,
      cc,
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
      inReplyTo: msg.messageId ?? undefined,
      references: references.length > 0 ? references : undefined,
      body,
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

  /**
   * Self-heal the list indicator: the full message is authoritative about
   * whether it has attachments, whereas the envelope-derived flag can be
   * stale (cached before the field existed, or the message dropped out of
   * the refreshed "latest" window). Reconcile the DB row and the in-memory
   * list entry so the paperclip appears without a server re-fetch.
   */
  const syncHasAttachmentsAsync = async (
    messageId: string,
    hasAttachments: boolean,
  ) => {
    const row = messageList.value.find((m) => m.id === messageId);
    if (row) row.hasAttachments = hasAttachments;
    if (!haexVault.orm) return;
    await haexVault.orm
      .update(schema.messages)
      .set({ hasAttachments })
      .where(eq(schema.messages.id, messageId));
  };

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
          void syncHasAttachmentsAsync(
            message.id,
            cached[0]!.attachmentsJson.length > 0,
          );
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
      void syncHasAttachmentsAsync(message.id, msg.attachments.length > 0);
      void markSeenAsync(message, msg.envelope.flags);
    } catch (err) {
      // Callers fire-and-forget (watcher) — surface the failure here.
      console.warn("[haex-mail] failed to load message body", err);
      if (isCurrent()) toast.error(getErrorMessage(err));
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
      // Not in the visible list (e.g. folder switched while a body load
      // was in flight) — read the cached row instead; starting from []
      // would clobber the stored flags.
      let current = row?.flags;
      if (!current) {
        const cached = await haexVault.orm
          .select({ flags: schema.messages.flags })
          .from(schema.messages)
          .where(eq(schema.messages.id, id))
          .limit(1);
        if (cached.length === 0) continue;
        current = cached[0]!.flags;
      }
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
      toast.error(getErrorMessage(failed.reason));
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

/**
 * Map an IMAP mailbox name + LIST flags to a standardized role used in
 * the sidebar. The IMAP RFC 6154 SPECIAL-USE flags (\Sent, \Drafts,
 * \Trash, \Junk, \Archive) are most reliable; fall back to common
 * folder names when the server doesn't advertise them.
 */
const ROLE_LABEL_KEYS = new Set<string>(schema.MAILBOX_ROLES);

/**
 * i18n key for a standardized mailbox role's UI label (global messages,
 * see plugins/i18n-messages.ts). Null for unknown/custom folders.
 */
export function roleLabelKey(role: string | null | undefined): string | null {
  return role && ROLE_LABEL_KEYS.has(role) ? `mail.roles.${role}` : null;
}

export function inferRole(name: string, flags: string[]): schema.MailboxRole | null {
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
