import { eq } from "drizzle-orm";
import * as schema from "~/database/schemas";
import {
  RuleValidationError,
  validateRule,
  type RuleAccount,
  type RuleDef,
  type RuleInput,
} from "~/lib/rules";

const toRuleDef = (row: schema.SelectRule): RuleDef => ({
  id: row.id,
  name: row.name,
  accountId: row.accountId,
  enabled: row.enabled,
  conditions: row.conditionsJson,
  actions: row.actionsJson,
  origin: row.origin,
  createdAt: row.createdAt?.getTime() ?? 0,
});

/**
 * Mail rules (spec 019): reads and writes the `rules` table for the settings page and the agent
 * tools. What a rule means — checks, matching, planning — lives in `lib/rules.ts`.
 */
export const useRulesStore = defineStore("rules", () => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const rules = ref<RuleDef[]>([]);

  const loadRulesAsync = async () => {
    if (!haexVault.orm) return;
    const rows = await haexVault.orm
      .select()
      .from(schema.rules)
      .orderBy(schema.rules.createdAt, schema.rules.id);
    rules.value = rows.map(toRuleDef);
  };

  /** The mailboxes of every account, for "is the target still there" and for resolving a move. */
  const loadRuleAccountsAsync = async (): Promise<RuleAccount[]> => {
    if (!haexVault.orm) return [];
    const rows = await haexVault.orm.select().from(schema.mailboxes);
    return accountsStore.accounts.map((account) => ({
      id: account.id,
      mailboxes: rows
        .filter((m) => m.accountId === account.id)
        .map((m) => ({ name: m.name, role: m.role as schema.MailboxRole | null })),
    }));
  };

  /**
   * Creates a rule, or changes the one named by `id` (its origin stays). A rule that fails
   * `validateRule` is refused with a `RuleValidationError`.
   */
  const saveRuleAsync = async (
    input: RuleInput,
    { id, origin = "user" }: { id?: string; origin?: "user" | "agent" } = {},
  ): Promise<string> => {
    if (!haexVault.orm) throw new Error("ORM not initialized");
    const issues = validateRule(input, new Set(accountsStore.accounts.map((a) => a.id)));
    if (issues.length > 0) throw new RuleValidationError(issues);
    const values = {
      name: input.name.trim(),
      accountId: input.accountId,
      enabled: input.enabled,
      conditionsJson: input.conditions.map((c) =>
        c.field === "attachment" ? c : { ...c, contains: c.contains.trim() },
      ),
      actionsJson: input.actions.map((a) =>
        "mailbox" in a ? { ...a, mailbox: a.mailbox.trim() } : a,
      ),
    };
    if (id) {
      // A rule can be gone (removed by a sync, or by the agent) while its dialog is open.
      const existing = await haexVault.orm
        .select({ id: schema.rules.id })
        .from(schema.rules)
        .where(eq(schema.rules.id, id))
        .limit(1);
      if (existing.length === 0) throw new Error("The rule no longer exists");
      await haexVault.orm.update(schema.rules).set(values).where(eq(schema.rules.id, id));
    } else {
      id = crypto.randomUUID();
      await haexVault.orm.insert(schema.rules).values({ id, origin, ...values });
    }
    await loadRulesAsync();
    return id;
  };

  const setEnabledAsync = async (id: string, enabled: boolean) => {
    if (!haexVault.orm) return;
    await haexVault.orm.update(schema.rules).set({ enabled }).where(eq(schema.rules.id, id));
    await loadRulesAsync();
  };

  const deleteRuleAsync = async (id: string) => {
    if (!haexVault.orm) return;
    await haexVault.orm.delete(schema.rules).where(eq(schema.rules.id, id));
    await loadRulesAsync();
  };

  /** The rules of an account that is being removed go with it. */
  const deleteRulesOfAccountAsync = async (accountId: string) => {
    if (!haexVault.orm) return;
    await haexVault.orm.delete(schema.rules).where(eq(schema.rules.accountId, accountId));
    await loadRulesAsync();
  };

  return {
    rules,
    loadRulesAsync,
    loadRuleAccountsAsync,
    saveRuleAsync,
    setEnabledAsync,
    deleteRuleAsync,
    deleteRulesOfAccountAsync,
  };
});
