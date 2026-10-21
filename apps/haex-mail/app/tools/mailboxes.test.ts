import { describe, expect, it } from "vitest";
import type { MailboxInfo } from "@haex-space/vault-sdk";
import type { AccountsPort } from "./context";
import { createMailboxTools, type MailboxToolDeps } from "./mailboxes";

const refreshed: string[] = [];
const noSignal = { signal: new AbortController().signal };
const imap = { host: "imap.hidden.example", port: 993, security: "tls", username: "u", password: "p" } as const;

const box = (name: string, flags: string[], unseen: number, exists: number): MailboxInfo => ({
  name,
  flags,
  unseen,
  exists,
});

const fakeDeps = (
  servers: Record<string, MailboxInfo[] | Error>,
  cached: Record<string, { name: string; role: string | null; unseen: number; exists: number }[]> = {},
  created: { account: string; name: string }[] = [],
): MailboxToolDeps => {
  const accounts: AccountsPort = {
    accounts: [
      { id: "a1", displayName: "Privat", email: "me@example.org" },
      { id: "a2", displayName: "Arbeit", email: "work@example.org" },
    ],
    getCredentialsCachedAsync: async (id) => ({ imap: { ...imap, username: id }, smtp: null }),
  };
  return {
    accounts,
    mailClient: {
      listMailboxesAsync: async (conn) => {
        const answer = servers[conn.username]!;
        if (answer instanceof Error) throw answer;
        return answer;
      },
      createMailboxAsync: async (conn, name) => {
        const exists = created.some((c) => c.account === conn.username && c.name === name);
        created.push({ account: conn.username, name });
        return !exists;
      },
    },
    cachedMailboxes: async (id) => cached[id] ?? [],
    refreshMailboxes: async (id) => {
      refreshed.push(id);
    },
  };
};

describe("list_mailboxes", () => {
  it("names the folders of every account with role, unread and total, as the server says now", async () => {
    const tools = createMailboxTools(async () =>
      fakeDeps({
        a1: [box("INBOX", [], 3, 40), box("Sent", ["\\Sent"], 0, 12), box("[Gmail]", ["\\Noselect"], 0, 0)],
        a2: [box("INBOX", [], 5, 9), box("Entw&APw-rfe", ["\\Drafts"], 0, 1)],
      }),
    );
    const result = (await tools.list_mailboxes!({}, noSignal)) as { mailboxes: Record<string, unknown>[] };
    expect(result).toEqual({
      mailboxes: [
        { account: "a1", name: "INBOX", role: "inbox", unseen: 3, total: 40 },
        { account: "a1", name: "Sent", role: "sent", unseen: 0, total: 12 },
        { account: "a2", name: "INBOX", role: "inbox", unseen: 5, total: 9 },
        { account: "a2", name: "Entwürfe", role: "drafts", unseen: 0, total: 1 },
      ],
    });
  });

  it("narrows to one account and refuses one that does not exist", async () => {
    const tools = createMailboxTools(async () =>
      fakeDeps({ a1: [box("INBOX", [], 1, 2)], a2: [box("INBOX", [], 7, 8)] }),
    );
    const only = (await tools.list_mailboxes!({ account: "a2" }, noSignal)) as { mailboxes: { account: string }[] };
    expect(only.mailboxes.map((m) => m.account)).toEqual(["a2"]);
    await expect(tools.list_mailboxes!({ account: "nope" }, noSignal)).rejects.toThrow(/no such account/);
  });

  it("answers an unreachable account from the cache and says so, without touching the others", async () => {
    const tools = createMailboxTools(async () =>
      fakeDeps(
        { a1: new Error("could not connect to the server"), a2: [box("INBOX", [], 5, 9)] },
        { a1: [{ name: "INBOX", role: "inbox", unseen: 2, exists: 30 }] },
      ),
    );
    const result = await tools.list_mailboxes!({}, noSignal);
    expect(result).toEqual({
      mailboxes: [
        { account: "a1", name: "INBOX", role: "inbox", unseen: 2, total: 30, cached: true },
        { account: "a2", name: "INBOX", role: "inbox", unseen: 5, total: 9 },
      ],
      errors: [{ account: "a1", error: "could not connect to the server" }],
    });
  });

  it("never names the server", async () => {
    const tools = createMailboxTools(async () =>
      fakeDeps({ a1: [box("INBOX", [], 1, 1)], a2: new Error("IMAP: no") }),
    );
    expect(JSON.stringify(await tools.list_mailboxes!({}, noSignal))).not.toContain("hidden.example");
  });
});

describe("create_mailbox", () => {
  it("creates a folder, sends the server its encoded name and refreshes the cached list", async () => {
    refreshed.length = 0;
    const created: { account: string; name: string }[] = [];
    const tools = createMailboxTools(async () => fakeDeps({}, {}, created));
    expect(await tools.create_mailbox!({ account: "a1", name: " Überweisungen " }, noSignal)).toEqual({
      created: true,
      name: "Überweisungen",
    });
    expect(created).toEqual([{ account: "a1", name: "&ANw-berweisungen" }]);
    expect(refreshed).toEqual(["a1"]);
  });

  it("says created: false for a folder that was there, without an error", async () => {
    const tools = createMailboxTools(async () => fakeDeps({}, {}, [{ account: "a1", name: "Steuer" }]));
    expect(await tools.create_mailbox!({ account: "a1", name: "Steuer" }, noSignal)).toEqual({
      created: false,
      name: "Steuer",
    });
  });

  it("refuses an unknown account and a blank name", async () => {
    const tools = createMailboxTools(async () => fakeDeps({}));
    await expect(tools.create_mailbox!({ account: "nope", name: "X" }, noSignal)).rejects.toThrow("no such account");
    await expect(tools.create_mailbox!({ account: "a1", name: "  " }, noSignal)).rejects.toThrow("name is");
  });
});
