/**
 * Thin wrapper around rrule.js for the single-source-of-truth recurrence model:
 * the master event row stores an RFC 5545 RRULE *body* (no "RRULE:" prefix,
 * no DTSTART — dtstart lives in `events.dtstart`). Occurrences are expanded on
 * the fly per view; nothing is materialised.
 */
import { RRule, type Options } from "rrule";
import { toLocalDateKey } from "~/lib/dates";

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

const FREQ_MAP: Record<Frequency, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

const FREQ_REVERSE: Record<number, Frequency> = {
  [RRule.DAILY]: "daily",
  [RRule.WEEKLY]: "weekly",
  [RRule.MONTHLY]: "monthly",
  [RRule.YEARLY]: "yearly",
};

/** Parse a stored RRULE body into partial rrule.js options (null on garbage). */
export function parseRRule(rule: string): Partial<Options> | null {
  try {
    return RRule.parseString(rule);
  } catch {
    return null;
  }
}

/**
 * rrule.js computes in UTC. Feeding it the local wall clock as if it were UTC
 * ("floating" time, as its docs recommend) keeps occurrences at the same local
 * time across DST changes and evaluates BYDAY on the local weekday.
 */
function toFloating(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
    ),
  );
}

function fromFloating(date: Date): Date {
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
}

function buildRuleFromOptions(opts: Partial<Options>, dtstart: Date): RRule | null {
  try {
    // UNTIL is a real UTC instant (RFC 5545); compare it in the same frame.
    return new RRule({ ...opts, until: opts.until ? toFloating(opts.until) : opts.until, dtstart: toFloating(dtstart) });
  } catch {
    return null;
  }
}

function buildRule(rule: string, dtstart: Date): RRule | null {
  const opts = parseRRule(rule);
  return opts ? buildRuleFromOptions(opts, dtstart) : null;
}

/** All occurrences of a recurring event within [start, end] (inclusive). */
export function expandOccurrences(
  rule: string,
  dtstart: Date,
  start: Date,
  end: Date,
): Date[] {
  const r = buildRule(rule, dtstart);
  if (!r) return [];
  try {
    return r.between(toFloating(start), toFloating(end), true).map(fromFloating);
  } catch {
    return [];
  }
}

/** The first `count` occurrences of structured options (for previews). */
export function firstOccurrences(options: Partial<Options>, dtstart: Date, count: number): Date[] {
  const r = buildRuleFromOptions(options, dtstart);
  if (!r) return [];
  const dates: Date[] = [];
  try {
    r.all((date, i) => {
      if (i < count) dates.push(fromFloating(date));
      return i < count;
    });
  } catch {
    return [];
  }
  return dates;
}

/** Next occurrence strictly after `after`, or null when the rule is exhausted. */
export function nextOccurrence(
  rule: string,
  dtstart: Date,
  after: Date,
): Date | null {
  const r = buildRule(rule, dtstart);
  if (!r) return null;
  try {
    const next = r.after(toFloating(after), false);
    return next ? fromFloating(next) : null;
  } catch {
    return null;
  }
}

/**
 * Replace COUNT with the equivalent UNTIL. Completing a recurring task moves
 * dtstart to the next occurrence, and COUNT counts from dtstart, so a COUNT
 * series would never run out.
 */
export function pinCount(rule: string, dtstart: Date): string {
  const opts = parseRRule(rule);
  if (!opts?.count) return rule;
  const r = buildRuleFromOptions(opts, dtstart);
  const last = r?.all().at(-1);
  if (!last) return rule;
  const { count: _count, ...rest } = opts;
  return optionsToRRule({ ...rest, until: fromFloating(last) });
}

/** UNTIL for a series that ends on the given local date (inclusive). */
export function dateKeyToUntil(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day!, 23, 59, 59);
}

/**
 * Local end date of an UNTIL. Earlier versions wrote the chosen date as
 * "T23:59:59Z"; that exact UTC time is read as its UTC date so those rules
 * don't move by a day east of UTC.
 */
export function untilToDateKey(until: Date): string {
  const legacy = until.getUTCHours() === 23 && until.getUTCMinutes() === 59 && until.getUTCSeconds() === 59;
  return legacy ? until.toISOString().slice(0, 10) : toLocalDateKey(until);
}

/** Serialize structured options to a stored RRULE body (no "RRULE:"/DTSTART). */
export function optionsToRRule(options: Partial<Options>): string {
  const str = RRule.optionsToString(options as Options);
  const line = str.split("\n").find((l) => l.startsWith("RRULE:")) ?? str;
  return line.replace(/^RRULE:/, "").trim();
}

/** The frequency of a stored rule, or null if it has none / is unparseable. */
export function rruleFrequency(rule: string | null | undefined): Frequency | null {
  if (!rule) return null;
  const opts = parseRRule(rule);
  if (!opts || opts.freq == null) return null;
  return FREQ_REVERSE[opts.freq] ?? null;
}

/**
 * Semantic equality for two RRULE bodies. `BYDAY=MO,WE` and `BYDAY=WE,MO` are
 * the same rule even though the strings differ — a raw `===` would treat them
 * as override-vs-default mismatches and break inheritance after a CalDAV
 * round-trip.
 */
export function rrulesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a === b) return true;
  const ao = parseRRule(a);
  const bo = parseRRule(b);
  if (!ao || !bo) return false;
  // Normalize: serialize each set/option in a stable order. RRule.optionsToString
  // already canonicalises field order; sorting array-valued options handles
  // BYDAY/BYMONTH/etc. reordering.
  const normalize = (opts: Partial<Options>) => {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(opts).sort();
    for (const k of keys) {
      const v = (opts as Record<string, unknown>)[k];
      if (Array.isArray(v)) {
        sorted[k] = [...v].sort((x, y) => String(x).localeCompare(String(y)));
      } else {
        sorted[k] = v;
      }
    }
    return JSON.stringify(sorted);
  };
  return normalize(ao) === normalize(bo);
}

export const FREQUENCIES = FREQ_MAP;
export { RRule };
export type { Options };
