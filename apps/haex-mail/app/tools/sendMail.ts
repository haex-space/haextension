import type {
  ImapConfig,
  MailMessage,
  OutgoingMessage,
  SmtpConfig,
} from "@haex-space/vault-sdk";
import { parseAddressList } from "../lib/address";
import {
  connectionOf,
  findAccount,
  optionalString,
  parseMessageId,
  toolError,
  type AccountsPort,
  type ToolHandlers,
} from "./context";
import type { CachedMailbox } from "./mailboxes";

export interface SendMailDeps {
  accounts: AccountsPort;
  mailClient: {
    fetchMessageAsync(imap: ImapConfig, mailbox: string, uid: number): Promise<MailMessage>;
    sendMessageAsync(smtp: SmtpConfig, message: OutgoingMessage): Promise<unknown>;
    buildRfc822Async(imapHost: string, message: OutgoingMessage): Promise<string>;
    appendMessageAsync(
      imap: ImapConfig,
      mailbox: string,
      rfc822Base64: string,
      flags?: string[],
    ): Promise<void>;
  };
  cachedMailboxes(accountId: string): Promise<CachedMailbox[]>;
  changes: {
    deleteUidsAsync(accountId: string, mailboxName: string, uids: number[]): Promise<void>;
  };
  /** The plain text of an HTML body (needs a DOM, so the app supplies it). */
  htmlToText(html: string): string;
}

/** Whitespace and line endings do not make two texts differ. */
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** The most characters of a draft body an error repeats to the agent. */
const MAX_SHOWN_BODY = 1500;

const recipientsOf = (texts: unknown): string[] => {
  const list = Array.isArray(texts) ? texts.filter((t): t is string => typeof t === "string") : [];
  const { addresses, invalid } = parseAddressList(list.join(", "));
  if (invalid.length > 0) throw toolError(`to: not an address: ${invalid.join(", ")}`);
  return addresses.map((a) => a.email.toLowerCase());
};

/**
 * `send_mail`: sends a stored draft. The consent shows only the input, so the input must say what
 * the draft says (recipients, subject, text, whitespace aside); if anything differs nothing is sent
 * and the error carries the draft's values for another try. What goes out is always the draft,
 * never the input, so what the user agreed to is what is sent.
 */
export const createSendMailTools = (deps: () => Promise<SendMailDeps>): ToolHandlers => ({
  send_mail: async (input) => {
    const { accounts, mailClient, cachedMailboxes, changes, htmlToText } = await deps();
    const parsed = parseMessageId(optionalString(input, "draftId") ?? "");
    if (!parsed) throw toolError("draftId is not a message id; take it from create_draft");
    const account = findAccount(accounts.accounts, parsed.accountId);
    const { imap, smtp } = await connectionOf(accounts, account.id);
    if (!smtp) throw toolError("this account has no sending server");

    const mailboxes = await cachedMailboxes(account.id);
    const isDraft = mailboxes.some((m) => m.name === parsed.mailboxName && m.role === "drafts");
    if (!isDraft) throw toolError("draftId is not a message in a drafts folder");

    const draft = await mailClient.fetchMessageAsync(imap, parsed.mailboxName, parsed.uid);
    const { envelope } = draft;
    if (draft.attachments.some((a) => !a.isInline)) {
      throw toolError("the draft has attachments; send it from haex-mail itself");
    }
    const recipients = [...envelope.to, ...envelope.cc];
    if (recipients.length === 0) throw toolError("the draft has no recipient");
    const subject = envelope.subject ?? "";
    const body = draft.bodyText ?? (draft.bodyHtml ? htmlToText(draft.bodyHtml) : "");

    const wanted = new Set(recipientsOf(input.to));
    const actual = new Set(recipients.map((a) => a.email.toLowerCase()));
    const sameRecipients = wanted.size === actual.size && [...actual].every((e) => wanted.has(e));
    const sameSubject = squash(optionalString(input, "subject") ?? "") === squash(subject);
    const sameBody = squash(optionalString(input, "body") ?? "") === squash(body);
    if (!sameRecipients || !sameSubject || !sameBody) {
      throw new Error(
        "nothing was sent: the input differs from the draft. " +
          `Draft to: ${recipients.map((a) => a.email).join(", ")}; subject: ${subject}; ` +
          `body: ${body.slice(0, MAX_SHOWN_BODY)}${body.length > MAX_SHOWN_BODY ? " …" : ""}`,
      );
    }

    // A bcc of the draft is not in what the server shows of it, so it is not sent to.
    const message: OutgoingMessage = {
      from: { email: account.email, name: account.displayName },
      to: envelope.to,
      cc: envelope.cc,
      subject,
      bodyText: body || undefined,
      inReplyTo: envelope.inReplyTo,
      references: envelope.references.length > 0 ? envelope.references : undefined,
    };
    // A failing send throws here and leaves the draft where it is.
    await mailClient.sendMessageAsync(smtp, message);

    // The mail is gone; what follows tidies up, and a failure of it is reported, not thrown.
    let copySaved = false;
    const sent = mailboxes.find((m) => m.role === "sent");
    if (sent) {
      try {
        const rfc822 = await mailClient.buildRfc822Async(imap.host, message);
        await mailClient.appendMessageAsync(imap, sent.name, rfc822, ["\\Seen"]);
        copySaved = true;
      } catch {
        copySaved = false;
      }
    }
    let draftRemoved = false;
    try {
      await changes.deleteUidsAsync(account.id, parsed.mailboxName, [parsed.uid]);
      draftRemoved = true;
    } catch {
      draftRemoved = false;
    }
    return { sent: true, to: recipients.map((a) => a.email), subject, copySaved, draftRemoved };
  },
});
