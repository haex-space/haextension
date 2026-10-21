import {
  RuleValidationError,
  ruleTargetMissingKnown,
  type RuleAccount,
  type RuleAction,
  type RuleCondition,
  type RuleDef,
  type RuleInput,
} from "../lib/rules";
import {
  errorText,
  isMailboxRole,
  optionalString,
  resolveMailbox,
  toolError,
  type ToolHandlers,
} from "./context";

/** What the rule tools need from the stores (the settings use the same ones). */
export interface RuleToolDeps {
  rules: {
    rules: RuleDef[];
    loadRulesAsync(): Promise<void>;
    loadRuleAccountsAsync(): Promise<RuleAccount[]>;
    saveRuleAsync(
      input: RuleInput,
      options?: { id?: string; origin?: "user" | "agent" },
    ): Promise<string>;
    deleteRuleAsync(id: string): Promise<void>;
  };
  applyRuleToExistingAsync(rule: RuleDef): Promise<{ applied: number; limited: boolean }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const conditionOf = (raw: unknown): RuleCondition => {
  const condition = isRecord(raw) ? raw : {};
  if (condition.field === "attachment") return { field: "attachment" };
  const field = condition.field;
  if (field !== "from" && field !== "to" && field !== "subject") {
    throw toolError("a condition needs a field: from, to, subject or attachment");
  }
  return { field, contains: typeof condition.contains === "string" ? condition.contains : "" };
};

/** `move` names its target in `to`: a role (`archive`, `trash`, …) or the name of a folder. */
const actionOf = (raw: unknown): RuleAction => {
  const action = isRecord(raw) ? raw : {};
  if (action.type === "markRead") return { type: "markRead" };
  if (action.type === "flag") return { type: "flag" };
  if (action.type !== "move") throw toolError("an action is move, markRead or flag");
  const to = typeof action.to === "string" ? action.to.trim() : "";
  return isMailboxRole(to.toLowerCase())
    ? { type: "move", role: to.toLowerCase() as Extract<RuleAction, { role: string }>["role"] }
    : { type: "move", mailbox: to };
};

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const present = (rule: RuleDef, accounts: RuleAccount[]) => ({
  id: rule.id,
  name: rule.name,
  account: rule.accountId,
  enabled: rule.enabled,
  conditions: rule.conditions,
  actions: rule.actions,
  origin: rule.origin,
  targetMissing: ruleTargetMissingKnown(rule, accounts),
});

/**
 * `list_rules`, `add_rule` and `remove_rule`. `add_rule` is declared destructive in the manifest, so
 * the host asks before every call; the rule it stores is marked as the agent's.
 */
export const createRuleTools = (deps: () => Promise<RuleToolDeps>): ToolHandlers => ({
  list_rules: async () => {
    const { rules } = await deps();
    await rules.loadRulesAsync();
    const accounts = await rules.loadRuleAccountsAsync();
    return { rules: rules.rules.map((rule) => present(rule, accounts)) };
  },

  add_rule: async (input) => {
    const { rules, applyRuleToExistingAsync } = await deps();
    const rule: RuleInput = {
      name: optionalString(input, "name") ?? "",
      accountId: optionalString(input, "account") ?? null,
      enabled: true,
      conditions: asList(input.conditions).map(conditionOf),
      actions: asList(input.actions).map(actionOf),
    };
    // list_mailboxes shows folder names decoded and in any case; the rule stores the server's name.
    const account = rule.accountId
      ? (await rules.loadRuleAccountsAsync()).find((a) => a.id === rule.accountId)
      : undefined;
    if (account) {
      rule.actions = rule.actions.map((a) =>
        "mailbox" in a
          ? { ...a, mailbox: resolveMailbox(account.mailboxes, a.mailbox) ?? a.mailbox }
          : a,
      );
    }
    let id: string;
    try {
      id = await rules.saveRuleAsync(rule, { origin: "agent" });
    } catch (err) {
      if (err instanceof RuleValidationError) {
        throw toolError(`the rule is not valid: ${err.message}`);
      }
      throw err;
    }
    const saved = rules.rules.find((r) => r.id === id);
    const accounts = await rules.loadRuleAccountsAsync();
    const result: Record<string, unknown> = {
      id,
      targetMissing: saved ? ruleTargetMissingKnown(saved, accounts) : false,
    };
    if (input.applyToExisting === true && saved) {
      // The rule is stored by now; a failing run must not read as a failed call (a retry would add it twice).
      try {
        const { applied, limited } = await applyRuleToExistingAsync(saved);
        result.applied = applied;
        result.appliedLimit = limited;
      } catch (err) {
        result.applyError = errorText(err);
      }
    }
    return result;
  },

  remove_rule: async (input) => {
    const { rules } = await deps();
    const id = optionalString(input, "id");
    const name = optionalString(input, "name")?.trim().toLowerCase();
    if (!id && !name) throw toolError("name the rule by id or by name");
    await rules.loadRulesAsync();
    const matches = id
      ? rules.rules.filter((r) => r.id === id)
      : rules.rules.filter((r) => r.name.trim().toLowerCase() === name);
    if (matches.length === 0) throw toolError("there is no such rule");
    if (matches.length > 1) {
      throw toolError(
        `${matches.length} rules have that name, nothing was removed; use the id: ${matches
          .map((r) => r.id)
          .join(", ")}`,
      );
    }
    await rules.deleteRuleAsync(matches[0]!.id);
    return { removed: 1 };
  },
});
