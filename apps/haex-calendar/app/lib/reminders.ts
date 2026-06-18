/**
 * Reminder offsets are stored as a single integer: minutes BEFORE the event.
 * The UI lets the user pick a value + unit (minutes/hours/days/weeks); these
 * helpers convert between the two and render a compact preview ("1w", "2d").
 */

export type ReminderUnit = "minute" | "hour" | "day" | "week";

export const REMINDER_UNIT_MINUTES: Record<ReminderUnit, number> = {
  minute: 1,
  hour: 60,
  day: 1440,
  week: 10080,
};

export const REMINDER_UNITS: ReminderUnit[] = ["minute", "hour", "day", "week"];

/** Compact suffix per unit, locale-neutral (used in list previews). */
const UNIT_SUFFIX: Record<ReminderUnit, string> = {
  minute: "m",
  hour: "h",
  day: "d",
  week: "w",
};

export function offsetToMinutes(value: number, unit: ReminderUnit): number {
  return Math.max(0, Math.round(value)) * REMINDER_UNIT_MINUTES[unit];
}

/**
 * Split a minutes offset into the largest unit that divides it evenly, so
 * 10080 → { value: 1, unit: "week" } and 90 → { value: 90, unit: "minute" }.
 */
export function minutesToOffset(minutes: number): { value: number; unit: ReminderUnit } {
  if (minutes <= 0) return { value: 0, unit: "minute" };
  for (const unit of ["week", "day", "hour"] as ReminderUnit[]) {
    const factor = REMINDER_UNIT_MINUTES[unit];
    if (minutes % factor === 0) return { value: minutes / factor, unit };
  }
  return { value: minutes, unit: "minute" };
}

/** Compact label for a single offset, e.g. "1w", "2d", "30m". */
export function formatReminderShort(minutes: number): string {
  const { value, unit } = minutesToOffset(minutes);
  return `${value}${UNIT_SUFFIX[unit]}`;
}

/** Compact, sorted summary of several offsets, e.g. "1w, 1d". */
export function formatRemindersShort(offsets: number[]): string {
  return [...offsets]
    .sort((a, b) => a - b)
    .map(formatReminderShort)
    .join(", ");
}
