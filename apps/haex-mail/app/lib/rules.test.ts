import { describe, expect, it } from "vitest";
import {
  describeRule,
  matchesRule,
  planActions,
  planRuleRun,
  RuleValidationError,
  ruleDraftFromMessage,
  ruleTargetMissing,
  ruleTargetMissingKnown,
  validateRule,
  type RuleAccount,
  type RuleDef,
  type RuleInput,
  type RuleMessage,
} from "./rules";

const message = (over: Partial<RuleMessage> = {}): RuleMessage => ({
  accountId: "a1",
  mailboxName: "INBOX",
  uid: 10,
  fromJson: [{ name: "Shop News", email: "news@shop.de" }],
  toJson: [{ email: "me@example.org" }],
  ccJson: [{ name: "Boss", email: "boss@example.org" }],
  subject: "Your weekly Newsletter",
  hasAttachments: false,
  ...over,
});

const input = (over: Partial<RuleInput> = {}): RuleInput => ({
  name: "Newsletter",
  accountId: null,
  enabled: true,
  conditions: [{ field: "from", contains: "shop.de" }],
  actions: [{ type: "move", role: "archive" }],
  ...over,
});

const rule = (id: string, createdAt: number, over: Partial<RuleInput> = {}): RuleDef => ({
  ...input(over),
  id,
  origin: "user",
  createdAt,
});

const accounts: RuleAccount[] = [
  {
    id: "a1",
    mailboxes: [
      { name: "INBOX", role: "inbox" },
      { name: "Archive", role: "archive" },
      { name: "Steuer", role: null },
    ],
  },
  {
    id: "a2",
    mailboxes: [
      { name: "INBOX", role: "inbox" },
      { name: "Alt", role: "archive" },
    ],
  },
];
const known = new Set(accounts.map((a) => a.id));

describe("validateRule", () => {
  it("accepts a rule with a condition and an action", () => {
    expect(validateRule(input(), known)).toEqual([]);
  });

  it("names the field of every problem", () => {
    const issues = validateRule(
      input({ name: "  ", conditions: [], actions: [] }),
      known,
    );
    expect(issues.map((i) => i.field).sort()).toEqual(["actions", "conditions", "name"]);
  });

  it("refuses an empty or too long match text and too many conditions", () => {
    expect(
      validateRule(input({ conditions: [{ field: "subject", contains: "  " }] }), known),
    ).toEqual([{ field: "conditions", code: "conditionTextRequired" }]);
    expect(
      validateRule(
        input({ conditions: [{ field: "from", contains: "x".repeat(201) }] }),
        known,
      ),
    ).toEqual([{ field: "conditions", code: "conditionTextTooLong" }]);
    expect(
      validateRule(
        input({
          conditions: Array.from({ length: 9 }, () => ({ field: "attachment" as const })),
        }),
        known,
      ),
    ).toEqual([{ field: "conditions", code: "tooManyConditions" }]);
  });

  it("refuses a name over 80 characters", () => {
    expect(validateRule(input({ name: "n".repeat(81) }), known)).toEqual([
      { field: "name", code: "nameTooLong" },
    ]);
  });

  it("refuses a repeated action kind and more than four actions", () => {
    expect(
      validateRule(
        input({ actions: [{ type: "markRead" }, { type: "markRead" }] }),
        known,
      ),
    ).toEqual([{ field: "actions", code: "duplicateAction" }]);
    expect(
      validateRule(
        input({
          actions: [
            { type: "markRead" },
            { type: "flag" },
            { type: "move", role: "trash" },
            { type: "move", mailbox: "X" },
            { type: "move", role: "junk" },
          ],
        }),
        known,
      ).map((i) => i.code),
    ).toContain("tooManyActions");
  });

  it("refuses an unknown account", () => {
    expect(validateRule(input({ accountId: "nope" }), known)).toEqual([
      { field: "account", code: "unknownAccount" },
    ]);
  });

  it("lets a rule for all accounts move only to a role, because folder names differ", () => {
    expect(
      validateRule(input({ actions: [{ type: "move", mailbox: "Steuer" }] }), known),
    ).toEqual([{ field: "actions", code: "moveMailboxNeedsAccount" }]);
    expect(
      validateRule(
        input({ accountId: "a1", actions: [{ type: "move", mailbox: "Steuer" }] }),
        known,
      ),
    ).toEqual([]);
  });

  it("refuses a move without a target", () => {
    expect(
      validateRule(
        input({ accountId: "a1", actions: [{ type: "move", mailbox: "  " }] }),
        known,
      ),
    ).toEqual([{ field: "actions", code: "moveTargetRequired" }]);
  });
});

describe("matchesRule", () => {
  it("compares ignoring case, as a part of the text", () => {
    expect(matchesRule(rule("r", 1), message())).toBe(true);
    expect(
      matchesRule(
        rule("r", 1, { conditions: [{ field: "subject", contains: "NEWSLETTER" }] }),
        message(),
      ),
    ).toBe(true);
    expect(
      matchesRule(
        rule("r", 1, { conditions: [{ field: "from", contains: "bank" }] }),
        message(),
      ),
    ).toBe(false);
  });

  it("matches the display name and the address of the sender", () => {
    const by = (contains: string) =>
      matchesRule(rule("r", 1, { conditions: [{ field: "from", contains }] }), message());
    expect(by("shop news")).toBe(true);
    expect(by("news@shop")).toBe(true);
  });

  it("checks the recipients in to and cc", () => {
    const by = (contains: string) =>
      matchesRule(rule("r", 1, { conditions: [{ field: "to", contains }] }), message());
    expect(by("me@example")).toBe(true);
    expect(by("boss")).toBe(true);
    expect(by("shop")).toBe(false);
  });

  it("needs every condition (AND) and handles a message without a subject", () => {
    const both = rule("r", 1, {
      conditions: [
        { field: "from", contains: "shop" },
        { field: "attachment" },
      ],
    });
    expect(matchesRule(both, message())).toBe(false);
    expect(matchesRule(both, message({ hasAttachments: true }))).toBe(true);
    expect(
      matchesRule(
        rule("r", 1, { conditions: [{ field: "subject", contains: "x" }] }),
        message({ subject: null }),
      ),
    ).toBe(false);
  });

  it("applies to its own account only, and not while switched off", () => {
    expect(matchesRule(rule("r", 1, { accountId: "a2" }), message())).toBe(false);
    expect(matchesRule(rule("r", 1, { accountId: "a1" }), message())).toBe(true);
    expect(matchesRule(rule("r", 1, { enabled: false }), message())).toBe(false);
  });
});

describe("planActions", () => {
  const resolve = (accountId: string, action: { role?: string; mailbox?: string }) =>
    accounts
      .find((a) => a.id === accountId)
      ?.mailboxes.find((m) =>
        action.role ? m.role === action.role : m.name === action.mailbox,
      )?.name ?? null;

  it("collects what every matching rule asks for", () => {
    const plan = planActions(
      [
        rule("r1", 1, { actions: [{ type: "markRead" }] }),
        rule("r2", 2, { actions: [{ type: "flag" }] }),
        rule("r3", 3, { conditions: [{ field: "from", contains: "bank" }] }),
      ],
      message(),
      resolve,
    );
    expect(plan).toEqual({
      markRead: true,
      flag: true,
      moveTo: null,
      applied: ["r1", "r2"],
      skipped: [],
    });
  });

  it("lets the earliest created rule decide a move, whatever the order of the list", () => {
    const plan = planActions(
      [
        rule("late", 20, { accountId: "a1", actions: [{ type: "move", mailbox: "Steuer" }] }),
        rule("early", 10, { actions: [{ type: "move", role: "archive" }] }),
      ],
      message(),
      resolve,
    );
    expect(plan.moveTo).toBe("Archive");
    expect(plan.applied).toEqual(["early", "late"]);
  });

  it("skips a whole rule whose target is missing and reports it", () => {
    const plan = planActions(
      [
        rule("gone", 1, {
          accountId: "a1",
          actions: [{ type: "markRead" }, { type: "move", mailbox: "Weg" }],
        }),
        rule("flag", 2, { actions: [{ type: "flag" }] }),
      ],
      message(),
      resolve,
    );
    expect(plan.markRead).toBe(false);
    expect(plan.flag).toBe(true);
    expect(plan.skipped).toEqual([{ ruleId: "gone", reason: "targetMissing" }]);
  });

  it("does not move a message into the mailbox it is already in", () => {
    const plan = planActions(
      [rule("r", 1, { actions: [{ type: "move", role: "archive" }] })],
      message({ mailboxName: "Archive" }),
      resolve,
    );
    expect(plan.moveTo).toBeNull();
    expect(plan.applied).toEqual(["r"]);
  });

  it("does nothing without a matching rule", () => {
    expect(planActions([], message(), resolve)).toEqual({
      markRead: false,
      flag: false,
      moveTo: null,
      applied: [],
      skipped: [],
    });
  });
});

describe("ruleTargetMissing", () => {
  it("is false when every account has the role or the folder", () => {
    expect(ruleTargetMissing(rule("r", 1), accounts)).toBe(false);
    expect(
      ruleTargetMissing(
        rule("r", 1, { accountId: "a1", actions: [{ type: "move", mailbox: "Steuer" }] }),
        accounts,
      ),
    ).toBe(false);
  });

  it("is true when a folder or a role is missing for an account the rule covers", () => {
    expect(
      ruleTargetMissing(
        rule("r", 1, { accountId: "a1", actions: [{ type: "move", mailbox: "Weg" }] }),
        accounts,
      ),
    ).toBe(true);
    expect(
      ruleTargetMissing(rule("r", 1, { actions: [{ type: "move", role: "trash" }] }), accounts),
    ).toBe(true);
    expect(
      ruleTargetMissing(
        rule("r", 1, { accountId: "a2", actions: [{ type: "move", role: "archive" }] }),
        accounts,
      ),
    ).toBe(false);
  });

  it("is false for a rule that moves nothing", () => {
    expect(ruleTargetMissing(rule("r", 1, { actions: [{ type: "flag" }] }), accounts)).toBe(false);
  });
});

describe("ruleTargetMissingKnown", () => {
  const unknown: RuleAccount = { id: "a3", mailboxes: [] };
  it("does not count an account without fetched mailboxes as missing a folder", () => {
    expect(ruleTargetMissingKnown(rule("r", 1), [...accounts, unknown])).toBe(false);
    expect(
      ruleTargetMissingKnown(
        rule("r", 1, { accountId: "a3", actions: [{ type: "move", mailbox: "X" }] }),
        [...accounts, unknown],
      ),
    ).toBe(false);
  });

  it("still finds a role or folder an account with mailboxes lacks", () => {
    expect(
      ruleTargetMissingKnown(
        rule("r", 1, { actions: [{ type: "move", role: "trash" }] }),
        [...accounts, unknown],
      ),
    ).toBe(true);
  });
});

describe("planRuleRun", () => {
  it("sets the mark on the first look and runs nothing", () => {
    expect(planRuleRun(null, [5, 7, 9], 10)).toEqual({ run: [], nextThrough: 9 });
  });

  it("takes UIDNEXT into account for an empty inbox, so the first arrival counts as new", () => {
    expect(planRuleRun(null, [], 1)).toEqual({ run: [], nextThrough: 0 });
    expect(planRuleRun(0, [1], 2)).toEqual({ run: [1], nextThrough: 1 });
  });

  it("runs for the UIDs above the mark, oldest first, and moves the mark up", () => {
    expect(planRuleRun(7, [9, 5, 8, 7, 12], 13)).toEqual({ run: [8, 9, 12], nextThrough: 12 });
  });

  it("keeps the mark when nothing is new", () => {
    expect(planRuleRun(12, [5, 12], 13)).toEqual({ run: [], nextThrough: 12 });
  });
});

describe("describeRule", () => {
  it("turns a rule into parts the UI can word in either language", () => {
    expect(
      describeRule(
        rule("r", 1, {
          conditions: [
            { field: "from", contains: "shop" },
            { field: "attachment" },
          ],
          actions: [{ type: "move", role: "archive" }, { type: "markRead" }],
        }),
      ),
    ).toEqual({
      conditions: [{ key: "from", text: "shop" }, { key: "attachment" }],
      actions: [{ key: "moveRole", target: "archive" }, { key: "markRead" }],
    });
    expect(
      describeRule(rule("r", 1, { actions: [{ type: "move", mailbox: "Steuer" }, { type: "flag" }] }))
        .actions,
    ).toEqual([{ key: "moveMailbox", target: "Steuer" }, { key: "flag" }]);
  });
});

describe("RuleValidationError", () => {
  it("carries the issues and names them in its message", () => {
    const issues = validateRule(input({ name: "" }), known);
    const error = new RuleValidationError(issues);
    expect(error.issues).toEqual(issues);
    expect(error.message).toBe("name: nameRequired");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("ruleDraftFromMessage", () => {
  it("starts from the sender, in the account of the message", () => {
    const draft = ruleDraftFromMessage({
      accountId: "a2",
      fromJson: [{ name: "News Letter", email: "news@example.com" }],
    });
    expect(draft).toEqual({
      name: "News Letter",
      accountId: "a2",
      conditions: [{ field: "from", contains: "news@example.com" }],
    });
  });

  it("names the rule after the address when the sender has no name", () => {
    const draft = ruleDraftFromMessage({ accountId: "a1", fromJson: [{ email: "x@example.com" }] });
    expect(draft.name).toBe("x@example.com");
  });

  it("keeps the name within the limit and copes with a missing sender", () => {
    const long = ruleDraftFromMessage({
      accountId: "a1",
      fromJson: [{ name: "n".repeat(200), email: "x@example.com" }],
    });
    expect(long.name).toHaveLength(80);
    const none = ruleDraftFromMessage({ accountId: "a1", fromJson: [] });
    expect(none.conditions).toEqual([{ field: "from", contains: "" }]);
  });
});
