import { eq } from "drizzle-orm";
import { toast } from "vue-sonner";
import * as schema from "~/database/schemas";
import { senderText } from "~/lib/mail";
import type { MailMessage, OutgoingAttachment } from "@haex-space/vault-sdk";

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

/** Compose prefill (reply / reply-all / forward) and attachment bytes. */
export const useReplyBuilder = (
  persistMessageBodyAsync: (messageId: string, msg: MailMessage) => Promise<void>,
) => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const { $i18n } = useNuxtApp();

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

  return {
    buildReplyContextAsync,
    fetchAttachmentBase64Async,
  };
};
