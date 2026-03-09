import type { SelectEvent } from "~/database/schemas";

/**
 * Calculate new dtstart/dtend when an event is moved to a new time slot.
 * @param event - The original event
 * @param newDate - The target date
 * @param newStartMinutes - Minutes since midnight for the new start
 * @param hourHeight - Pixel height of one hour
 */
export function calculateNewTimes(
  event: SelectEvent,
  newDate: Date,
  newStartMinutes: number
): { dtstart: string; dtend: string } {
  // Calculate original duration
  const originalStart = new Date(event.dtstart);
  const originalEnd = new Date(event.dtend);
  const durationMs = originalEnd.getTime() - originalStart.getTime();

  // Build new start
  const newStart = new Date(newDate);
  newStart.setHours(Math.floor(newStartMinutes / 60));
  newStart.setMinutes(newStartMinutes % 60);
  newStart.setSeconds(0, 0);

  // Preserve duration
  const newEnd = new Date(newStart.getTime() + durationMs);

  return {
    dtstart: newStart.toISOString(),
    dtend: newEnd.toISOString(),
  };
}

/**
 * Snap a pixel Y position to the nearest 15-minute interval.
 */
export function snapToGrid(y: number, hourHeight: number): number {
  const minutesPerPixel = 60 / hourHeight;
  const totalMinutes = y * minutesPerPixel;
  const snapped = Math.round(totalMinutes / 15) * 15;
  return snapped;
}
