import { describe, expect, it } from "vitest";
import type { AccountPrefill } from "../lib/connection";
import { createAccountTools, type AccountToolDeps } from "./accounts";

const noSignal = { signal: new AbortController().signal };

const fakeDeps = (over: Partial<AccountToolDeps["accounts"]> = {}) => {
  const prefills: AccountPrefill[] = [];
  const accounts: AccountToolDeps["accounts"]["accounts"] = [
    { id: "a1", displayName: "Privat", email: "me@example.org" },
  ];
  const deps: AccountToolDeps = {
    accounts: {
      accounts,
      listImportableVaultAccountsAsync: async () => [
        { id: "p1", title: "Arbeit", username: "work@example.org" },
        { id: "p2" },
      ],
      importAccountAsync: async () => {
        accounts.push({ id: "a2", displayName: "Arbeit", email: "work@example.org" });
        return "a2";
      },
      ...over,
    },
    openAccountSetup: async (prefill) => {
      prefills.push(prefill);
    },
  };
  return { tools: createAccountTools(async () => deps), prefills, accounts };
};

describe("list_accounts", () => {
  it("names the accounts and the password entries that could become one, and no secret", async () => {
    const { tools } = fakeDeps();
    const result = await tools.list_accounts!({}, noSignal);
    expect(result).toEqual({
      accounts: [{ id: "a1", displayName: "Privat", email: "me@example.org" }],
      importable: [
        { id: "p1", title: "Arbeit", username: "work@example.org" },
        { id: "p2", title: null, username: null },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/password|passwordItemId|imapHost/i);
  });

  it("names at most 20 importable entries", async () => {
    const { tools } = fakeDeps({
      listImportableVaultAccountsAsync: async () =>
        Array.from({ length: 30 }, (_, i) => ({ id: `p${i}` })),
    });
    const { importable } = (await tools.list_accounts!({}, noSignal)) as { importable: unknown[] };
    expect(importable).toHaveLength(20);
  });

  it("still answers with the accounts when the password store cannot be read", async () => {
    const { tools } = fakeDeps({
      listImportableVaultAccountsAsync: async () => {
        throw new Error("locked");
      },
    });
    expect(await tools.list_accounts!({}, noSignal)).toEqual({
      accounts: [{ id: "a1", displayName: "Privat", email: "me@example.org" }],
      importable: [],
    });
  });
});

describe("import_account", () => {
  it("imports the entry and returns the new account only", async () => {
    const { tools } = fakeDeps();
    const result = await tools.import_account!({ passwordItemId: "p1" }, noSignal);
    expect(result).toEqual({
      account: { id: "a2", displayName: "Arbeit", email: "work@example.org" },
    });
  });

  it("refuses an entry the account store refuses, with its reason", async () => {
    const { tools } = fakeDeps({
      importAccountAsync: async () => {
        throw new Error("The entry has no IMAP settings");
      },
    });
    await expect(tools.import_account!({ passwordItemId: "p9" }, noSignal)).rejects.toThrow(
      /could not be imported: The entry has no IMAP settings/,
    );
  });

  it("needs an entry id", async () => {
    await expect(fakeDeps().tools.import_account!({ passwordItemId: " " }, noSignal)).rejects.toThrow(
      /passwordItemId is required/,
    );
  });
});

describe("open_account_setup", () => {
  it("hands the details to the form and tells the agent the user must finish it", async () => {
    const { tools, prefills } = fakeDeps();
    const result = (await tools.open_account_setup!(
      {
        email: " anna@example.org ",
        displayName: "Anna",
        imapHost: "imap.example.org",
        imapPort: 993,
        imapSecurity: "tls",
        smtpHost: "smtp.example.org",
        smtpPort: 587,
        smtpSecurity: "startTls",
      },
      noSignal,
    )) as { prepared: boolean; hint: string };
    expect(prefills).toEqual([
      {
        displayName: "Anna",
        email: "anna@example.org",
        imapHost: "imap.example.org",
        imapPort: 993,
        imapSecurity: "tls",
        smtpHost: "smtp.example.org",
        smtpPort: 587,
        smtpSecurity: "startTls",
      },
    ]);
    expect(result.prepared).toBe(true);
    expect(result.hint).toMatch(/type the password/);
  });

  it("opens the form without any detail", async () => {
    const { tools, prefills } = fakeDeps();
    await tools.open_account_setup!({}, noSignal);
    expect(prefills).toEqual([{}]);
  });

  it("refuses details that are no address, host, port or security", async () => {
    const { tools, prefills } = fakeDeps();
    const open = (input: Record<string, unknown>) => tools.open_account_setup!(input, noSignal);
    await expect(open({ email: "not an address" })).rejects.toThrow(/email/);
    await expect(open({ imapHost: "imap.example.org/evil" })).rejects.toThrow(/imapHost/);
    await expect(open({ imapPort: 0 })).rejects.toThrow(/imapPort/);
    await expect(open({ smtpPort: 70000 })).rejects.toThrow(/smtpPort/);
    await expect(open({ smtpSecurity: "none" })).rejects.toThrow(/smtpSecurity/);
    expect(prefills).toEqual([]);
  });

  it("has no way to pass a password on", async () => {
    const { tools, prefills } = fakeDeps();
    await tools.open_account_setup!({ email: "a@b.de", password: "geheim-7f1c" }, noSignal);
    expect(JSON.stringify(prefills)).not.toContain("geheim-7f1c");
  });
});
