import { describe, expect, it } from "vitest";
import { validateRule, RuleValidationError, type RuleDef, type RuleInput } from "../lib/rules";
import { createTools, type ToolDeps } from "./index";

const noSignal = { signal: new AbortController().signal };

/** What must never reach the agent: the secrets and the server details of an account. */
const SECRET = "geheim-7f1c-MARKER";
const HOST = "imap.hidden.example";

/**
 * Stores and a mail client that hold a secret in every place a real account does: the password item
 * id, the connection settings, the credentials of an import — plus servers and errors that carry
 * them. Every tool runs against them; nothing it answers may contain the marker or the host.
 */
const deps = (): ToolDeps => {
  const rules: RuleDef[] = [];
  const account = {
    id: "a1",
    displayName: "Privat",
    email: "me@example.org",
    passwordItemId: SECRET,
    imapHost: HOST,
    password: SECRET,
  };
  const imap = { host: HOST, port: 993, security: "tls", username: "me", password: SECRET } as const;
  const envelope = {
    uid: 9,
    flags: [],
    subject: "Rechnung",
    from: [{ name: "Anna", email: "anna@example.org" }],
    to: [],
    cc: [],
    references: [],
    hasAttachments: false,
    messageId: "draft-1@example.org",
  };
  return {
    accounts: {
      accounts: [account],
      getCredentialsCachedAsync: async () => ({ imap, smtp: null }),
      listImportableVaultAccountsAsync: async () => [
        { id: "p1", title: "Arbeit", username: "work@example.org", password: SECRET } as never,
      ],
      importAccountAsync: async (id: string) => {
        if (id === "bad") throw new Error("The entry is incomplete");
        return "a1";
      },
    },
    openAccountSetup: async () => {},
    rules: {
      rules,
      loadRulesAsync: async () => {},
      loadRuleAccountsAsync: async () => [{ id: "a1", mailboxes: [{ name: "INBOX", role: "inbox" }] }],
      saveRuleAsync: async (input: RuleInput, options = {}) => {
        const issues = validateRule(input, new Set(["a1"]));
        if (issues.length > 0) throw new RuleValidationError(issues);
        rules.push({ ...input, id: "r1", origin: options.origin ?? "user", createdAt: 1 });
        return "r1";
      },
      deleteRuleAsync: async () => {},
    },
    applyRuleToExistingAsync: async () => ({ applied: 0, limited: false }),
    mailClient: {
      listMailboxesAsync: async () => [{ name: "INBOX", flags: [], unseen: 1, exists: 2 }],
      fetchMessageAsync: async () => ({ envelope, bodyText: "Hallo", attachments: [] }),
      buildRfc822Async: async () => btoa("Message-ID: <draft-1@example.org>\r\n\r\nx"),
      appendMessageAsync: async () => {},
      fetchEnvelopesAsync: async () => [envelope],
    },
    cachedMailboxes: async () => [
      { name: "INBOX", role: "inbox", unseen: 0, exists: 0 },
      { name: "Drafts", role: "drafts", unseen: 0, exists: 0 },
      { name: "Archive", role: "archive", unseen: 0, exists: 0 },
    ],
    htmlToText: (html: string) => html,
    changes: { setFlagForUidsAsync: async () => {}, moveUidsAsync: async () => {} },
    replyPrefill: async () => ({ accountId: "a1", to: "anna@example.org", subject: "Re: Rechnung" }),
  };
};

const INPUTS: Record<string, Record<string, unknown>> = {
  list_mailboxes: {},
  get_message: { id: "a1::INBOX::9" },
  mark_messages: { ids: ["a1::INBOX::9"], read: true },
  move_messages: { ids: ["a1::INBOX::9"], to: "archive" },
  create_draft: { account: "a1", to: ["anna@example.org"], subject: "Hi", body: "Hallo" },
  import_account: { passwordItemId: "p1" },
  open_account_setup: { email: "a@b.de", imapHost: HOST, password: SECRET },
  add_rule: {
    name: "N",
    conditions: [{ field: "from", contains: "x" }],
    actions: [{ type: "markRead" }],
  },
  remove_rule: { id: "r1" },
};

describe("no tool hands a secret to the agent", () => {
  it("in an answer or in an error, for every tool", async () => {
    const tools = createTools(async () => deps());
    for (const [name, handler] of Object.entries(tools)) {
      let text: string;
      try {
        text = JSON.stringify(await handler(INPUTS[name] ?? {}, noSignal));
      } catch (err) {
        text = String(err instanceof Error ? err.message : err);
      }
      expect(text, name).not.toContain(SECRET);
      expect(text, name).not.toContain(HOST);
    }
  });

  it("not even from a failing import", async () => {
    const tools = createTools(async () => deps());
    await expect(tools.import_account!({ passwordItemId: "bad" }, noSignal)).rejects.toThrow(
      "The entry is incomplete",
    );
  });
});
