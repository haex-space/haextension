import { eq } from "drizzle-orm";
import { toast } from "vue-sonner";
import * as schema from "~/database/schemas";
import { getErrorMessage } from "~/lib/utils";
import type { MailMessage } from "@haex-space/vault-sdk";
import type { Ref } from "vue";
import type { MailSync } from "./sync";

interface MessageBodyState {
  selectedMessageId: Ref<string | null>;
  messageList: Ref<schema.SelectMessage[]>;
  messageBody: Ref<MailMessage | null>;
  isLoadingMessage: Ref<boolean>;
}

/**
 * The open message: body loading (cache first, then IMAP), \Seen marking
 * and mirroring flag changes into the cached rows.
 */
export const useMessageBody = (
  state: MessageBodyState,
  sync: Pick<MailSync, "refreshMailboxStatusAsync">,
) => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const { $i18n } = useNuxtApp();
  const { selectedMessageId, messageList, messageBody, isLoadingMessage } = state;
  const { refreshMailboxStatusAsync } = sync;

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
      return;
    }
    await refreshMailboxStatusAsync(message.accountId, [message.mailboxName]);
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
    try {
      await haexVault.orm
        .update(schema.messages)
        .set({ hasAttachments })
        .where(eq(schema.messages.id, messageId));
    } catch (err) {
      console.warn("[haex-mail] failed to sync hasAttachments", err);
    }
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

  return {
    persistMessageBodyAsync,
    loadMessageBodyAsync,
    updateLocalFlagsAsync,
  };
};
