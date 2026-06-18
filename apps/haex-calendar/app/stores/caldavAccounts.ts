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
   * Create a CalDAV account. The credentials always go into the core HaexVault
   * password manager (tagged `haex-calendar`); the local row only holds the
   * password-item reference.
   */
  async function createAccountAsync(data: CreateAccountData) {
    if (!haexVault.orm) return;

    const passwordItemId = await haexVault.client.passwords.createAsync({
      title: data.name,
      username: data.username,
      password: data.password,
      url: data.serverUrl,
      tags: [CALENDAR_TAG],
    });

    const id = crypto.randomUUID();
    const entry: InsertCaldavAccount = {
      id,
      name: data.name,
      serverUrl: data.serverUrl,
      username: data.username,
      passwordItemId,
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

  /**
   * Delete a CalDAV account, its calendars, and the events they hold.
   *
   * The associated password-manager item is NEVER touched by default — the
   * credential is treated as the user's, independent of this extension's
   * lifecycle. Pass `deletePasswordItem=true` only after the user has
   * explicitly confirmed they want the login removed from the password
   * manager too.
   */
  async function deleteAccountAsync(id: string, deletePasswordItem = false) {
    if (!haexVault.orm) return;

    const [account] = await haexVault.orm
      .select()
      .from(caldavAccounts)
      .where(eq(caldavAccounts.id, id))
      .limit(1);

    // Optional, opt-in: remove the credential from the password manager.
    // Run this first so a failure aborts before we touch any local data.
    if (deletePasswordItem && account?.passwordItemId) {
      await haexVault.client.passwords.deleteAsync(account.passwordItemId);
    }

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

    await loadAccountsAsync();
  }

  function getAccount(id: string) {
    return accounts.value.find((account) => account.id === id);
  }

  /** Resolve the plaintext password for an account from the password manager. */
  async function getPasswordAsync(account: SelectCaldavAccount): Promise<string> {
    if (!account.passwordItemId) return "";
    const item = await haexVault.client.passwords.readAsync(account.passwordItemId);
    return item.password ?? "";
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
