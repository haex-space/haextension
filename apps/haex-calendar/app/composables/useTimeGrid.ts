import type { SelectEvent } from "~/database/schemas";

export interface PositionedEvent {
  event: SelectEvent;
  top: number;      // Percentage from top (0-100)
  height: number;   // Percentage height
  left: number;     // Percentage from left within the day column (0-100)
  width: number;    // Percentage width within the day column
}

const HOURS_IN_DAY = 24;
const MINUTES_IN_DAY = HOURS_IN_DAY * 60;

/**
 * Convert a datetime string to minutes since midnight.
 */
function toMinutesSinceMidnight(dtstring: string): number {
  const date = new Date(dtstring);
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Get the date string (YYYY-MM-DD) from a datetime string.
 */
export function toDateKey(dtstring: string): string {
  return dtstring.split("T")[0] ?? dtstring.slice(0, 10);
}

/**
 * Position events in a single day column, handling overlaps.
 * Returns positioned events with top/height/left/width as percentages.
 */
export function positionEventsInDay(dayEvents: SelectEvent[]): PositionedEvent[] {
  if (dayEvents.length === 0) return [];

  // Sort by start time, then by duration (longer first)
  const sorted = [...dayEvents].sort((a, b) => {
    const startDiff = toMinutesSinceMidnight(a.dtstart) - toMinutesSinceMidnight(b.dtstart);
    if (startDiff !== 0) return startDiff;
    // Longer events first
    const aDuration = toMinutesSinceMidnight(a.dtend) - toMinutesSinceMidnight(a.dtstart);
    const bDuration = toMinutesSinceMidnight(b.dtend) - toMinutesSinceMidnight(b.dtstart);
    return bDuration - aDuration;
  });

  // Assign columns for overlapping events
  const columns: { end: number; event: SelectEvent }[][] = [];

  for (const event of sorted) {
    const startMin = toMinutesSinceMidnight(event.dtstart);
    const endMin = Math.max(toMinutesSinceMidnight(event.dtend), startMin + 15); // Minimum 15min display

    let placed = false;
    for (const col of columns) {
      const lastInCol = col[col.length - 1];
      if (lastInCol && lastInCol.end <= startMin) {
        col.push({ end: endMin, event });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([{ end: endMin, event }]);
    }
  }

  const totalColumns = columns.length;

  // Build positioned events
  const result: PositionedEvent[] = [];
  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    for (const { event } of columns[colIndex]!) {
      const startMin = toMinutesSinceMidnight(event.dtstart);
      const endMin = Math.max(toMinutesSinceMidnight(event.dtend), startMin + 15);

      result.push({
        event,
        top: (startMin / MINUTES_IN_DAY) * 100,
        height: ((endMin - startMin) / MINUTES_IN_DAY) * 100,
        left: (colIndex / totalColumns) * 100,
        width: (1 / totalColumns) * 100,
      });
    }
  }

  return result;
}

/**
 * Group events by date key for the week/day grid.
 */
export function groupEventsByDay(eventList: SelectEvent[]): Map<string, SelectEvent[]> {
  const map = new Map<string, SelectEvent[]>();
  for (const event of eventList) {
    if (event.allDay) continue; // All-day events handled separately
    const key = toDateKey(event.dtstart);
    const existing = map.get(key) ?? [];
    existing.push(event);
    map.set(key, existing);
  }
  return map;
}

/**
 * Filter all-day events from a list.
 */
export function getAllDayEvents(eventList: SelectEvent[]): SelectEvent[] {
  return eventList.filter((e) => e.allDay);
}

/**
 * Composable for time grid calculations.
 */
export function useTimeGrid() {
  return {
    positionEventsInDay,
    groupEventsByDay,
    getAllDayEvents,
    toDateKey,
    toMinutesSinceMidnight,
  };
}
