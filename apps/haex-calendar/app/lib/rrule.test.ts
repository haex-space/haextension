import { describe, expect, it } from "vitest";
import { dateKeyToUntil, expandOccurrences, nextOccurrence, pinCount, untilToDateKey } from "./rrule";
import { toLocalDateKey } from "./dates";

// vitest.config.ts pins TZ=Europe/Berlin (DST ends 2026-10-25, starts 2026-03-29).
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("expandOccurrences (floating local time)", () => {
  it("keeps the local time across the autumn DST change", () => {
    const occ = expandOccurrences("FREQ=WEEKLY", local(2026, 10, 19, 14), local(2026, 10, 18), local(2026, 11, 10));
    expect(occ.map(hm)).toEqual(["14:00", "14:00", "14:00", "14:00"]);
    expect(occ.map(toLocalDateKey)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
  });

  it("keeps the local time across the spring DST change", () => {
    const occ = expandOccurrences("FREQ=DAILY", local(2026, 3, 28, 10), local(2026, 3, 28), local(2026, 3, 30, 23));
    expect(occ.map(hm)).toEqual(["10:00", "10:00", "10:00"]);
  });

  it("evaluates BYDAY on the local weekday for early-morning events", () => {
    const occ = expandOccurrences("FREQ=WEEKLY;BYDAY=MO", local(2026, 10, 19, 0, 30), local(2026, 10, 18), local(2026, 11, 3));
    expect(occ.map((d) => d.getDay())).toEqual([1, 1, 1]);
    expect(occ.map(hm)).toEqual(["0:30", "0:30", "0:30"]);
  });

  it("expands all-day events on local midnights", () => {
    const occ = expandOccurrences("FREQ=YEARLY", local(2020, 7, 15), local(2026, 7, 1), local(2026, 7, 31));
    expect(occ.map(toLocalDateKey)).toEqual(["2026-07-15"]);
    expect(hm(occ[0]!)).toBe("0:00");
  });

  it("treats UNTIL as the end of the chosen local day", () => {
    const until = dateKeyToUntil("2026-10-21");
    const rule = `FREQ=DAILY;UNTIL=${until.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
    const occ = expandOccurrences(rule, local(2026, 10, 19, 23, 30), local(2026, 10, 1), local(2026, 11, 1));
    expect(occ.map(toLocalDateKey)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
  });
});

describe("nextOccurrence", () => {
  it("returns the next local occurrence after DST", () => {
    const next = nextOccurrence("FREQ=WEEKLY", local(2026, 10, 19, 14), local(2026, 10, 20));
    expect(next && `${toLocalDateKey(next)} ${hm(next)}`).toBe("2026-10-26 14:00");
  });

  it("returns null when the rule is exhausted", () => {
    expect(nextOccurrence("FREQ=DAILY;COUNT=2", local(2026, 10, 19, 9), local(2026, 10, 20, 9))).toBeNull();
  });
});

describe("UNTIL date keys", () => {
  it("round-trips a chosen date", () => {
    expect(untilToDateKey(dateKeyToUntil("2026-12-31"))).toBe("2026-12-31");
  });

  it("reads the legacy end-of-day-in-UTC form as that date", () => {
    expect(untilToDateKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
  });
});

describe("pinCount", () => {
  it("lets a COUNT-limited series end when dtstart advances", () => {
    let rule = "FREQ=DAILY;COUNT=3";
    let dtstart: Date | null = local(2026, 10, 19, 9);
    const seen: string[] = [];
    while (dtstart && seen.length < 10) {
      seen.push(toLocalDateKey(dtstart));
      rule = pinCount(rule, dtstart);
      dtstart = nextOccurrence(rule, dtstart, dtstart);
    }
    expect(seen).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
  });

  it("leaves rules without COUNT untouched", () => {
    expect(pinCount("FREQ=WEEKLY;BYDAY=MO", local(2026, 10, 19, 9))).toBe("FREQ=WEEKLY;BYDAY=MO");
  });
});
