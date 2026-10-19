import { describe, expect, it } from "vitest";
import { formToRule, ruleToForm } from "./recurrenceForm";
import { parseRRule, rrulesEqual } from "./rrule";

const loaded = (rule: string) => ({ rule, form: ruleToForm(rule) });

describe("ruleToForm / formToRule", () => {
  it("returns the stored rule unchanged when nothing was edited", () => {
    for (const rule of ["FREQ=MONTHLY;BYDAY=2TU", "FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15", "FREQ=WEEKLY;BYDAY=MO,WE"]) {
      expect(formToRule(ruleToForm(rule), loaded(rule))).toBe(rule);
    }
  });

  it("keeps parts the form cannot show when another field changes", () => {
    const form = { ...ruleToForm("FREQ=MONTHLY;BYDAY=2TU"), endMode: "count" as const, count: 5 };
    const opts = parseRRule(formToRule(form, loaded("FREQ=MONTHLY;BYDAY=2TU"))!);
    expect(opts?.count).toBe(5);
    expect(JSON.stringify(opts?.byweekday)).toBe(JSON.stringify(parseRRule("FREQ=MONTHLY;BYDAY=2TU")?.byweekday));
  });

  it("starts from scratch when the frequency changes", () => {
    const form = { ...ruleToForm("FREQ=MONTHLY;BYDAY=2TU"), freq: "weekly" as const, byweekday: [4] };
    expect(formToRule(form, loaded("FREQ=MONTHLY;BYDAY=2TU"))).toBe("FREQ=WEEKLY;BYDAY=FR");
  });

  it("edits weekly weekdays", () => {
    const form = { ...ruleToForm("FREQ=WEEKLY;BYDAY=MO"), byweekday: [0, 2] };
    expect(formToRule(form, loaded("FREQ=WEEKLY;BYDAY=MO"))).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
  });

  it("reads and writes UNTIL as a local date", () => {
    const rule = "FREQ=DAILY;UNTIL=20261231T225959Z";
    expect(ruleToForm(rule)).toMatchObject({ endMode: "until", until: "2026-12-31" });
    const form = { ...ruleToForm(rule), interval: 2 };
    expect(rrulesEqual(formToRule(form, loaded(rule)), "FREQ=DAILY;INTERVAL=2;UNTIL=20261231T225959Z")).toBe(true);
  });

  it("maps no recurrence to null", () => {
    expect(ruleToForm(null).freq).toBe("none");
    expect(formToRule(ruleToForm(null), { rule: null, form: ruleToForm(null) })).toBeNull();
  });
});
