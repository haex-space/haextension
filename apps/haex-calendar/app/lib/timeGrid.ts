import type { SelectEvent } from "~/database/schemas";
import { addDays, inclusiveEndKey, parseLocalDate, toLocalDateKey } from "~/lib/dates";

export interface PositionedEvent {
  event: SelectEvent;
  top: number;      // Percentage from top (0-100)
  height: number;   // Percentage height
  left: number;     // Percentage from left within the day column (0-100)
  width: number;    // Percentage width within the day column
}

const MINUTES_IN_DAY = 24 * 60;

/**
 * Convert a datetime string to minutes since midnight.
 */
function toMinutesSinceMidnight(dtstring: string): number {
  const date = new Date(dtstring);
  return date.getHours() * 60 + date.getMinutes();
}

/** Local date key of a stored value: date-only values as-is, instants in local time. */
export function toDateKey(dtstring: string): string {
  return dtstring.includes("T") ? toLocalDateKey(new Date(dtstring)) : dtstring.slice(0, 10);
}

/** Last local day a timed event touches; an end at midnight belongs to the day before. */
function lastTimedDayKey(event: SelectEvent): string {
  const start = new Date(event.dtstart);
  const end = new Date(event.dtend);
  return toLocalDateKey(end > start ? new Date(end.getTime() - 1) : start);
}

/**
 * The part of a timed event that falls on `dayKey`, in minutes since midnight.
 * Multi-day events start at 0 on later days and end at 1440 on earlier ones.
 */
function segmentOnDay(event: SelectEvent, dayKey: string): { start: number; end: number } {
  const start = toDateKey(event.dtstart) < dayKey ? 0 : toMinutesSinceMidnight(event.dtstart);
  const end = toDateKey(event.dtend) > dayKey ? MINUTES_IN_DAY : toMinutesSinceMidnight(event.dtend);
  return { start, end: Math.max(end, start + 15) }; // Minimum 15min display
}

/**
 * Position events in a single day column, handling overlaps.
 * Returns positioned events with top/height/left/width as percentages.
 */
export function positionEventsInDay(dayEvents: SelectEvent[], dayKey: string): PositionedEvent[] {
  if (dayEvents.length === 0) return [];

  const segments = dayEvents.map((event) => ({ event, ...segmentOnDay(event, dayKey) }));
  // Sort by start time, then by duration (longer first)
  segments.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  // Assign columns for overlapping events
  const columns: (typeof segments)[] = [];
  for (const segment of segments) {
    const column = columns.find((col) => col[col.length - 1]!.end <= segment.start);
    if (column) column.push(segment);
    else columns.push([segment]);
  }

  const totalColumns = columns.length;
  return columns.flatMap((column, colIndex) =>
    column.map(({ event, start, end }) => ({
      event,
      top: (start / MINUTES_IN_DAY) * 100,
      height: ((end - start) / MINUTES_IN_DAY) * 100,
      left: (colIndex / totalColumns) * 100,
      width: (1 / totalColumns) * 100,
    })),
  );
}

/**
 * Whether an event is shown on `dateKey`. All-day ends are exclusive (CalDAV
 * convention); a zero-length legacy all-day row still covers its start day.
 */
export function eventSpansDate(event: SelectEvent, dateKey: string): boolean {
  if (event.allDay) {
    return dateKey >= event.dtstart.slice(0, 10) && dateKey <= inclusiveEndKey(event.dtstart, event.dtend);
  }
  return dateKey >= toDateKey(event.dtstart) && dateKey <= lastTimedDayKey(event);
}

/**
 * Group events by date key for the week/day grid.
 * Multi-day timed events appear on each day they span.
 */
export function groupEventsByDay(eventList: SelectEvent[]): Map<string, SelectEvent[]> {
  const map = new Map<string, SelectEvent[]>();
  for (const event of eventList) {
    if (event.allDay) continue; // All-day events handled separately
    const lastKey = lastTimedDayKey(event);
    for (let day = parseLocalDate(toDateKey(event.dtstart)); toLocalDateKey(day) <= lastKey; day = addDays(day, 1)) {
      const key = toLocalDateKey(day);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
  }
  return map;
}

/**
 * Filter all-day events from a list.
 */
export function getAllDayEvents(eventList: SelectEvent[]): SelectEvent[] {
  return eventList.filter((e) => e.allDay);
}

/** First and last local day an event covers (all-day ends are exclusive). */
export function eventDayRange(event: SelectEvent): { first: string; last: string } {
  if (event.allDay) {
    return { first: event.dtstart.slice(0, 10), last: inclusiveEndKey(event.dtstart, event.dtend) };
  }
  return { first: toDateKey(event.dtstart), last: lastTimedDayKey(event) };
}

export interface DayBar {
  event: SelectEvent;
  startCol: number;
  span: number;
  row: number;
}

/**
 * Lay out multi-day bars over a row of visible day keys (ascending; hidden
 * weekend days are simply absent). Each bar takes the first free row.
 */
export function packBars(events: SelectEvent[], dayKeys: string[]): { bars: DayBar[]; rowCount: number } {
  const placed = events
    .map((event) => ({ event, ...eventDayRange(event) }))
    .sort((a, b) => a.first.localeCompare(b.first) || b.last.localeCompare(a.last));

  const bars: DayBar[] = [];
  for (const { event, first, last } of placed) {
    const startCol = dayKeys.findIndex((key) => key >= first);
    if (startCol === -1 || dayKeys[startCol]! > last) continue;
    let endCol = startCol;
    while (endCol + 1 < dayKeys.length && dayKeys[endCol + 1]! <= last) endCol++;
    const span = endCol - startCol + 1;

    let row = 0;
    while (bars.some((bar) => bar.row === row && bar.startCol < startCol + span && startCol < bar.startCol + bar.span)) {
      row++;
    }
    bars.push({ event, startCol, span, row });
  }
  return { bars, rowCount: bars.reduce((max, bar) => Math.max(max, bar.row + 1), 0) };
}
