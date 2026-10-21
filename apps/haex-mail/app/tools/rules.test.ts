import { describe, expect, it } from "vitest";
import { encodeMailboxName } from "../lib/imap";
import { validateRule, RuleValidationError, type RuleDef, type RuleInput } from "../lib/rules";
import { createRuleTools, type RuleToolDeps } from "./rules";

const noSignal = { signal: new AbortController().signal };

/** The rule store with a list in memory, validating like the real one. */
const fakeDeps = (accountIds = ["a1"]) => {
  const rules: RuleDef[] = [];
  const applied: string[] = [];
  const state = { applyFails: false };
  const deps: RuleToolDeps = {
    rules: {
      rules,
      loadRulesAsync: async () => {},
      loadRuleAccountsAsync: async () => [
        {
          id: "a1",
          mailboxes: [
            { name: "INBOX", role: "inbox" },
            { name: "Archive", role: "archive" },
            { name: encodeMailboxName("Ärger"), role: null },
          ],
        },
      ],
      saveRuleAsync: async (input: RuleInput, options = {}) => {
        const issues = validateRule(input, new Set(accountIds));
        if (issues.length > 0) throw new RuleValidationError(issues);
        const id = `r${rules.length + 1}`;
        rules.push({ ...input, id, origin: options.origin ?? "user", createdAt: rules.length });
        return id;
      },
      deleteRuleAsync: async (id: string) => {
        rules.splice(
          rules.findIndex((r) => r.id === id),
          1,
        );
      },
    },
    applyRuleToExistingAsync: async (rule) => {
      if (state.applyFails) throw new Error("IMAP is down");
      applied.push(rule.id);
      return { applied: 3, limited: false };
    },
  };
  return { deps, rules, applied, state, tools: createRuleTools(async () => deps) };
};

const newsletter = {
  name: "Newsletter",
  conditions: [{ field: "from", contains: "shop.de" }],
  actions: [{ type: "move", to: "archive" }],
};

describe("add_rule", () => {
  it("stores the rule as the agent's, with a role target mapped to a role", async () => {
    const { tools, rules } = fakeDeps();
    const result = (await tools.add_rule!(newsletter, noSignal)) as Record<string, unknown>;
    expect(result).toEqual({ id: "r1", targetMissing: false });
    expect(rules[0]).toMatchObject({
      name: "Newsletter",
      accountId: null,
      enabled: true,
      origin: "agent",
      conditions: [{ field: "from", contains: "shop.de" }],
      actions: [{ type: "move", role: "archive" }],
    });
  });

  it("takes any other target as a folder name, for one account", async () => {
    const { tools, rules } = fakeDeps();
    await tools.add_rule!(
      { ...newsletter, account: "a1", actions: [{ type: "move", to: "Steuer" }, { type: "markRead" }] },
      noSignal,
    );
    expect(rules[0]!.actions).toEqual([{ type: "move", mailbox: "Steuer" }, { type: "markRead" }]);
    expect(rules[0]!.accountId).toBe("a1");
  });

  it("stores a folder the agent read from list_mailboxes under the name the server uses", async () => {
    const { tools, rules } = fakeDeps();
    const result = await tools.add_rule!(
      { ...newsletter, account: "a1", actions: [{ type: "move", to: "ärger" }] },
      noSignal,
    );
    expect(rules[0]!.actions).toEqual([{ type: "move", mailbox: encodeMailboxName("Ärger") }]);
    expect(result).toEqual({ id: "r1", targetMissing: false });
  });

  it("runs the rule once on the existing mails when asked and says how many it touched", async () => {
    const { tools, applied } = fakeDeps();
    const result = await tools.add_rule!({ ...newsletter, applyToExisting: true }, noSignal);
    expect(result).toMatchObject({ id: "r1", applied: 3, appliedLimit: false });
    expect(applied).toEqual(["r1"]);
  });

  it("keeps the stored rule and reports it when running on the existing mails fails", async () => {
    const { tools, rules, state } = fakeDeps();
    state.applyFails = true;
    const result = await tools.add_rule!({ ...newsletter, applyToExisting: true }, noSignal);
    expect(result).toMatchObject({ id: "r1", applyError: "IMAP is down" });
    expect(result).not.toHaveProperty("applied");
    expect(rules).toHaveLength(1);
  });

  it("does not touch existing mails by default", async () => {
    const { tools, applied } = fakeDeps();
    await tools.add_rule!(newsletter, noSignal);
    expect(applied).toEqual([]);
  });

  it("refuses an invalid rule with the problems and stores nothing", async () => {
    const { tools, rules } = fakeDeps();
    await expect(tools.add_rule!({ name: "", conditions: [], actions: [] }, noSignal)).rejects.toThrow(
      /not valid.*name: nameRequired/,
    );
    await expect(
      tools.add_rule!({ ...newsletter, account: "nope" }, noSignal),
    ).rejects.toThrow(/unknownAccount/);
    expect(rules).toEqual([]);
  });

  it("has no way to forward or send a mail", async () => {
    const { tools, rules } = fakeDeps();
    await expect(
      tools.add_rule!({ ...newsletter, actions: [{ type: "forward", to: "x@y.de" }] }, noSignal),
    ).rejects.toThrow(/move, markRead or flag/);
    expect(rules).toEqual([]);
  });
});

describe("list_rules", () => {
  it("lists every rule with its origin and whether its target is gone", async () => {
    const { tools } = fakeDeps();
    await tools.add_rule!(newsletter, noSignal);
    await tools.add_rule!(
      { name: "Weg", account: "a1", conditions: [{ field: "attachment" }], actions: [{ type: "move", to: "Gone" }] },
      noSignal,
    );
    const { rules } = (await tools.list_rules!({}, noSignal)) as { rules: Record<string, unknown>[] };
    expect(rules.map((r) => [r.name, r.origin, r.targetMissing])).toEqual([
      ["Newsletter", "agent", false],
      ["Weg", "agent", true],
    ]);
  });
});

describe("remove_rule", () => {
  it("removes a rule by id or by name, ignoring case", async () => {
    const { tools, rules } = fakeDeps();
    await tools.add_rule!(newsletter, noSignal);
    await tools.add_rule!({ ...newsletter, name: "Zwei" }, noSignal);
    expect(await tools.remove_rule!({ name: "  newsLETTER " }, noSignal)).toEqual({ removed: 1 });
    expect(await tools.remove_rule!({ id: "r2" }, noSignal)).toEqual({ removed: 1 });
    expect(rules).toEqual([]);
  });

  it("removes nothing when the name fits several rules, and names their ids", async () => {
    const { tools, rules } = fakeDeps();
    await tools.add_rule!(newsletter, noSignal);
    await tools.add_rule!(newsletter, noSignal);
    await expect(tools.remove_rule!({ name: "Newsletter" }, noSignal)).rejects.toThrow(/2 rules.*r1, r2/);
    expect(rules).toHaveLength(2);
  });

  it("reports a rule that is not there and a call that names none", async () => {
    const { tools } = fakeDeps();
    await expect(tools.remove_rule!({ id: "nope" }, noSignal)).rejects.toThrow(/no such rule/);
    await expect(tools.remove_rule!({}, noSignal)).rejects.toThrow(/by id or by name/);
  });
});
