import { and, or, gte, lte, inArray, isNotNull, eq, notLike } from "drizzle-orm";
import {
  events,
  eventReminders,
  type InsertEvent,
  type SelectEvent,
} from "~/database/schemas";
import { FULL_CALENDARS_TABLE, FULL_EVENTS_TABLE } from "~/stores/calendars";
import {
  addDays,
  daysBetween,
  eventSpan,
  normalizeOffsetlessDateTime,
  parseEventInstant,
  parseLocalDate,
  toLocalDateKey,
} from "~/lib/dates";
import { expandOccurrences, nextOccurrence, pinCount } from "~/lib/rrule";

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

  function widenIso(iso: string, days: number): string {
    return addDays(new Date(iso), days).toISOString();
  }

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
      // Load events overlapping the range, PLUS every master that needs
      // out-of-range loading to be expandable into the current view:
      //  - events with their own RRULE (a yearly birthday whose master sits
      //    at its original date, possibly years ago).
      //  - events whose type has a default_rrule (the rrule is inherited).
      // Typed events whose type has NO default_rrule are *not* loaded out of
      // range — they behave like plain events, so the date overlap is the
      // only condition that matters. The old `isNotNull(eventTypeId)` branch
      // pulled the entire history of every typed event on every view change.
      const typeIdsWithRrule = eventTypesStore.types
        .filter((t) => t.defaultRrule)
        .map((t) => t.id);

      visibleEvents.value = await haexVault.orm
        .select()
        .from(events)
        .where(
          and(
            inArray(events.calendarId, calendarIds),
            or(
              // All-day rows hold local dates, which don't compare exactly
              // against UTC bounds; a day of slack on both sides keeps them in,
              // expandedEventsInRange applies the precise check.
              and(lte(events.dtstart, widenIso(end, 1)), gte(events.dtend, widenIso(start, -1))),
              isNotNull(events.rrule),
              typeIdsWithRrule.length > 0
                ? inArray(events.eventTypeId, typeIdsWithRrule)
                : undefined
            )
          )
        );
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Older imports stored zoned times as wall-clock strings without offset.
   * Rewrite them as UTC instants where the stored TZID makes that unambiguous;
   * the rest keeps its value until the next import or CalDAV update.
   */
  async function normalizeLegacyTimesAsync() {
    if (!haexVault.orm) return;
    const rows = await haexVault.orm
      .select({ id: events.id, dtstart: events.dtstart, dtend: events.dtend, timezone: events.timezone })
      .from(events)
      .where(and(eq(events.allDay, false), or(notLike(events.dtstart, "%Z"), notLike(events.dtend, "%Z"))));

    for (const row of rows) {
      const dtstart = row.dtstart.endsWith("Z") ? row.dtstart : normalizeOffsetlessDateTime(row.dtstart, row.timezone);
      const dtend = row.dtend.endsWith("Z") ? row.dtend : normalizeOffsetlessDateTime(row.dtend, row.timezone);
      if (!dtstart || !dtend) continue;
      await haexVault.orm.update(events).set({ dtstart, dtend }).where(eq(events.id, row.id));
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

      const span = eventSpan(event);
      if (!rule) {
        if (span.start <= end && span.end > start) result.push(event);
        continue;
      }

      // Occurrences that begin before the range can still reach into it.
      const duration = span.end.getTime() - span.start.getTime();
      const from = new Date(start.getTime() - duration);
      for (const occ of expandOccurrences(rule, span.start, from, end)) {
        const boundaries = shiftedBoundaries(event, occ);
        if (eventSpan({ ...boundaries, allDay: event.allDay }).end > start) {
          result.push({ ...event, ...boundaries, occurrenceStart: occ.toISOString() });
        }
      }
    }

    return result;
  }

  /**
   * dtstart/dtend of an occurrence starting at `occ`, keeping the master's
   * duration (whole days for all-day events, so DST doesn't shift the end).
   */
  function shiftedBoundaries(event: SelectEvent, occ: Date): { dtstart: string; dtend: string } {
    if (event.allDay) {
      const days = Math.max(0, daysBetween(parseLocalDate(event.dtstart), parseLocalDate(event.dtend)));
      return { dtstart: toLocalDateKey(occ), dtend: toLocalDateKey(addDays(occ, days)) };
    }
    const durationMs = Math.max(0, new Date(event.dtend).getTime() - new Date(event.dtstart).getTime());
    return { dtstart: occ.toISOString(), dtend: new Date(occ.getTime() + durationMs).toISOString() };
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
    if (isRemoteCalendar(data.calendarId)) {
      const caldavSync = useCaldavSyncStore();
      try {
        await caldavSync.pushEventAsync(id);
      } catch (err) {
        caldavSync.reportRemoteFailure(data.calendarId, "push", err);
      }
    }

    await loadEventsAsync();
    return id;
  }

  /** The stored row, independent of the currently loaded view range. */
  async function findEventAsync(id: string): Promise<SelectEvent | undefined> {
    if (!haexVault.orm) return undefined;
    const [row] = await haexVault.orm.select().from(events).where(eq(events.id, id)).limit(1);
    return row;
  }

  function isRemoteCalendar(calendarId: string) {
    return !!calendarsStore.getCalendar(calendarId)?.caldavAccountId;
  }

  async function updateEventAsync(
    id: string,
    data: Partial<Omit<InsertEvent, "id" | "uid">> & { reminderOffsets?: number[] },
  ) {
    if (!haexVault.orm) return;

    const { reminderOffsets, ...eventData } = data;

    const existing = await findEventAsync(id);
    if (!existing) return;

    // SEQUENCE grows on every local change (CalDAV standard); an import may
    // hand in a higher remote value, which must not be lowered.
    const sequence = Math.max(existing.sequence + 1, eventData.sequence ?? 0);

    // The old resource belongs to the previous calendar's collection. Leaving
    // href/etag in place would push into the wrong collection, and the
    // leftover remote copy would come back as a second event with the same UID.
    const movedCalendar =
      eventData.calendarId !== undefined && eventData.calendarId !== existing.calendarId;
    if (movedCalendar && existing.href && isRemoteCalendar(existing.calendarId)) {
      const caldavSync = useCaldavSyncStore();
      try {
        await caldavSync.deleteRemoteEventAsync(existing);
      } catch (err) {
        caldavSync.reportRemoteFailure(existing.calendarId, "delete", err);
      }
    }

    await haexVault.orm
      .update(events)
      .set({
        ...eventData,
        sequence,
        ...(movedCalendar ? { href: null, etag: null } : {}),
      })
      .where(eq(events.id, id));

    // `undefined` leaves reminders untouched; an array (incl. empty) replaces them.
    if (reminderOffsets !== undefined) {
      await replaceEventRemindersAsync(id, reminderOffsets);
    }

    const targetCalendarId = eventData.calendarId ?? existing.calendarId;
    if (isRemoteCalendar(targetCalendarId)) {
      const caldavSync = useCaldavSyncStore();
      try {
        await caldavSync.pushEventAsync(id);
      } catch (err) {
        caldavSync.reportRemoteFailure(targetCalendarId, "push", err);
      }
    }

    await loadEventsAsync();
  }

  async function deleteEventAsync(id: string) {
    if (!haexVault.orm) return;

    // Delete from CalDAV server first if this is a remote calendar event
    const existing = await findEventAsync(id);
    if (existing?.href && isRemoteCalendar(existing.calendarId)) {
      const caldavSync = useCaldavSyncStore();
      try {
        await caldavSync.deleteRemoteEventAsync(existing);
      } catch (err) {
        caldavSync.reportRemoteFailure(existing.calendarId, "delete", err);
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
      // Advance from the LATER of "now" and the stored dtstart. Otherwise an
      // old master row (e.g. yearly task created in 2020) advances by one
      // occurrence (→ 2021) instead of jumping to the next upcoming one.
      const dtstart = parseEventInstant(ev.dtstart, ev.allDay);
      const cursor = new Date(Math.max(Date.now(), dtstart.getTime()));
      // COUNT is counted from dtstart, which is about to move.
      const pinnedRule = pinCount(rule, dtstart);
      const next = nextOccurrence(pinnedRule, dtstart, cursor);
      if (next) {
        await updateEventAsync(id, {
          ...shiftedBoundaries(ev, next),
          completedAt: null,
          ...(pinnedRule !== rule ? { rrule: pinnedRule, rruleOverride: true } : {}),
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
    normalizeLegacyTimesAsync,
    createEventAsync,
    updateEventAsync,
    deleteEventAsync,
    getEvent,
    findEventAsync,
    completeTaskAsync,
    loadEventRemindersAsync,
    replaceEventRemindersAsync,
    expandedEventsInRange,
    effectiveRrule,
  };
});
