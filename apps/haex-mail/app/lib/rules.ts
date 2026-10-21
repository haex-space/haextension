import type {
  MailAddressJson,
  MailboxRole,
  RuleActionJson,
  RuleConditionJson,
} from "../database/schemas";
import { formatAddressList } from "./address";

/**
 * Mail rules: pure checks, matching and planning. No store, no server, no i18n — the store and the
 * tools read and write, the UI words the parts `describeRule` returns. Relative imports only, so
 * the tests need no alias.
 */

export type RuleField = "from" | "to" | "subject";

export type RuleCondition = RuleConditionJson;

/** What a rule may do. There is no action that forwards or sends a message, by design. */
export type RuleAction = RuleActionJson;

export type MoveAction = Extract<RuleAction, { type: "move" }>;

export interface RuleInput {
  name: string;
  /** `null`: the rule covers every account. */
  accountId: string | null;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export interface RuleDef extends RuleInput {
  id: string;
  origin: "user" | "agent";
  /** Unix milliseconds; the order rules are weighed in. */
  createdAt: number;
}

/** What a rule looks at: the cached envelope of a message. */
export interface RuleMessage {
  accountId: string;
  mailboxName: string;
  uid: number;
  fromJson: MailAddressJson[];
  toJson: MailAddressJson[];
  ccJson: MailAddressJson[];
  subject: string | null;
  hasAttachments: boolean;
}

export interface RuleAccount {
  id: string;
  mailboxes: { name: string; role: MailboxRole | null }[];
}

export interface RuleIssue {
  field: "name" | "account" | "conditions" | "actions";
  /** Doubles as the i18n key below `rules.errors`. */
  code: string;
}

/** Thrown when a rule that fails `validateRule` is stored; carries the problems for the caller to show. */
export class RuleValidationError extends Error {
  constructor(readonly issues: RuleIssue[]) {
    super(issues.map((i) => `${i.field}: ${i.code}`).join(", "));
    this.name = "RuleValidationError";
  }
}

export const MAX_RULE_NAME = 80;
export const MAX_RULE_TEXT = 200;
export const MAX_CONDITIONS = 8;
export const MAX_ACTIONS = 4;

/** Checks a rule before it is stored; an empty list means it may be. */
export const validateRule = (input: RuleInput, accountIds: ReadonlySet<string>): RuleIssue[] => {
  const issues: RuleIssue[] = [];
  const name = input.name.trim();
  if (!name) issues.push({ field: "name", code: "nameRequired" });
  else if (name.length > MAX_RULE_NAME) issues.push({ field: "name", code: "nameTooLong" });

  if (input.accountId !== null && !accountIds.has(input.accountId)) {
    issues.push({ field: "account", code: "unknownAccount" });
  }

  if (input.conditions.length === 0) {
    issues.push({ field: "conditions", code: "conditionsRequired" });
  }
  if (input.conditions.length > MAX_CONDITIONS) {
    issues.push({ field: "conditions", code: "tooManyConditions" });
  }
  for (const condition of input.conditions) {
    if (condition.field === "attachment") continue;
    const text = condition.contains.trim();
    if (!text) {
      issues.push({ field: "conditions", code: "conditionTextRequired" });
      break;
    }
    if (text.length > MAX_RULE_TEXT) {
      issues.push({ field: "conditions", code: "conditionTextTooLong" });
      break;
    }
  }

  if (input.actions.length === 0) issues.push({ field: "actions", code: "actionsRequired" });
  if (input.actions.length > MAX_ACTIONS) issues.push({ field: "actions", code: "tooManyActions" });
  const kinds = input.actions.map((a) => a.type);
  if (new Set(kinds).size !== kinds.length) {
    issues.push({ field: "actions", code: "duplicateAction" });
  }
  for (const action of input.actions) {
    if (action.type !== "move") continue;
    if ("mailbox" in action) {
      if (!action.mailbox.trim()) {
        issues.push({ field: "actions", code: "moveTargetRequired" });
        break;
      }
      // Folder names differ per account, so only a role is a target for every account.
      if (input.accountId === null) {
        issues.push({ field: "actions", code: "moveMailboxNeedsAccount" });
        break;
      }
    }
  }
  return issues;
};

const contains = (haystack: string, needle: string): boolean =>
  haystack.toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase());

const meets = (condition: RuleCondition, message: RuleMessage): boolean => {
  switch (condition.field) {
    case "attachment":
      return message.hasAttachments;
    case "subject":
      return contains(message.subject ?? "", condition.contains);
    case "from":
      return contains(formatAddressList(message.fromJson), condition.contains);
    case "to":
      return contains(formatAddressList([...message.toJson, ...message.ccJson]), condition.contains);
  }
};

/** Whether `rule` is on, covers the message's account and every condition holds. */
export const matchesRule = (rule: RuleDef, message: RuleMessage): boolean =>
  rule.enabled &&
  (rule.accountId === null || rule.accountId === message.accountId) &&
  rule.conditions.length > 0 &&
  rule.conditions.every((condition) => meets(condition, message));

/** The mailbox a move names in `account`, or `null` when there is none (a role nobody has, a gone folder). */
export const resolveMoveTarget = (account: RuleAccount, action: MoveAction): string | null => {
  const target =
    "role" in action
      ? account.mailboxes.find((m) => m.role === action.role)
      : account.mailboxes.find((m) => m.name === action.mailbox);
  return target?.name ?? null;
};

const moveOf = (rule: RuleDef): MoveAction | undefined =>
  rule.actions.find((a): a is MoveAction => a.type === "move");

/** Whether a move of `rule` has no target in an account the rule covers (FR-024). */
export const ruleTargetMissing = (rule: RuleDef, accounts: RuleAccount[]): boolean => {
  const move = moveOf(rule);
  if (!move) return false;
  const covered =
    rule.accountId === null ? accounts : accounts.filter((a) => a.id === rule.accountId);
  if (covered.length === 0) return true;
  return covered.some((account) => resolveMoveTarget(account, move) === null);
};

/**
 * Like `ruleTargetMissing`, but an account whose mailboxes were never fetched counts as unknown,
 * not as one that lacks the folder — the settings and the agent both show this.
 */
export const ruleTargetMissingKnown = (rule: RuleDef, accounts: RuleAccount[]): boolean => {
  const known = accounts.filter((a) => a.mailboxes.length > 0);
  const covered = rule.accountId === null ? known : known.filter((a) => a.id === rule.accountId);
  return covered.length > 0 && ruleTargetMissing(rule, covered);
};

export interface ActionPlan {
  markRead: boolean;
  flag: boolean;
  /** The mailbox to move to, or `null` for no move (also when the message is already there). */
  moveTo: string | null;
  applied: string[];
  skipped: { ruleId: string; reason: "targetMissing" }[];
}

/**
 * What all rules together do to one message. Every matching rule applies; the earliest created
 * rule with a move decides it, and a rule whose move has no target is skipped as a whole.
 * `resolve` names the mailbox of a move in the message's account.
 */
export const planActions = (
  rules: RuleDef[],
  message: RuleMessage,
  resolve: (accountId: string, action: MoveAction) => string | null,
): ActionPlan => {
  const plan: ActionPlan = { markRead: false, flag: false, moveTo: null, applied: [], skipped: [] };
  let moveDecided = false;
  const ordered = [...rules].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const rule of ordered) {
    if (!matchesRule(rule, message)) continue;
    const move = moveOf(rule);
    const target = move ? resolve(message.accountId, move) : null;
    if (move && target === null) {
      plan.skipped.push({ ruleId: rule.id, reason: "targetMissing" });
      continue;
    }
    plan.applied.push(rule.id);
    for (const action of rule.actions) {
      if (action.type === "markRead") plan.markRead = true;
      if (action.type === "flag") plan.flag = true;
    }
    if (move && !moveDecided) {
      moveDecided = true;
      plan.moveTo = target !== message.mailboxName ? target : null;
    }
  }
  return plan;
};

/**
 * Which UIDs of a mailbox the rules run for. `through` is the highest UID they have run for; it is
 * `null` until the mailbox was seen once. The first look only sets the mark, from the highest UID
 * and the server's UIDNEXT (so a mail that arrives in an empty inbox still counts as new), because
 * a new rule must not reorder the whole inbox. The caller stores `nextThrough` once the run went
 * through, so a failed run is tried again.
 *
 * `uids` are only the messages one fetch looked at (the newest 50 of a normal fetch). If more than
 * that arrive between two fetches, the older ones fall below the new `nextThrough` and no rule runs
 * for them; "apply to existing" is the way to catch up.
 */
export const planRuleRun = (
  through: number | null,
  uids: number[],
  uidNext?: number | null,
): { run: number[]; nextThrough: number } => {
  const highest = Math.max(0, ...uids);
  if (through === null) {
    return { run: [], nextThrough: Math.max(highest, uidNext ? uidNext - 1 : 0) };
  }
  const run = uids.filter((uid) => uid > through).sort((a, b) => a - b);
  return { run, nextThrough: Math.max(through, highest) };
};

export type ConditionPart = { key: RuleField; text: string } | { key: "attachment" };
export type ActionPart =
  | { key: "moveRole" | "moveMailbox"; target: string }
  | { key: "markRead" | "flag" };

/** The parts of a rule in the order they read; the UI words them in the user's language. */
export const describeRule = (
  rule: RuleDef,
): { conditions: ConditionPart[]; actions: ActionPart[] } => ({
  conditions: rule.conditions.map((c) =>
    c.field === "attachment" ? { key: "attachment" } : { key: c.field, text: c.contains },
  ),
  actions: rule.actions.map((a): ActionPart => {
    if (a.type !== "move") return { key: a.type };
    return "role" in a
      ? { key: "moveRole", target: a.role }
      : { key: "moveMailbox", target: a.mailbox };
  }),
});
