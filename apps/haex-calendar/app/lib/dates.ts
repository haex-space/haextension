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
