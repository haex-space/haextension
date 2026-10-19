/**
 * Date helpers shared by the views, the store and the iCal mapping.
 *
 * Storage convention: timed events hold UTC ISO instants ("…Z"), all-day
 * events hold local calendar dates ("YYYY-MM-DD") with an exclusive end.
 */

export interface WallClock {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const MS_PER_DAY = 86_400_000;

function createZoneFormatter(timeZone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return null;
  }
}

/** Offset of the formatter's zone from UTC at `instant`, in ms (positive east of UTC). */
function zoneOffsetMs(formatter: Intl.DateTimeFormat, instant: number): number {
  const parts = formatter.formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

function wallAsUtcMs(wall: WallClock): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

/**
 * All instants at which `timeZone` shows the wall clock: one normally, two in
 * the repeated hour when clocks go back, none in the skipped hour when they go
 * forward. Null when the zone is unknown.
 */
export function zonedWallClockCandidates(wall: WallClock, timeZone: string): Date[] | null {
  const formatter = createZoneFormatter(timeZone);
  if (!formatter) return null;

  const wallMs = wallAsUtcMs(wall);
  const instants = new Set<number>();
  // Offsets a day before and after cover both sides of any transition.
  for (const probe of [wallMs - MS_PER_DAY, wallMs, wallMs + MS_PER_DAY]) {
    const instant = wallMs - zoneOffsetMs(formatter, probe);
    if (zoneOffsetMs(formatter, instant) === wallMs - instant) instants.add(instant);
  }
  return [...instants].sort((a, b) => a - b).map((instant) => new Date(instant));
}

/**
 * Wall clock in `timeZone` → instant, resolved like RFC 5545 §3.3.5: the first
 * of two repeated times, and the offset from before a skipped hour.
 */
export function zonedWallClockToDate(wall: WallClock, timeZone: string): Date | null {
  const formatter = createZoneFormatter(timeZone);
  if (!formatter) return null;
  const candidates = zonedWallClockCandidates(wall, timeZone) ?? [];
  if (candidates[0]) return candidates[0];
  const wallMs = wallAsUtcMs(wall);
  return new Date(wallMs - zoneOffsetMs(formatter, wallMs - MS_PER_DAY));
}

const OFFSETLESS_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Rewrite a stored date-time that lacks an offset (written by older imports)
 * as a UTC instant. Only when `timeZone` names a known zone and the wall clock
 * maps to exactly one instant; otherwise null and the value is left alone.
 */
export function normalizeOffsetlessDateTime(value: string, timeZone: string): string | null {
  const match = OFFSETLESS_DATE_TIME.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const candidates = zonedWallClockCandidates(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second ?? 0),
    },
    timeZone,
  );
  if (candidates?.length !== 1) return null;
  return candidates[0]!.toISOString();
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local calendar date of `date` as "YYYY-MM-DD". */
export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local midnight of a "YYYY-MM-DD" key (time parts are ignored). */
export function parseLocalDate(key: string): Date {
  const [year, month, day] = key.slice(0, 10).split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

/**
 * Instant of a stored event boundary. All-day values are local dates; parsing
 * them with `new Date("YYYY-MM-DD")` would yield UTC midnight, which is the
 * previous day west of UTC.
 */
export function parseEventInstant(value: string, allDay: boolean): Date {
  return allDay ? parseLocalDate(value) : new Date(value);
}

/** `date` moved by whole local calendar days (DST-safe, unlike adding 24h). */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Whole local calendar days from `from` to `to`. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/** Last day of an all-day event, from its stored (exclusive) end. */
export function inclusiveEndKey(startKey: string, exclusiveEnd: string): string {
  const last = toLocalDateKey(addDays(parseLocalDate(exclusiveEnd), -1));
  return last < startKey ? startKey : last;
}

/** Stored (exclusive) end of an all-day event whose last day is `lastDayKey`. */
export function exclusiveEndKey(startKey: string, lastDayKey: string): string {
  const last = lastDayKey < startKey ? startKey : lastDayKey;
  return toLocalDateKey(addDays(parseLocalDate(last), 1));
}

/**
 * [start, end) of a stored event as instants. All-day events cover whole
 * local days (at least one, also for zero-length legacy rows).
 */
export function eventSpan(event: { dtstart: string; dtend: string; allDay: boolean }): { start: Date; end: Date } {
  if (!event.allDay) return { start: new Date(event.dtstart), end: new Date(event.dtend) };
  return {
    start: parseLocalDate(event.dtstart),
    end: addDays(parseLocalDate(inclusiveEndKey(event.dtstart, event.dtend)), 1),
  };
}
