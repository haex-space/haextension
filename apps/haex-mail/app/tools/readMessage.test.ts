import { describe, expect, it } from "vitest";
import type { MailMessage } from "@haex-space/vault-sdk";
import { encodeMailboxName } from "../lib/imap";
import { createReadMessageTools, MAX_TEXT, type ReadMessageDeps } from "./readMessage";

const noSignal = { signal: new AbortController().signal };

const message = (over: Partial<MailMessage> = {}, flags: string[] = []): MailMessage => ({
  envelope: {
    uid: 9,
    flags,
    internalDate: 1_767_261_600,
    subject: "Rechnung",
    from: [{ name: "Anna", email: "anna@example.org" }],
    to: [{ email: "me@example.org" }],
    cc: [],
    references: [],
    hasAttachments: true,
  },
  bodyText: "Hallo grün",
  attachments: [
    { partIndex: 2, filename: "a.pdf", contentType: "application/pdf", size: 12, isInline: false },
    { partIndex: 3, contentType: "image/png", size: 5, contentId: "x", isInline: true },
  ],
  ...over,
});

const fakeDeps = (answer: MailMessage, fetched: unknown[] = []): ReadMessageDeps => ({
  accounts: {
    accounts: [{ id: "a1", displayName: "Privat", email: "me@example.org" }],
    getCredentialsCachedAsync: async () => ({
      imap: { host: "imap.hidden.example", port: 993, security: "tls", username: "u", password: "p" },
      smtp: null,
    }),
  },
  mailClient: {
    fetchMessageAsync: async (_imap, mailbox, uid) => {
      fetched.push([mailbox, uid]);
      return answer;
    },
  },
  htmlToText: (html) => html.replace(/<[^>]+>/g, ""),
});

describe("get_message", () => {
  it("returns the text, the people, the state and the attachments that are no inline images", async () => {
    const fetched: unknown[] = [];
    const tools = createReadMessageTools(async () => fakeDeps(message(), fetched));
    const result = await tools.get_message!({ id: "a1::INBOX::9" }, noSignal);
    expect(fetched).toEqual([["INBOX", 9]]);
    expect(result).toEqual({
      id: "a1::INBOX::9",
      account: "a1",
      mailbox: "INBOX",
      from: "Anna <anna@example.org>",
      to: "me@example.org",
      cc: "",
      subject: "Rechnung",
      date: "2026-01-01T10:00:00.000Z",
      unread: true,
      flagged: false,
      text: "Hallo grün",
      truncated: false,
      attachments: [{ name: "a.pdf", type: "application/pdf", size: 12 }],
    });
  });

  it("names a folder with umlauts the way find_messages and list_mailboxes do", async () => {
    const folder = encodeMailboxName("Ärger");
    const fetched: unknown[] = [];
    const tools = createReadMessageTools(async () => fakeDeps(message(), fetched));
    const result = await tools.get_message!({ id: `a1::${folder}::9` }, noSignal);
    expect(fetched).toEqual([[folder, 9]]);
    expect(result).toMatchObject({ id: `a1::${folder}::9`, mailbox: "Ärger" });
  });

  it("reports the state from the flags", async () => {
    const tools = createReadMessageTools(async () => fakeDeps(message({}, ["\\Seen", "\\Flagged"])));
    expect(await tools.get_message!({ id: "a1::INBOX::9" }, noSignal)).toMatchObject({
      unread: false,
      flagged: true,
    });
  });

  it("takes the text from the HTML when there is no plain part", async () => {
    const tools = createReadMessageTools(async () =>
      fakeDeps(message({ bodyText: undefined, bodyHtml: "<p>Hallo <b>Welt</b></p>" })),
    );
    expect(await tools.get_message!({ id: "a1::INBOX::9" }, noSignal)).toMatchObject({ text: "Hallo Welt" });
  });

  it("cuts a long text and says so", async () => {
    const tools = createReadMessageTools(async () => fakeDeps(message({ bodyText: "x".repeat(MAX_TEXT + 50) })));
    const result = (await tools.get_message!({ id: "a1::INBOX::9" }, noSignal)) as { text: string; truncated: boolean };
    expect(result.text).toHaveLength(MAX_TEXT);
    expect(result.truncated).toBe(true);
  });

  it("gives empty fields, not errors, for a message without subject or text", async () => {
    const bare = message({ bodyText: undefined, attachments: [] });
    bare.envelope.subject = undefined;
    bare.envelope.internalDate = undefined;
    const tools = createReadMessageTools(async () => fakeDeps(bare));
    expect(await tools.get_message!({ id: "a1::INBOX::9" }, noSignal)).toMatchObject({
      subject: "",
      text: "",
      date: null,
      attachments: [],
    });
  });

  it("refuses an id that is none and an account that does not exist", async () => {
    const tools = createReadMessageTools(async () => fakeDeps(message()));
    await expect(tools.get_message!({ id: "nonsense" }, noSignal)).rejects.toThrow(/not a message id/);
    await expect(tools.get_message!({ id: "zz::INBOX::9" }, noSignal)).rejects.toThrow(/no such account/);
  });
});
