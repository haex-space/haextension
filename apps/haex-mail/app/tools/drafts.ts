import type {
  ImapConfig,
  MessageEnvelope,
  OutgoingMessage,
  MailFetchRange,
} from "@haex-space/vault-sdk";
import { parseAddressList } from "../lib/address";
import {
  connectionOf,
  findAccount,
  formatMessageId,
  optionalString,
  toolError,
  type AccountsPort,
  type ToolHandlers,
} from "./context";
import type { CachedMailbox } from "./mailboxes";

export type ReplyMode = "reply" | "reply-all" | "forward";

/** What a reply or forward is prefilled with (the compose dialog uses the same). */
export interface ReplyPrefill {
  accountId: string;
  to: string;
  cc?: string;
  subject: string;
  inReplyTo?: string;
  references?: string[];
  body?: string;
}

export interface DraftToolDeps {
  accounts: AccountsPort;
  mailClient: {
    buildRfc822Async(imapHost: string, message: OutgoingMessage): Promise<string>;
    appendMessageAsync(
      imap: ImapConfig,
      mailbox: string,
      rfc822Base64: string,
      flags?: string[],
    ): Promise<void>;
    fetchEnvelopesAsync(
      imap: ImapConfig,
      mailbox: string,
      range: MailFetchRange,
    ): Promise<MessageEnvelope[]>;
  };
  cachedMailboxes(accountId: string): Promise<CachedMailbox[]>;
  /** The prefill of a reply or forward to the message `messageId`; the app caches it if needed. */
  replyPrefill(messageId: string, mode: ReplyMode): Promise<ReplyPrefill>;
}

/** How many of the newest drafts are searched for the one just stored. */
const RECENT_DRAFTS = 20;

/** The Message-ID header (without angle brackets) of a base64 RFC 822 message, if it has one. */
export const messageIdOf = (rfc822Base64: string): string | null => {
  const text = atob(rfc822Base64);
  const headerEnd = text.search(/\r?\n\r?\n/);
  const head = headerEnd < 0 ? text : text.slice(0, headerEnd);
  return /^Message-ID:\s*<([^>\r\n]+)>/im.exec(head)?.[1] ?? null;
};

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** The valid addresses of a list of recipient texts; an invalid one is an error naming it. */
const recipients = (field: string, texts: string[]) => {
  const { addresses, invalid } = parseAddressList(texts.join(", "));
  if (invalid.length > 0) throw toolError(`${field}: not an address: ${invalid.join(", ")}`);
  return addresses;
};

/**
 * `create_draft`: stores a new mail, a reply or a forward in the account's drafts folder. It never
 * sends; `send_mail` does, after the user agreed to what the draft says. Attachments of the original
 * are not carried over.
 */
export const createDraftTools = (deps: () => Promise<DraftToolDeps>): ToolHandlers => ({
  create_draft: async (input) => {
    const { accounts, mailClient, cachedMailboxes, replyPrefill } = await deps();
    const account = findAccount(accounts.accounts, optionalString(input, "account"));
    const connection = await connectionOf(accounts, account.id);

    const replyTo = optionalString(input, "replyTo");
    const mode = (optionalString(input, "mode") ?? "reply") as ReplyMode;
    const prefill = replyTo ? await replyPrefill(replyTo, mode) : null;
    if (prefill && prefill.accountId !== account.id) {
      throw toolError("replyTo is a message of another account");
    }

    const to = input.to === undefined && prefill ? recipients("to", [prefill.to]) : recipients("to", asStrings(input.to));
    const cc = input.cc === undefined && prefill?.cc ? recipients("cc", [prefill.cc]) : recipients("cc", asStrings(input.cc));
    const subject = optionalString(input, "subject") ?? prefill?.subject ?? "";
    // The quoted original (or the forwarded one) goes under what was written.
    const bodyText = `${optionalString(input, "body") ?? ""}${prefill?.body ?? ""}`;

    const drafts = (await cachedMailboxes(account.id)).find((m) => m.role === "drafts");
    if (!drafts) throw toolError("this account has no drafts folder");

    const message: OutgoingMessage = {
      from: { email: account.email, name: account.displayName },
      to,
      cc,
      subject,
      bodyText: bodyText || undefined,
      inReplyTo: prefill?.inReplyTo,
      references: prefill?.references,
    };
    const rfc822 = await mailClient.buildRfc822Async(connection.imap.host, message);
    await mailClient.appendMessageAsync(connection.imap, drafts.name, rfc822, ["\\Draft", "\\Seen"]);

    // APPEND does not say which UID the draft got; the newest drafts tell, by Message-ID.
    const recent = await mailClient.fetchEnvelopesAsync(connection.imap, drafts.name, {
      type: "latest",
      count: RECENT_DRAFTS,
    });
    const wanted = messageIdOf(rfc822);
    const stored = wanted
      ? recent.find((e) => e.messageId === wanted)
      : [...recent].sort((a, b) => b.uid - a.uid).find((e) => (e.subject ?? "") === subject);
    if (!stored) throw toolError("the draft was stored but could not be found again");

    return {
      draftId: formatMessageId(account.id, drafts.name, stored.uid),
      // Everyone the mail goes to, cc included: `send_mail` takes exactly this list, so the consent shows it all.
      to: [...to, ...cc].map((a) => a.email),
      subject,
      body: bodyText,
    };
  },
});
