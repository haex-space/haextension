import { describe, expect, it } from "vitest";
import type { MailMessage, OutgoingMessage } from "@haex-space/vault-sdk";
import { createSendMailTools, type SendMailDeps } from "./sendMail";

const noSignal = { signal: new AbortController().signal };
const imap = { host: "imap.hidden.example", port: 993, security: "tls", username: "u", password: "p" } as const;
const smtp = { host: "smtp.hidden.example", port: 465, security: "tls", username: "u", password: "p" } as const;

const draftMessage = (over: Partial<MailMessage["envelope"]> = {}, rest: Partial<MailMessage> = {}): MailMessage => ({
  envelope: {
    uid: 42,
    flags: ["\\Draft"],
    subject: "Re: Rechnung",
    from: [],
    to: [{ email: "anna@example.org" }],
    cc: [{ email: "boss@example.org" }],
    inReplyTo: "orig@example.org",
    references: ["orig@example.org"],
    hasAttachments: false,
    ...over,
  },
  bodyText: "Ich komme am Donnerstag.\r\n\r\nAnna schrieb:\r\n> Hallo",
  attachments: [],
  ...rest,
});

const setup = (
  over: { draft?: MailMessage; smtp?: boolean; sendFails?: boolean; appendFails?: boolean; deleteFails?: boolean; sent?: boolean } = {},
) => {
  const sentMessages: OutgoingMessage[] = [];
  const appended: { mailbox: string; flags?: string[] }[] = [];
  const deleted: { mailbox: string; uids: number[] }[] = [];
  const deps: SendMailDeps = {
    accounts: {
      accounts: [{ id: "a1", displayName: "Privat", email: "me@example.org" }],
      getCredentialsCachedAsync: async () => ({ imap, smtp: over.smtp === false ? null : smtp }),
    },
    mailClient: {
      fetchMessageAsync: async () => over.draft ?? draftMessage(),
      sendMessageAsync: async (_smtp, message) => {
        if (over.sendFails) throw new Error("smtp refused");
        sentMessages.push(message);
      },
      buildRfc822Async: async () => "cmZjODIy",
      appendMessageAsync: async (_imap, mailbox, _data, flags) => {
        if (over.appendFails) throw new Error("append refused");
        appended.push({ mailbox, flags });
      },
    },
    cachedMailboxes: async () => [
      { name: "INBOX", role: "inbox", unseen: 0, exists: 0 },
      { name: "Entwürfe", role: "drafts", unseen: 0, exists: 1 },
      ...(over.sent === false ? [] : [{ name: "Gesendet", role: "sent", unseen: 0, exists: 5 }]),
    ],
    changes: {
      deleteUidsAsync: async (_account, mailbox, uids) => {
        if (over.deleteFails) throw new Error("expunge refused");
        deleted.push({ mailbox, uids });
      },
    },
    htmlToText: (html) => html.replace(/<[^>]+>/g, ""),
  };
  return { tools: createSendMailTools(async () => deps), sentMessages, appended, deleted };
};

const input = {
  draftId: "a1::Entwürfe::42",
  to: ["Anna <anna@example.org>", "boss@example.org"],
  subject: "Re: Rechnung",
  body: "Ich komme am Donnerstag.\n\nAnna schrieb:\n> Hallo",
};

describe("send_mail", () => {
  it("sends the draft that the input describes, stores a copy in Sent and removes the draft", async () => {
    const { tools, sentMessages, appended, deleted } = setup();
    const result = await tools.send_mail!(input, noSignal);
    expect(result).toEqual({
      sent: true,
      to: ["anna@example.org", "boss@example.org"],
      subject: "Re: Rechnung",
      copySaved: true,
      draftRemoved: true,
    });
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({
      from: { email: "me@example.org", name: "Privat" },
      to: [{ email: "anna@example.org" }],
      cc: [{ email: "boss@example.org" }],
      subject: "Re: Rechnung",
      inReplyTo: "orig@example.org",
    });
    expect(appended).toEqual([{ mailbox: "Gesendet", flags: ["\\Seen"] }]);
    expect(deleted).toEqual([{ mailbox: "Entwürfe", uids: [42] }]);
  });

  it("ignores whitespace, line endings and the case of addresses when it compares", async () => {
    const { tools, sentMessages } = setup();
    await tools.send_mail!(
      { ...input, to: ["ANNA@example.org", " boss@example.org "], subject: "Re:  Rechnung ", body: `${input.body}\n\n` },
      noSignal,
    );
    expect(sentMessages).toHaveLength(1);
  });

  it("sends nothing and answers with the draft's values when recipients, subject or text differ", async () => {
    for (const changed of [
      { to: ["anna@example.org"] },
      { to: [...input.to, "evil@example.org"] },
      { subject: "Re: Etwas anderes" },
      { body: "Ich komme am Freitag." },
    ]) {
      const { tools, sentMessages, deleted } = setup();
      await expect(tools.send_mail!({ ...input, ...changed }, noSignal)).rejects.toThrow(
        /nothing was sent.*Draft to: anna@example.org, boss@example.org; subject: Re: Rechnung; body: Ich komme am Donnerstag/s,
      );
      expect(sentMessages).toEqual([]);
      expect(deleted).toEqual([]);
    }
  });

  it("sends the draft, not the input, even when the two differ only in spacing", async () => {
    const { tools, sentMessages } = setup({ draft: draftMessage({ subject: "Re:   Rechnung" }) });
    await tools.send_mail!({ ...input, subject: "Re: Rechnung" }, noSignal);
    expect(sentMessages[0]!.subject).toBe("Re:   Rechnung");
  });

  it("keeps the draft when the send fails", async () => {
    const { tools, deleted, appended } = setup({ sendFails: true });
    await expect(tools.send_mail!(input, noSignal)).rejects.toThrow("smtp refused");
    expect(deleted).toEqual([]);
    expect(appended).toEqual([]);
  });

  it("reports, and does not throw, when the copy or the removal of the draft fails after the send", async () => {
    const { tools, sentMessages } = setup({ appendFails: true, deleteFails: true });
    expect(await tools.send_mail!(input, noSignal)).toMatchObject({ sent: true, copySaved: false, draftRemoved: false });
    expect(sentMessages).toHaveLength(1);
    const noSentFolder = setup({ sent: false });
    expect(await noSentFolder.tools.send_mail!(input, noSignal)).toMatchObject({ sent: true, copySaved: false });
  });

  it("refuses what is no draft, a draft with attachments, no recipient and an account that cannot send", async () => {
    const notDraft = setup();
    await expect(notDraft.tools.send_mail!({ ...input, draftId: "a1::INBOX::42" }, noSignal)).rejects.toThrow(
      "not a message in a drafts folder",
    );
    await expect(notDraft.tools.send_mail!({ ...input, draftId: "nonsense" }, noSignal)).rejects.toThrow(
      "not a message id",
    );
    const withAttachment = setup({
      draft: draftMessage({}, { attachments: [{ partIndex: 2, filename: "a.pdf", contentType: "application/pdf", size: 5, isInline: false }] }),
    });
    await expect(withAttachment.tools.send_mail!(input, noSignal)).rejects.toThrow("has attachments");
    const nobody = setup({ draft: draftMessage({ to: [], cc: [] }) });
    await expect(nobody.tools.send_mail!(input, noSignal)).rejects.toThrow("no recipient");
    const noSmtp = setup({ smtp: false });
    await expect(noSmtp.tools.send_mail!(input, noSignal)).rejects.toThrow("no sending server");
    for (const s of [notDraft, withAttachment, nobody, noSmtp]) expect(s.sentMessages).toEqual([]);
  });

  it("reads the text of an HTML-only draft", async () => {
    const { tools, sentMessages } = setup({ draft: draftMessage({}, { bodyText: undefined, bodyHtml: "<p>Hallo Anna</p>" }) });
    await tools.send_mail!({ ...input, body: "Hallo Anna" }, noSignal);
    expect(sentMessages[0]!.bodyText).toBe("Hallo Anna");
  });
});
