import { eq } from "drizzle-orm";
import { caldavAccounts, calendars, events, type InsertCaldavAccount, type SelectCaldavAccount } from "~/database/schemas";

/** Tag scoping all haex-calendar credentials in the core password manager. */
const CALENDAR_TAG = "haex-calendar";

/** Data needed to connect an account — `password` is the plaintext secret. */
export interface CreateAccountData {
  name: string;
  serverUrl: string;
  username: string;
  password: string;
  /** When true, the secret is added to the core password manager; otherwise
   *  it is kept only in this extension's own DB. */
  storeInManager: boolean;
  principalUrl?: string | null;
  calendarHomeUrl?: string | null;
}

export const useCaldavAccountsStore = defineStore("caldavAccounts", () => {
  const haexVault = useHaexVaultStore();

  const accounts = ref<SelectCaldavAccount[]>([]);

  async function loadAccountsAsync() {
    if (!haexVault.orm) return;
    accounts.value = await haexVault.orm.select().from(caldavAccounts);
  }

  /**
   * Create an account. Depending on `data.storeInManager`, the secret is
   * either added to the core password manager (only its item id is kept
   * locally) or stored in this extension's own DB.
   */
  async function createAccountAsync(data: CreateAccountData) {
    if (!haexVault.orm) return;

    let passwordItemId: string | null = null;
    let password: string | null = null;

    if (data.storeInManager) {
      passwordItemId = await haexVault.client.passwords.createAsync({
        title: data.name,
        username: data.username,
        password: data.password,
        url: data.serverUrl,
        tags: [CALENDAR_TAG],
      });
    } else {
      password = data.password;
    }

    const id = crypto.randomUUID();
    const entry: InsertCaldavAccount = {
      id,
      name: data.name,
      serverUrl: data.serverUrl,
      username: data.username,
      passwordItemId,
      password,
      principalUrl: data.principalUrl ?? null,
      calendarHomeUrl: data.calendarHomeUrl ?? null,
    };
    await haexVault.orm.insert(caldavAccounts).values(entry);
    await loadAccountsAsync();
    return id;
  }

  async function updateAccountAsync(id: string, data: Partial<Omit<InsertCaldavAccount, "id" | "passwordItemId">>) {
    if (!haexVault.orm) return;
    await haexVault.orm.update(caldavAccounts).set(data).where(eq(caldavAccounts.id, id));
    await loadAccountsAsync();
  }

  async function deleteAccountAsync(id: string) {
    if (!haexVault.orm) return;

    const [account] = await haexVault.orm
      .select()
      .from(caldavAccounts)
      .where(eq(caldavAccounts.id, id))
      .limit(1);

    // First delete all events belonging to calendars of this account
    const accountCalendars = await haexVault.orm
      .select({ id: calendars.id })
      .from(calendars)
      .where(eq(calendars.caldavAccountId, id));

    for (const cal of accountCalendars) {
      await haexVault.orm.delete(events).where(eq(events.calendarId, cal.id));
    }

    // Delete calendars belonging to this account
    await haexVault.orm.delete(calendars).where(eq(calendars.caldavAccountId, id));

    // Delete the account itself
    await haexVault.orm.delete(caldavAccounts).where(eq(caldavAccounts.id, id));

    // Remove the credential from the password manager
    if (account?.passwordItemId) {
      await haexVault.client.passwords.deleteAsync(account.passwordItemId);
    }

    await loadAccountsAsync();
  }

  function getAccount(id: string) {
    return accounts.value.find((account) => account.id === id);
  }

  /**
   * Resolve the plaintext password for an account, from whichever store holds
   * it (password manager item or the extension's own DB column).
   */
  async function getPasswordAsync(account: SelectCaldavAccount): Promise<string> {
    if (account.passwordItemId) {
      const item = await haexVault.client.passwords.readAsync(account.passwordItemId);
      return item.password ?? "";
    }
    return account.password ?? "";
  }

  return {
    accounts,
    loadAccountsAsync,
    createAccountAsync,
    updateAccountAsync,
    deleteAccountAsync,
    getAccount,
    getPasswordAsync,
  };
});
