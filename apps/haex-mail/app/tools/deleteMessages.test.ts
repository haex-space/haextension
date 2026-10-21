import { describe, expect, it } from "vitest";
import type { MessageEnvelope } from "@haex-space/vault-sdk";
import type { AccountsPort } from "./context";
import { createDeleteMessagesTools, type DeleteMessagesDeps } from "./deleteMessages";

const noSignal = { signal: new AbortController().signal };
const imap = { host: "imap.hidden.example", port: 993, security: "tls", username: "u", password: "p" } as const;

const envelope = (uid: number, subject: string | undefined): MessageEnvelope => ({
  uid,
  flags: [],
  subject,
  from: [],
  to: [],
  cc: [],
  references: [],
  hasAttachments: false,
});

const setup = (server: Record<string, MessageEnvelope[]>, refuse?: Error) => {
  const deleted: { account: string; mailbox: string; uids: number[] }[] = [];
  const accounts: AccountsPort = {
    accounts: [{ id: "a1", displayName: "Privat", email: "me@example.org" }],
    getCredentialsCachedAsync: async () => ({ imap, smtp: null }),
  };
  const deps: DeleteMessagesDeps = {
    accounts,
    mailClient: {
      fetchEnvelopesAsync: async (_conn, mailbox, range) =>
        (server[mailbox] ?? []).filter((e) => range.type === "uidList" && range.uids.includes(e.uid)),
    },
    changes: {
      deleteUidsAsync: async (account, mailbox, uids) => {
        if (refuse) throw refuse;
        deleted.push({ account, mailbox, uids });
      },
    },
  };
  return { tools: createDeleteMessagesTools(async () => deps), deleted };
};

const run = (tools: ReturnType<typeof setup>["tools"], messages: unknown[]) =>
  tools.delete_messages!({ messages }, noSignal) as Promise<{
    done: string[];
    failed: { id: string; reason: string }[];
  }>;

describe("delete_messages", () => {
  it("deletes the mails whose subject is the one the user agreed to, ignoring case and spacing", async () => {
    const { tools, deleted } = setup({ INBOX: [envelope(5, "Test  Mail"), envelope(6, "Other")] });
    const result = await run(tools, [{ id: "a1::INBOX::5", subject: " test mail " }]);
    expect(result).toEqual({ done: ["a1::INBOX::5"], failed: [] });
    expect(deleted).toEqual([{ account: "a1", mailbox: "INBOX", uids: [5] }]);
  });

  it("leaves a mail alone whose subject differs on the server, and names the real subject", async () => {
    const { tools, deleted } = setup({ INBOX: [envelope(5, "Steuerbescheid"), envelope(6, "Test")] });
    const result = await run(tools, [
      { id: "a1::INBOX::5", subject: "Test" },
      { id: "a1::INBOX::6", subject: "Test" },
    ]);
    expect(result.done).toEqual(["a1::INBOX::6"]);
    expect(result.failed).toEqual([
      { id: "a1::INBOX::5", reason: 'the subject on the server is "Steuerbescheid"; not deleted' },
    ]);
    expect(deleted).toEqual([{ account: "a1", mailbox: "INBOX", uids: [6] }]);
  });

  it("reports a mail that is gone, a mail without a subject on both sides, and input that is none", async () => {
    const { tools } = setup({ INBOX: [envelope(7, undefined)] });
    const result = await run(tools, [
      { id: "a1::INBOX::1", subject: "x" },
      { id: "a1::INBOX::7", subject: "" },
      { id: "nonsense", subject: "x" },
      { id: "a1::INBOX::8" },
    ]);
    expect(result.done).toEqual(["a1::INBOX::7"]);
    expect(result.failed.map((f) => f.id).sort()).toEqual(["a1::INBOX::1", "a1::INBOX::8", "nonsense"]);
    expect(result.failed.find((f) => f.id === "a1::INBOX::1")?.reason).toContain("not on the server");
    expect(result.failed.find((f) => f.id === "nonsense")?.reason).toContain("needs an id and the subject");
  });

  it("deletes per mailbox and leaves the mails when the host refuses", async () => {
    const { tools, deleted } = setup({ INBOX: [envelope(1, "a")], Archive: [envelope(2, "b")] });
    await run(tools, [
      { id: "a1::INBOX::1", subject: "a" },
      { id: "a1::Archive::2", subject: "b" },
    ]);
    expect(deleted.map((d) => [d.mailbox, d.uids])).toEqual([
      ["INBOX", [1]],
      ["Archive", [2]],
    ]);

    const refused = setup({ INBOX: [envelope(1, "a")] }, new Error("the server cannot UID EXPUNGE"));
    const result = await run(refused.tools, [{ id: "a1::INBOX::1", subject: "a" }]);
    expect(result.done).toEqual([]);
    expect(result.failed).toEqual([{ id: "a1::INBOX::1", reason: "the server cannot UID EXPUNGE" }]);
  });

  it("refuses an empty call and more than 100 mails", async () => {
    const { tools } = setup({});
    await expect(tools.delete_messages!({ messages: [] }, noSignal)).rejects.toThrow("names no message");
    const many = Array.from({ length: 101 }, (_, i) => ({ id: `a1::INBOX::${i + 1}`, subject: "x" }));
    await expect(tools.delete_messages!({ messages: many }, noSignal)).rejects.toThrow("at most 100");
  });
});
