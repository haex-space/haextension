import { eq } from "drizzle-orm";
import { caldavAccounts, calendars, events, type InsertCaldavAccount, type SelectCaldavAccount } from "~/database/schemas";

export const useCaldavAccountsStore = defineStore("caldavAccounts", () => {
  const haexVault = useHaexVaultStore();

  const accounts = ref<SelectCaldavAccount[]>([]);

  async function loadAccountsAsync() {
    if (!haexVault.orm) return;
    accounts.value = await haexVault.orm.select().from(caldavAccounts);
  }

  async function createAccountAsync(data: Omit<InsertCaldavAccount, "id" | "createdAt" | "updatedAt">) {
    if (!haexVault.orm) return;
    const id = crypto.randomUUID();
    await haexVault.orm.insert(caldavAccounts).values({ ...data, id });
    await loadAccountsAsync();
    return id;
  }

  async function updateAccountAsync(id: string, data: Partial<Omit<InsertCaldavAccount, "id">>) {
    if (!haexVault.orm) return;
    await haexVault.orm.update(caldavAccounts).set(data).where(eq(caldavAccounts.id, id));
    await loadAccountsAsync();
  }

  async function deleteAccountAsync(id: string) {
    if (!haexVault.orm) return;

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

  return {
    accounts,
    loadAccountsAsync,
    createAccountAsync,
    updateAccountAsync,
    deleteAccountAsync,
    getAccount,
  };
});
