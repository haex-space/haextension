import type { ImapConfig, MailMessage } from "@haex-space/vault-sdk";
import { formatAddressList } from "../lib/address";
import {
  connectionOf,
  findAccount,
  optionalString,
  parseMessageId,
  toolError,
  formatMessageId,
  type AccountsPort,
  type ToolHandlers,
} from "./context";

/** The most characters of a message text one answer carries (the answer is capped at 64 KiB). */
export const MAX_TEXT = 12_000;

export interface ReadMessageDeps {
  accounts: AccountsPort;
  mailClient: {
    fetchMessageAsync(imap: ImapConfig, mailbox: string, uid: number): Promise<MailMessage>;
  };
  /** The plain text of an HTML body (needs a DOM, so the app supplies it). */
  htmlToText(html: string): string;
}

/**
 * `get_message`: the text and attachment list of one message. The host reads with BODY.PEEK, so
 * reading never marks the message as read; that takes `mark_messages`.
 */
export const createReadMessageTools = (deps: () => Promise<ReadMessageDeps>): ToolHandlers => ({
  get_message: async (input) => {
    const { accounts, mailClient, htmlToText } = await deps();
    const id = optionalString(input, "id") ?? "";
    const parsed = parseMessageId(id);
    if (!parsed) throw toolError("id is not a message id; take it from find_messages");
    findAccount(accounts.accounts, parsed.accountId);
    const { imap } = await connectionOf(accounts, parsed.accountId);
    const message = await mailClient.fetchMessageAsync(imap, parsed.mailboxName, parsed.uid);
    const { envelope } = message;
    const text = message.bodyText ?? (message.bodyHtml ? htmlToText(message.bodyHtml) : "");
    const flags = envelope.flags.map((f) => f.toLowerCase());
    return {
      id: formatMessageId(parsed.accountId, parsed.mailboxName, envelope.uid),
      account: parsed.accountId,
      mailbox: parsed.mailboxName,
      from: formatAddressList(envelope.from),
      to: formatAddressList(envelope.to),
      cc: formatAddressList(envelope.cc),
      subject: envelope.subject ?? "",
      date: envelope.internalDate ? new Date(envelope.internalDate * 1000).toISOString() : null,
      unread: !flags.some((f) => f.includes("seen")),
      flagged: flags.some((f) => f.includes("flagged")),
      text: text.slice(0, MAX_TEXT),
      truncated: text.length > MAX_TEXT,
      attachments: message.attachments
        .filter((a) => !a.isInline)
        .map((a) => ({ name: a.filename ?? null, type: a.contentType, size: a.size })),
    };
  },
});
