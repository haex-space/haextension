/**
 * Thin wrapper around rrule.js for the single-source-of-truth recurrence model:
 * the master event row stores an RFC 5545 RRULE *body* (no "RRULE:" prefix,
 * no DTSTART — dtstart lives in `events.dtstart`). Occurrences are expanded on
 * the fly per view; nothing is materialised.
 */
import { RRule, type Options } from "rrule";

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

function buildRule(rule: string, dtstart: Date): RRule | null {
  const opts = parseRRule(rule);
  if (!opts) return null;
  try {
    return new RRule({ ...opts, dtstart });
  } catch {
    return null;
  }
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
    return r.between(start, end, true);
  } catch {
    return [];
  }
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
    return r.after(after, false);
  } catch {
    return null;
  }
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

export const FREQUENCIES = FREQ_MAP;
export { RRule };
export type { Options };
