import { parsePort, type AccountPrefill } from "../lib/connection";
import { errorText, optionalString, toolError, type ToolHandlers } from "./context";

/** The most importable password items `list_accounts` names. */
const MAX_IMPORTABLE = 20;

type ConnectionSecurity = NonNullable<AccountPrefill["imapSecurity"]>;

/** What the account tools need from the stores and the app. */
export interface AccountToolDeps {
  accounts: {
    accounts: { id: string; displayName: string; email: string }[];
    listImportableVaultAccountsAsync(): Promise<
      { id: string; title?: string; username?: string }[]
    >;
    importAccountAsync(passwordItemId: string): Promise<string>;
  };
  /** Puts the details into the account form and brings the settings page up. */
  openAccountSetup(prefill: AccountPrefill): Promise<void>;
}

const presentAccount = (a: { id: string; displayName: string; email: string }) => ({
  id: a.id,
  displayName: a.displayName,
  email: a.email,
});

const security = (input: Record<string, unknown>, key: string): ConnectionSecurity | undefined => {
  const value = optionalString(input, key);
  if (value === undefined) return undefined;
  if (value === "tls" || value === "startTls") return value;
  throw toolError(`${key} is tls or startTls`);
};

const port = (input: Record<string, unknown>, key: string): number | undefined => {
  const value = input[key];
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? parsePort(String(value)) : null;
  if (parsed === null) throw toolError(`${key} is a port between 1 and 65535`);
  return parsed;
};

const host = (input: Record<string, unknown>, key: string): string | undefined => {
  const value = optionalString(input, key)?.trim();
  if (value === undefined || value === "") return undefined;
  if (/[\s/]/.test(value) || value.length > 253) throw toolError(`${key} is not a host name`);
  return value;
};

/**
 * `list_accounts`, `import_account` and `open_account_setup`. No tool takes or returns a password:
 * an account comes from a password manager entry the user already has, or the user types the
 * password into the form the agent only prepares.
 */
export const createAccountTools = (deps: () => Promise<AccountToolDeps>): ToolHandlers => ({
  list_accounts: async () => {
    const { accounts } = await deps();
    let importable: { id: string; title: string | null; username: string | null }[] = [];
    try {
      importable = (await accounts.listImportableVaultAccountsAsync())
        .slice(0, MAX_IMPORTABLE)
        .map((item) => ({ id: item.id, title: item.title ?? null, username: item.username ?? null }));
    } catch {
      // The password store may be locked or unreadable; the accounts alone are still an answer.
    }
    return { accounts: accounts.accounts.map(presentAccount), importable };
  },

  import_account: async (input) => {
    const { accounts } = await deps();
    const id = optionalString(input, "passwordItemId")?.trim();
    if (!id) throw toolError("passwordItemId is required");
    let accountId: string;
    try {
      accountId = await accounts.importAccountAsync(id);
    } catch (err) {
      throw toolError(`the account could not be imported: ${errorText(err)}`);
    }
    const account = accounts.accounts.find((a) => a.id === accountId);
    return { account: account ? presentAccount(account) : { id: accountId } };
  },

  open_account_setup: async (input) => {
    const { openAccountSetup } = await deps();
    const email = optionalString(input, "email")?.trim();
    if (email !== undefined && !/^[^\s@]+@[^\s@]+$/.test(email)) {
      throw toolError("email is not an address");
    }
    const prefill: AccountPrefill = {
      displayName: optionalString(input, "displayName")?.trim() || undefined,
      email: email || undefined,
      imapHost: host(input, "imapHost"),
      imapPort: port(input, "imapPort"),
      imapSecurity: security(input, "imapSecurity"),
      smtpHost: host(input, "smtpHost"),
      smtpPort: port(input, "smtpPort"),
      smtpSecurity: security(input, "smtpSecurity"),
    };
    await openAccountSetup(
      Object.fromEntries(Object.entries(prefill).filter(([, v]) => v !== undefined)),
    );
    return {
      prepared: true,
      hint: "The account form is ready in haex-mail with these details. The user has to open the haex-mail window and type the password into the form themselves.",
    };
  },
});
