import { and, or, gte, lte, inArray, isNotNull, eq } from "drizzle-orm";
import {
  events,
  eventReminders,
  type InsertEvent,
  type SelectEvent,
} from "~/database/schemas";
import { FULL_CALENDARS_TABLE, FULL_EVENTS_TABLE } from "~/stores/calendars";
import { expandOccurrences, nextOccurrence } from "~/lib/rrule";

export type { SelectEvent, InsertEvent };

/**
 * A concrete occurrence of an event in a view. For recurring events the same
 * master row yields several of these (one per occurrence); `occurrenceStart`
 * distinguishes them. The `id` always stays the master id, so editing/deleting
 * an occurrence affects the whole series (single-instance edits are out of
 * scope for v1).
 */
export type ExpandedEvent = SelectEvent & { occurrenceStart?: string };

/** Event payload accepted by create/update, plus optional own reminders. */
export type EventInput = Omit<InsertEvent, "id" | "uid" | "createdAt" | "updatedAt"> & {
  /**
   * Per-event reminder offsets (minutes before). Non-empty → overrides the
   * type defaults. Empty array → clears own reminders (inherit type defaults).
   * `undefined` → leave existing reminders untouched (update only).
   */
  reminderOffsets?: number[];
};

export const useEventsStore = defineStore("events", () => {
  const haexVault = useHaexVaultStore();
  const calendarsStore = useCalendarsStore();
  const calendarView = useCalendarViewStore();
  const eventTypesStore = useEventTypesStore();
  const settingsStore = useSettingsStore();

  // Raw master rows loaded from the DB. Views consume the expanded list
  // (`events` below); this stays the source of truth for lookups/edits.
  const visibleEvents = ref<SelectEvent[]>([]);
  const isLoading = ref(false);

  /**
   * Load events for the current visible range and visible calendars.
   * Called reactively when visibleRange or visibleCalendarIds change.
   */
  async function loadEventsAsync() {
    if (!haexVault.orm) return;
    const { start, end } = calendarView.visibleRange;
    const calendarIds = calendarsStore.visibleCalendarIds;
    if (calendarIds.length === 0) {
      visibleEvents.value = [];
      return;
    }

    isLoading.value = true;
    try {
      // Load events overlapping the range, PLUS every recurring/typed master
      // regardless of its own date — a yearly birthday's master row sits at its
      // original date (possibly years ago) and must still be expanded into the
      // current view. A typed event may inherit a default rrule from its type.
      visibleEvents.value = await haexVault.orm
        .select()
        .from(events)
        .where(
          and(
            inArray(events.calendarId, calendarIds),
            or(
              and(
                lte(events.dtstart, end), // starts before range ends
                gte(events.dtend, start)  // ends after range starts
              ),
              isNotNull(events.rrule),
              isNotNull(events.eventTypeId)
            )
          )
        );
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Effective RRULE for an event after override resolution:
   *  - rrule_override = 1 → the event's own rrule wins (even when null).
   *  - otherwise → the type's default_rrule (if a type is set), else null.
   */
  function effectiveRrule(event: SelectEvent): string | null {
    if (event.rruleOverride) return event.rrule ?? null;
    const type = eventTypesStore.getType(event.eventTypeId);
    return type?.defaultRrule ?? null;
  }

  /**
   * Expand master rows into concrete occurrences within [start, end].
   * Non-recurring events are included when they overlap the range; recurring
   * ones are materialised per occurrence via rrule.js (nothing is persisted).
   */
  function expandedEventsInRange(start: Date, end: Date): ExpandedEvent[] {
    const result: ExpandedEvent[] = [];
    const hideCompleted = !settingsStore.showCompletedTasks;

    for (const event of visibleEvents.value) {
      // Respect the "show completed tasks" setting.
      if (hideCompleted && event.kind === "task" && event.completedAt) continue;

      const rule = effectiveRrule(event);

      if (!rule) {
        const s = new Date(event.dtstart);
        const e = new Date(event.dtend);
        if (s <= end && e >= start) result.push(event);
        continue;
      }

      const baseStart = new Date(event.dtstart);
      const baseEnd = new Date(event.dtend);
      const durationMs = Math.max(0, baseEnd.getTime() - baseStart.getTime());

      for (const occ of expandOccurrences(rule, baseStart, start, end)) {
        const occEnd = new Date(occ.getTime() + durationMs);
        const dtstart = event.allDay
          ? toDateOnly(occ)
          : occ.toISOString();
        const dtend = event.allDay ? toDateOnly(occEnd) : occEnd.toISOString();
        result.push({ ...event, dtstart, dtend, occurrenceStart: occ.toISOString() });
      }
    }

    return result;
  }

  /** Local YYYY-MM-DD (for all-day occurrence date strings). */
  function toDateOnly(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** Occurrences for the currently visible range — what the views render. */
  const expandedEvents = computed<ExpandedEvent[]>(() => {
    const { start, end } = calendarView.visibleRange;
    return expandedEventsInRange(new Date(start), new Date(end));
  });

  /** Replace an event's own reminder rows with the given offsets. */
  async function replaceEventRemindersAsync(eventId: string, offsets: number[]) {
    if (!haexVault.orm) return;
    await haexVault.orm.delete(eventReminders).where(eq(eventReminders.eventId, eventId));
    for (const offsetMinutes of offsets) {
      await haexVault.orm.insert(eventReminders).values({
        id: crypto.randomUUID(),
        eventId,
        offsetMinutes,
      });
    }
  }

  /** Load an event's own reminder offsets (sorted). */
  async function loadEventRemindersAsync(eventId: string): Promise<number[]> {
    if (!haexVault.orm) return [];
    const rows = await haexVault.orm
      .select()
      .from(eventReminders)
      .where(eq(eventReminders.eventId, eventId));
    return rows.map((r) => r.offsetMinutes).sort((a, b) => a - b);
  }

  async function createEventAsync(data: EventInput) {
    if (!haexVault.orm) return;
    const id = crypto.randomUUID();
    const uid = `${id}@haex-calendar`;

    const { reminderOffsets, ...eventData } = data;

    await haexVault.orm.insert(events).values({
      ...eventData,
      id,
      uid,
    });

    if (reminderOffsets && reminderOffsets.length > 0) {
      await replaceEventRemindersAsync(id, reminderOffsets);
    }

    // Auto-assign to shared spaces if the calendar is shared
    try {
      const calendarAssignments = await haexVault.client.spaces.getAssignmentsAsync(
        FULL_CALENDARS_TABLE,
        JSON.stringify({ id: data.calendarId }),
      );
      if (calendarAssignments.length > 0) {
        await haexVault.client.spaces.assignAsync(
          calendarAssignments.map((assignment) => ({
            tableName: FULL_EVENTS_TABLE,
            rowPks: JSON.stringify({ id }),
            spaceId: assignment.spaceId,
            groupId: assignment.groupId,
          })),
        );
      }
    } catch (err) {
      console.warn("[haex-calendar] Failed to auto-assign event to space:", err);
    }

    // Push to CalDAV server if this is a remote calendar
    const calendar = calendarsStore.getCalendar(data.calendarId);
    if (calendar?.caldavAccountId) {
      try {
        const caldavSync = useCaldavSyncStore();
        await caldavSync.pushEventAsync(id);
      } catch (err) {
        console.warn("[haex-calendar] Failed to push new event to CalDAV:", err);
      }
    }

    await loadEventsAsync();
    return id;
  }

  async function updateEventAsync(
    id: string,
    data: Partial<Omit<InsertEvent, "id" | "uid">> & { reminderOffsets?: number[] },
  ) {
    if (!haexVault.orm) return;

    const { reminderOffsets, ...eventData } = data;

    // Increment SEQUENCE on every update (CalDAV standard)
    const existing = visibleEvents.value.find((event) => event.id === id);
    const newSequence = (existing?.sequence ?? 0) + 1;

    await haexVault.orm
      .update(events)
      .set({ ...eventData, sequence: newSequence })
      .where(eq(events.id, id));

    // `undefined` leaves reminders untouched; an array (incl. empty) replaces them.
    if (reminderOffsets !== undefined) {
      await replaceEventRemindersAsync(id, reminderOffsets);
    }

    // Push to CalDAV server if this is a remote calendar event
    if (existing) {
      const calendar = calendarsStore.getCalendar(existing.calendarId);
      if (calendar?.caldavAccountId) {
        try {
          const caldavSync = useCaldavSyncStore();
          await caldavSync.pushEventAsync(id);
        } catch (err) {
          console.warn("[haex-calendar] Failed to push event update to CalDAV:", err);
        }
      }
    }

    await loadEventsAsync();
  }

  async function deleteEventAsync(id: string) {
    if (!haexVault.orm) return;

    // Delete from CalDAV server first if this is a remote calendar event
    const existing = visibleEvents.value.find((event) => event.id === id);
    if (existing) {
      const calendar = calendarsStore.getCalendar(existing.calendarId);
      if (calendar?.caldavAccountId) {
        try {
          const caldavSync = useCaldavSyncStore();
          await caldavSync.deleteRemoteEventAsync(id);
        } catch (err) {
          console.warn("[haex-calendar] Failed to delete event from CalDAV:", err);
        }
      }
    }

    await haexVault.orm.delete(events).where(eq(events.id, id));
    await loadEventsAsync();
  }

  function getEvent(id: string) {
    return visibleEvents.value.find((event) => event.id === id);
  }

  /**
   * Toggle/advance task completion (Things-style):
   *  - Non-recurring: set completed_at = now (or clear it if already done).
   *  - Recurring: advance dtstart to the next occurrence, leave completed_at
   *    null. When the rule is exhausted, mark done and clear the recurrence.
   */
  async function completeTaskAsync(id: string) {
    const ev = visibleEvents.value.find((event) => event.id === id);
    if (!ev || ev.kind !== "task") return;

    const rule = effectiveRrule(ev);

    if (rule) {
      const next = nextOccurrence(rule, new Date(ev.dtstart), new Date(ev.dtstart));
      if (next) {
        const durationMs = Math.max(
          0,
          new Date(ev.dtend).getTime() - new Date(ev.dtstart).getTime(),
        );
        const nextEnd = new Date(next.getTime() + durationMs);
        await updateEventAsync(id, {
          dtstart: ev.allDay ? toDateOnly(next) : next.toISOString(),
          dtend: ev.allDay ? toDateOnly(nextEnd) : nextEnd.toISOString(),
          completedAt: null,
        });
        return;
      }
      // Rule exhausted → done. Clear recurrence (force override so a type
      // default can't re-introduce it).
      await updateEventAsync(id, {
        completedAt: new Date(),
        rrule: null,
        rruleOverride: true,
      });
      return;
    }

    // Non-recurring task: toggle done.
    await updateEventAsync(id, { completedAt: ev.completedAt ? null : new Date() });
  }

  return {
    // `events` is the expanded (per-occurrence) list the views render.
    events: expandedEvents,
    // `rawEvents` is the underlying master rows (for the scheduler/lookups).
    rawEvents: visibleEvents,
    isLoading,
    loadEventsAsync,
    createEventAsync,
    updateEventAsync,
    deleteEventAsync,
    getEvent,
    completeTaskAsync,
    loadEventRemindersAsync,
    replaceEventRemindersAsync,
    expandedEventsInRange,
    effectiveRrule,
  };
});
