/**
 * Mapping between a stored RRULE body and the simple recurrence form. The form
 * only covers frequency, interval, weekly weekdays, one monthly day and the
 * end. Everything else an imported rule may carry (BYSETPOS, ordinal BYDAY,
 * BYMONTH, …) is kept as long as the frequency stays the same.
 */
import {
  FREQUENCIES,
  dateKeyToUntil,
  optionsToRRule,
  parseRRule,
  rruleFrequency,
  untilToDateKey,
  type Frequency,
  type Options,
} from "~/lib/rrule";

export interface RecurrenceForm {
  freq: Frequency | "none";
  interval: number;
  /** Weekly rules only; 0 = Monday … 6 = Sunday (rrule.js order). */
  byweekday: number[];
  /** Monthly rules only. */
  bymonthday: number | null;
  endMode: "never" | "count" | "until";
  count: number;
  /** "YYYY-MM-DD", the last day of the series. */
  until: string;
}

const EMPTY_FORM: RecurrenceForm = {
  freq: "none",
  interval: 1,
  byweekday: [],
  bymonthday: null,
  endMode: "never",
  count: 10,
  until: "",
};

function weekdayNumbers(value: Options["byweekday"] | undefined): number[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((day) => (typeof day === "number" ? day : typeof day === "string" ? -1 : day.weekday));
}

export function ruleToForm(rule: string | null | undefined): RecurrenceForm {
  const opts = rule ? parseRRule(rule) : null;
  const freq = rruleFrequency(rule);
  if (!opts || !freq) return { ...EMPTY_FORM };

  const monthdays = opts.bymonthday == null ? [] : Array.isArray(opts.bymonthday) ? opts.bymonthday : [opts.bymonthday];
  return {
    freq,
    interval: opts.interval ?? 1,
    byweekday: freq === "weekly" ? weekdayNumbers(opts.byweekday).filter((d) => d >= 0) : [],
    bymonthday: freq === "monthly" ? (monthdays[0] ?? null) : null,
    endMode: opts.count != null ? "count" : opts.until ? "until" : "never",
    count: opts.count ?? EMPTY_FORM.count,
    until: opts.until ? untilToDateKey(opts.until) : "",
  };
}

/**
 * Rule for the edited form. Unedited fields keep their stored value, and an
 * unedited form returns the stored rule verbatim.
 */
export function formToRule(
  form: RecurrenceForm,
  loaded: { rule: string | null; form: RecurrenceForm },
): string | null {
  if (form.freq === "none") return null;

  const sameFreq = loaded.rule !== null && form.freq === loaded.form.freq;
  const changed = <K extends keyof RecurrenceForm>(...keys: K[]) =>
    !sameFreq || keys.some((key) => JSON.stringify(form[key]) !== JSON.stringify(loaded.form[key]));

  if (sameFreq && !changed("interval", "byweekday", "bymonthday", "endMode", "count", "until")) {
    return loaded.rule;
  }

  const opts: Partial<Options> = sameFreq ? { ...parseRRule(loaded.rule!) } : {};
  opts.freq = FREQUENCIES[form.freq];

  if (changed("interval")) {
    const interval = Math.max(1, form.interval || 1);
    if (interval > 1) opts.interval = interval;
    else delete opts.interval;
  }
  if (form.freq === "weekly" && changed("byweekday")) {
    if (form.byweekday.length) opts.byweekday = [...form.byweekday].sort((a, b) => a - b);
    else delete opts.byweekday;
  }
  if (form.freq === "monthly" && changed("bymonthday")) {
    if (form.bymonthday) opts.bymonthday = form.bymonthday;
    else delete opts.bymonthday;
  }
  if (changed("endMode", "count", "until")) {
    delete opts.count;
    delete opts.until;
    if (form.endMode === "count") opts.count = Math.max(1, form.count || 1);
    else if (form.endMode === "until" && form.until) opts.until = dateKeyToUntil(form.until);
  }
  return optionsToRRule(opts);
}
