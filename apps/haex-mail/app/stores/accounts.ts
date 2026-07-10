import { eq } from "drizzle-orm";
import * as schema from "~/database/schemas";
import type {
  ConnectionSecurity,
  ImapConfig,
  PasswordItemFull,
  SmtpConfig,
} from "@haex-space/vault-sdk";

/**
 * The tag every haex-mail password item gets — must match the
 * `passwords` permission target in the manifest.
 */
const HAEX_MAIL_TAG = "haex-mail";

/**
 * Account-with-credentials view — combines local cache (host/port) with
 * the password item fetched from the core passwords vault. Returned by
 * `loadAccountWithCredentialsAsync` for use in mail API calls.
 */
export interface AccountWithCredentials {
  account: schema.SelectAccount;
  imap: ImapConfig;
  smtp: SmtpConfig | null;
}

export const useAccountsStore = defineStore("accounts", () => {
  const haexVault = useHaexVaultStore();
  const accounts = ref<schema.SelectAccount[]>([]);
  const isLoading = ref(false);

  const loadAccountsAsync = async () => {
    if (!haexVault.orm) return;
    isLoading.value = true;
    try {
      const rows = await haexVault.orm
        .select()
        .from(schema.accounts)
        .orderBy(schema.accounts.sortOrder);
      accounts.value = rows;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Create a new account: store credentials in the core passwords
   * vault (with tag `haex-mail`), then save host/port locally with a
   * reference to the password item.
   */
  const createAccountAsync = async (input: {
    displayName: string;
    email: string;
    password: string;
    imapHost: string;
    imapPort: number;
    imapSecurity: ConnectionSecurity;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecurity?: ConnectionSecurity;
  }) => {
    if (!haexVault.orm) throw new Error("ORM not initialized");

    // 1. Create password item in core vault — tag-scoped to haex-mail.
    const passwordItemId = await haexVault.client.passwords.createAsync({
      title: input.displayName,
      username: input.email,
      password: input.password,
      tags: [HAEX_MAIL_TAG],
      keyValues: [
        { key: "imapHost", value: input.imapHost },
        { key: "imapPort", value: String(input.imapPort) },
        { key: "imapSecurity", value: input.imapSecurity },
        ...(input.smtpHost
          ? [
              { key: "smtpHost", value: input.smtpHost },
              { key: "smtpPort", value: String(input.smtpPort ?? 465) },
              { key: "smtpSecurity", value: input.smtpSecurity ?? "tls" },
            ]
          : []),
      ],
    });

    // 2. Save the local cache row referencing the password item.
    const id = crypto.randomUUID();
    await haexVault.orm.insert(schema.accounts).values({
      id,
      displayName: input.displayName,
      email: input.email,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecurity: input.imapSecurity,
      smtpHost: input.smtpHost ?? null,
      smtpPort: input.smtpPort ?? null,
      smtpSecurity: input.smtpSecurity ?? null,
      passwordItemId,
      sortOrder: accounts.value.length,
    });

    await loadAccountsAsync();
    return id;
  };

  /** keyValues managed by haex-mail on its password items. */
  const MANAGED_KEYS = [
    "imapHost",
    "imapPort",
    "imapSecurity",
    "smtpHost",
    "smtpPort",
    "smtpSecurity",
  ];

  /**
   * Update an existing account: sync the password item in the core
   * vault (empty `password` keeps the stored one), then update the
   * local cache row.
   */
  const updateAccountAsync = async (
    accountId: string,
    input: {
      displayName: string;
      email: string;
      password?: string;
      imapHost: string;
      imapPort: number;
      imapSecurity: ConnectionSecurity;
      smtpHost?: string;
      smtpPort?: number;
      smtpSecurity?: ConnectionSecurity;
    },
  ) => {
    if (!haexVault.orm) throw new Error("ORM not initialized");
    const account = accounts.value.find((a) => a.id === accountId);
    if (!account) throw new Error("Account not found");

    // 1. Update the password item — preserve the stored password when
    // none is given, plus any tags/keyValues added outside haex-mail.
    const current = await haexVault.client.passwords.readAsync(
      account.passwordItemId,
    );
    const foreignKeyValues = current.keyValues.filter(
      (kv) => !kv.key || !MANAGED_KEYS.includes(kv.key),
    );
    await haexVault.client.passwords.updateAsync(account.passwordItemId, {
      title: input.displayName,
      username: input.email,
      password: input.password || current.password,
      tags: current.tags.includes(HAEX_MAIL_TAG)
        ? current.tags
        : [...current.tags, HAEX_MAIL_TAG],
      keyValues: [
        ...foreignKeyValues.map((kv) => ({ key: kv.key, value: kv.value })),
        { key: "imapHost", value: input.imapHost },
        { key: "imapPort", value: String(input.imapPort) },
        { key: "imapSecurity", value: input.imapSecurity },
        ...(input.smtpHost
          ? [
              { key: "smtpHost", value: input.smtpHost },
              { key: "smtpPort", value: String(input.smtpPort ?? 465) },
              { key: "smtpSecurity", value: input.smtpSecurity ?? "tls" },
            ]
          : []),
      ],
    });

    // 2. Update the local cache row.
    await haexVault.orm
      .update(schema.accounts)
      .set({
        displayName: input.displayName,
        email: input.email,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        imapSecurity: input.imapSecurity,
        smtpHost: input.smtpHost ?? null,
        smtpPort: input.smtpPort ?? null,
        smtpSecurity: input.smtpSecurity ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.accounts.id, accountId));

    await loadAccountsAsync();
  };

  /**
   * Load credentials from the core vault and combine with the local
   * account row. Returns null if the password item is gone (e.g. user
   * deleted it manually in haex-vault) — the caller should treat that
   * as a broken account.
   */
  const loadAccountWithCredentialsAsync = async (
    accountId: string,
  ): Promise<AccountWithCredentials | null> => {
    const account = accounts.value.find((a) => a.id === accountId);
    if (!account) return null;

    let item: PasswordItemFull;
    try {
      item = await haexVault.client.passwords.readAsync(account.passwordItemId);
    } catch (err) {
      console.error("[haex-mail] failed to load credentials for account", account.id, err);
      return null;
    }

    if (!item.password || !item.username) {
      console.warn("[haex-mail] password item missing username/password", item.id);
      return null;
    }

    const imap: ImapConfig = {
      host: account.imapHost,
      port: account.imapPort,
      security: account.imapSecurity as ConnectionSecurity,
      username: item.username,
      password: item.password,
    };

    const smtp: SmtpConfig | null = account.smtpHost
      ? {
          host: account.smtpHost,
          port: account.smtpPort ?? 465,
          security: (account.smtpSecurity as ConnectionSecurity) ?? "tls",
          username: item.username,
          password: item.password,
        }
      : null;

    return { account, imap, smtp };
  };

  const deleteAccountAsync = async (accountId: string) => {
    if (!haexVault.orm) return;
    const account = accounts.value.find((a) => a.id === accountId);
    if (!account) return;

    // Best-effort: delete the password item, then the local row.
    try {
      await haexVault.client.passwords.deleteAsync(account.passwordItemId);
    } catch (err) {
      console.warn("[haex-mail] failed to delete password item", err);
    }

    await haexVault.orm
      .delete(schema.accounts)
      .where(eq(schema.accounts.id, accountId));
    await loadAccountsAsync();
  };

  const hasAccounts = computed(() => accounts.value.length > 0);

  return {
    accounts,
    hasAccounts,
    isLoading,
    loadAccountsAsync,
    createAccountAsync,
    updateAccountAsync,
    loadAccountWithCredentialsAsync,
    deleteAccountAsync,
  };
});
