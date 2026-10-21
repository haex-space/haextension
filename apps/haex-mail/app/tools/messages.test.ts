import { describe, expect, it } from "vitest";
import type { MailSearchCriteria, MessageEnvelope } from "@haex-space/vault-sdk";
import { matchesLocally } from "../lib/messageQuery";
import type { AccountsPort } from "./context";
import { createMessageTools, type FindMessagesDeps } from "./messages";

const noSignal = { signal: new AbortController().signal };
const imap = { host: "imap.hidden.example", port: 993, security: "tls", username: "u", password: "p" } as const;

const mail = (uid: number, over: Partial<MessageEnvelope> = {}): MessageEnvelope => ({
  uid,
  flags: [],
  internalDate: 1_700_000_000 + uid * 10,
  subject: `mail ${uid}`,
  from: [{ name: "Anna", email: "anna@example.org" }],
  to: [{ email: "me@example.org" }],
  cc: [],
  references: [],
  hasAttachments: false,
  ...over,
});

interface Server {
  mailboxes: { name: string; role: string | null }[];
  messages: Record<string, MessageEnvelope[]>;
  /** Throws on a search with a text that is not ASCII, like a server without UTF-8. */
  refuseUtf8?: boolean;
  down?: boolean;
}

const fakeDeps = (servers: Record<string, Server>) => {
  const calls: { search: { mailbox: string; criteria: MailSearchCriteria; limit?: number }[]; fetched: number[][] } = {
    search: [],
    fetched: [],
  };
  const accounts: AccountsPort = {
    accounts: [
      { id: "a1", displayName: "Privat", email: "me@example.org" },
      { id: "a2", displayName: "Arbeit", email: "work@example.org" },
    ],
    getCredentialsCachedAsync: async (id) => ({ imap: { ...imap, username: id }, smtp: null }),
  };
  const deps: FindMessagesDeps = {
    accounts,
    cachedMailboxes: async (id) =>
      servers[id]!.mailboxes.map((m) => ({ ...m, unseen: null, exists: null })),
    mailClient: {
      searchMessagesAsync: async (conn, mailbox, criteria, limit) => {
        const server = servers[conn.username]!;
        if (server.down) throw new Error("connection refused");
        if (server.refuseUtf8 && JSON.stringify(criteria).match(/[\u0080-\uffff]/)) {
          throw new Error("IMAP: BAD charset");
        }
        calls.search.push({ mailbox, criteria, limit });
        const hits = (server.messages[mailbox] ?? []).filter((e) => matchesLocally(e, criteria));
        const uids = hits.map((e) => e.uid).sort((a, b) => b - a);
        return { uids: uids.slice(0, limit ?? 50), total: uids.length };
      },
      fetchEnvelopesAsync: async (conn, mailbox, range) => {
        const all = servers[conn.username]!.messages[mailbox] ?? [];
        if (range.type === "uidList") {
          calls.fetched.push(range.uids);
          return all.filter((e) => range.uids.includes(e.uid));
        }
        if (range.type === "latest") {
          return [...all].sort((a, b) => b.uid - a.uid).slice(0, range.count);
        }
        throw new Error("not used");
      },
    },
  };
  return { deps, calls };
};

const boxes = [
  { name: "INBOX", role: "inbox" },
  { name: "Archive", role: "archive" },
];

const find = async (servers: Record<string, Server>, input: Record<string, unknown>) => {
  const { deps, calls } = fakeDeps(servers);
  const tools = createMessageTools(async () => deps);
  const result = (await tools.find_messages!(input, noSignal)) as {
    messages: { id: string; subject: string; account: string; mailbox: string; unread: boolean }[];
    total: number;
    hasMore: boolean;
    window?: number;
    fallback?: string;
    note?: string;
    errors?: { account: string; error: string }[];
  };
  return { result, calls };
};

describe("find_messages", () => {
  it("finds a mail far behind the newest ones, by a word of its subject", async () => {
    const messages = [
      mail(1, { subject: "Rechnung Elektriker" }),
      ...Array.from({ length: 80 }, (_, i) => mail(i + 2, { subject: `Newsletter ${i}` })),
    ];
    const { result } = await find({ a1: { mailboxes: boxes, messages: { INBOX: messages } }, a2: { mailboxes: boxes, messages: {} } }, {
      subject: "elektriker",
    });
    expect(result.messages.map((m) => m.id)).toEqual(["a1::INBOX::1"]);
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
  });

  it("answers one page, newest first, with the total and whether more follow", async () => {
    const messages = Array.from({ length: 12 }, (_, i) => mail(i + 1));
    const { result, calls } = await find(
      { a1: { mailboxes: boxes, messages: { INBOX: messages } }, a2: { mailboxes: boxes, messages: {} } },
      { account: "a1", limit: 5, offset: 5 },
    );
    expect(result.messages.map((m) => m.id)).toEqual([7, 6, 5, 4, 3].map((n) => `a1::INBOX::${n}`));
    expect(result.total).toBe(12);
    expect(result.hasMore).toBe(true);
    expect(calls.search).toHaveLength(1);
    expect(calls.search[0]!.limit, "only the hits up to the end of the page are asked for").toBe(10);
  });

  it("merges the accounts by date and counts their hits together", async () => {
    const { result } = await find(
      {
        a1: { mailboxes: boxes, messages: { INBOX: [mail(1, { internalDate: 100 }), mail(2, { internalDate: 300 })] } },
        a2: { mailboxes: boxes, messages: { INBOX: [mail(1, { internalDate: 200 }), mail(2, { internalDate: 400 })] } },
      },
      { limit: 3 },
    );
    expect(result.messages.map((m) => m.id)).toEqual(["a2::INBOX::2", "a1::INBOX::2", "a2::INBOX::1"]);
    expect(result.total).toBe(4);
    expect(result.hasMore).toBe(true);
  });

  it("looks in the folder by role or name and skips an account that lacks it", async () => {
    const servers: Record<string, Server> = {
      a1: { mailboxes: [...boxes, { name: "Steuer", role: null }], messages: { Steuer: [mail(3)], Archive: [mail(4)] } },
      a2: { mailboxes: boxes, messages: { Archive: [mail(5)] } },
    };
    const byName = await find(servers, { mailbox: "steuer" });
    expect(byName.result.messages.map((m) => m.id)).toEqual(["a1::Steuer::3"]);
    const byRole = await find(servers, { mailbox: "archive" });
    expect(byRole.result.messages.map((m) => m.account).sort()).toEqual(["a1", "a2"]);
    const wrong = fakeDeps(servers);
    await expect(
      createMessageTools(async () => wrong.deps).find_messages!({ account: "a2", mailbox: "Steuer" }, noSignal),
    ).rejects.toThrow('no mailbox or role "Steuer"');
    await expect(
      createMessageTools(async () => wrong.deps).find_messages!({ mailbox: "Nirgends" }, noSignal),
    ).rejects.toThrow("no account has a mailbox");
  });

  it("filters by attachment on the envelopes and says it looked at a window only", async () => {
    const messages = Array.from({ length: 230 }, (_, i) => mail(i + 1, { hasAttachments: i % 2 === 0 }));
    const { result, calls } = await find(
      { a1: { mailboxes: boxes, messages: { INBOX: messages } }, a2: { mailboxes: boxes, messages: {} } },
      { hasAttachment: true, limit: 50 },
    );
    expect(calls.search[0]!.limit).toBe(200);
    expect(result.window).toBe(200);
    expect(result.total, "the hits of the newest 200 that have an attachment").toBe(100);
    expect(result.messages).toHaveLength(50);
  });

  it("sorts by sender within the window and reaches the oldest mails when ascending", async () => {
    const servers: Record<string, Server> = {
      a1: {
        mailboxes: boxes,
        messages: {
          INBOX: [
            mail(1, { from: [{ name: "Zoe", email: "z@example.org" }] }),
            mail(2, { from: [{ name: "Anna", email: "a@example.org" }] }),
            mail(3, { from: [{ name: "Bob", email: "b@example.org" }] }),
          ],
        },
      },
      a2: { mailboxes: boxes, messages: {} },
    };
    const bySender = await find(servers, { sort: "sender", descending: false });
    expect(bySender.result.messages.map((m) => m.id)).toEqual(["a1::INBOX::2", "a1::INBOX::3", "a1::INBOX::1"]);
    const oldest = await find(servers, { descending: false, limit: 2 });
    expect(oldest.result.messages.map((m) => m.id)).toEqual(["a1::INBOX::1", "a1::INBOX::2"]);
    expect(oldest.result.hasMore).toBe(true);
  });

  it("reports an unread mail as unread and a seen one as read, with the facts the agent needs", async () => {
    const { result } = await find(
      {
        a1: { mailboxes: boxes, messages: { INBOX: [mail(1, { flags: ["\\Seen"] }), mail(2)] } },
        a2: { mailboxes: boxes, messages: {} },
      },
      { unread: true },
    );
    expect(result.messages.map((m) => [m.id, m.unread])).toEqual([["a1::INBOX::2", true]]);
  });

  it("falls back to the newest envelopes when the server refuses a non-ASCII text, and says so", async () => {
    const messages = [mail(1, { subject: "Grüne Rechnung" }), mail(2, { subject: "Etwas anderes" })];
    const { result } = await find(
      { a1: { mailboxes: boxes, messages: { INBOX: messages }, refuseUtf8: true }, a2: { mailboxes: boxes, messages: {} } },
      { subject: "grüne" },
    );
    expect(result.messages.map((m) => m.id)).toEqual(["a1::INBOX::1"]);
    expect(result.fallback).toBe("local");
    expect(result.note).toContain("newest 1000");
  });

  it("keeps the answer of the accounts that work and names the one that does not", async () => {
    const { result } = await find(
      {
        a1: { mailboxes: boxes, messages: { INBOX: [mail(1)] } },
        a2: { mailboxes: boxes, messages: {}, down: true },
      },
      {},
    );
    expect(result.messages.map((m) => m.id)).toEqual(["a1::INBOX::1"]);
    expect(result.errors).toEqual([{ account: "a2", error: "connection refused" }]);

    const { deps } = fakeDeps({
      a1: { mailboxes: boxes, messages: {}, down: true },
      a2: { mailboxes: boxes, messages: {}, down: true },
    });
    await expect(createMessageTools(async () => deps).find_messages!({}, noSignal)).rejects.toThrow(
      "connection refused",
    );
  });

  it("refuses an account that does not exist and input that does not fit", async () => {
    const { deps } = fakeDeps({ a1: { mailboxes: boxes, messages: {} }, a2: { mailboxes: boxes, messages: {} } });
    const tools = createMessageTools(async () => deps);
    await expect(tools.find_messages!({ account: "nope" }, noSignal)).rejects.toThrow("no such account");
    await expect(tools.find_messages!({ limit: 500 }, noSignal)).rejects.toThrow("limit is 1 to 50");
  });
});
