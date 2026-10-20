import { describe, expect, it } from "vitest";
import type { MessageEnvelope, OutgoingMessage } from "@haex-space/vault-sdk";
import { createDraftTools, messageIdOf, type DraftToolDeps, type ReplyPrefill } from "./drafts";

const noSignal = { signal: new AbortController().signal };

const rfc822 = (headers: string) => btoa(`${headers}\r\n\r\nbody`);

const envelope = (uid: number, subject: string, messageId?: string): MessageEnvelope => ({
  uid,
  flags: ["\\Draft"],
  subject,
  messageId,
  from: [],
  to: [],
  cc: [],
  references: [],
  hasAttachments: false,
});

const fakeDeps = (over: { prefill?: ReplyPrefill; stored?: (built: string) => MessageEnvelope[]; mailbox?: boolean } = {}) => {
  const built: OutgoingMessage[] = [];
  const appended: unknown[][] = [];
  const deps: DraftToolDeps = {
    accounts: {
      accounts: [{ id: "a1", displayName: "Privat", email: "me@example.org" }],
      getCredentialsCachedAsync: async () => ({
        imap: { host: "imap.hidden.example", port: 993, security: "tls", username: "u", password: "p" },
        smtp: null,
      }),
    },
    mailClient: {
      buildRfc822Async: async (_host, message) => {
        built.push(message);
        return rfc822("Message-ID: <draft-1@example.org>\r\nSubject: x");
      },
      appendMessageAsync: async (_imap, mailbox, data, flags) => {
        appended.push([mailbox, data, flags]);
      },
      fetchEnvelopesAsync: async () =>
        over.stored ? over.stored(appended[0]![1] as string) : [envelope(41, "other", "o@x"), envelope(42, "Hi", "draft-1@example.org")],
    },
    cachedMailboxes: async () =>
      over.mailbox === false ? [{ name: "INBOX", role: "inbox", unseen: 0, exists: 0 }] : [
        { name: "INBOX", role: "inbox", unseen: 0, exists: 0 },
        { name: "Entwürfe", role: "drafts", unseen: 0, exists: 2 },
      ],
    replyPrefill: async () =>
      over.prefill ?? {
        accountId: "a1",
        to: "anna@example.org",
        cc: "boss@example.org",
        subject: "Re: Rechnung",
        inReplyTo: "orig@example.org",
        references: ["a@x", "orig@example.org"],
        body: "\n\nAnna schrieb:\n> Hallo",
      },
  };
  return { tools: createDraftTools(async () => deps), built, appended };
};

describe("messageIdOf", () => {
  it("reads the Message-ID header without brackets and ignores one in the body", () => {
    expect(messageIdOf(rfc822("Subject: x\r\nMessage-ID: <abc@example.org>"))).toBe("abc@example.org");
    expect(messageIdOf(btoa("Subject: x\r\n\r\nMessage-ID: <in-body@x>"))).toBeNull();
    expect(messageIdOf(rfc822("Subject: x"))).toBeNull();
  });
});

describe("create_draft", () => {
  it("stores a new mail in the drafts folder as a draft and names it by its UID", async () => {
    const { tools, built, appended } = fakeDeps();
    const result = await tools.create_draft!(
      { account: "a1", to: ["Anna <anna@example.org>", "ben@example.org"], subject: "Hi", body: "Hallo" },
      noSignal,
    );
    expect(built).toEqual([
      {
        from: { email: "me@example.org", name: "Privat" },
        to: [{ name: "Anna", email: "anna@example.org" }, { email: "ben@example.org" }],
        cc: [],
        subject: "Hi",
        bodyText: "Hallo",
        inReplyTo: undefined,
        references: undefined,
      },
    ]);
    expect(appended[0]![0]).toBe("Entwürfe");
    expect(appended[0]![2]).toEqual(["\\Draft", "\\Seen"]);
    expect(result).toEqual({
      draftId: "a1::Entwürfe::42",
      to: ["anna@example.org", "ben@example.org"],
      subject: "Hi",
      body: "Hallo",
    });
  });

  it("builds a reply from the original: recipient, subject, thread and the quote under the text", async () => {
    const { tools, built } = fakeDeps();
    const result = await tools.create_draft!(
      { account: "a1", replyTo: "a1::INBOX::9", body: "Ich komme am Donnerstag." },
      noSignal,
    );
    expect(built[0]).toMatchObject({
      to: [{ email: "anna@example.org" }],
      cc: [{ email: "boss@example.org" }],
      subject: "Re: Rechnung",
      bodyText: "Ich komme am Donnerstag.\n\nAnna schrieb:\n> Hallo",
      inReplyTo: "orig@example.org",
      references: ["a@x", "orig@example.org"],
    });
    expect(result).toMatchObject({ subject: "Re: Rechnung", to: ["anna@example.org"] });
  });

  it("lets what was given override the prefill", async () => {
    const { tools, built } = fakeDeps();
    await tools.create_draft!(
      { account: "a1", replyTo: "a1::INBOX::9", to: ["carl@example.org"], cc: [], subject: "Anders", body: "x" },
      noSignal,
    );
    expect(built[0]).toMatchObject({ to: [{ email: "carl@example.org" }], cc: [], subject: "Anders" });
  });

  it("refuses an address that is none, a reply to another account, and an account without drafts folder", async () => {
    const { tools } = fakeDeps();
    await expect(tools.create_draft!({ account: "a1", to: ["not an address"], body: "x" }, noSignal)).rejects.toThrow(
      /to: not an address/,
    );
    await expect(tools.create_draft!({ account: "zz", body: "x" }, noSignal)).rejects.toThrow(/no such account/);
    await expect(
      fakeDeps({ prefill: { accountId: "a2", to: "x@y.de", subject: "Re: x" } }).tools.create_draft!(
        { account: "a1", replyTo: "a2::INBOX::1", body: "x" },
        noSignal,
      ),
    ).rejects.toThrow(/another account/);
    await expect(
      fakeDeps({ mailbox: false }).tools.create_draft!({ account: "a1", to: ["a@b.de"], body: "x" }, noSignal),
    ).rejects.toThrow(/no drafts folder/);
  });

  it("says so when the draft was stored but cannot be found again", async () => {
    const { tools } = fakeDeps({ stored: () => [envelope(1, "other", "o@x")] });
    await expect(tools.create_draft!({ account: "a1", to: ["a@b.de"], body: "x" }, noSignal)).rejects.toThrow(
      /could not be found again/,
    );
  });

  it("never sends: this file offers no tool but create_draft", () => {
    expect(Object.keys(fakeDeps().tools)).toEqual(["create_draft"]);
  });
});
