import { and, gte, lte, inArray, eq } from "drizzle-orm";
import { events, type InsertEvent, type SelectEvent } from "~/database/schemas";
import { FULL_CALENDARS_TABLE, FULL_EVENTS_TABLE } from "~/stores/calendars";

export type { SelectEvent, InsertEvent };

export const useEventsStore = defineStore("events", () => {
  const haexVault = useHaexVaultStore();
  const calendarsStore = useCalendarsStore();
  const calendarView = useCalendarViewStore();

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
      visibleEvents.value = await haexVault.orm
        .select()
        .from(events)
        .where(
          and(
            lte(events.dtstart, end),   // Event starts before range ends
            gte(events.dtend, start),   // Event ends after range starts
            inArray(events.calendarId, calendarIds)
          )
        );
    } finally {
      isLoading.value = false;
    }
  }

  async function createEventAsync(data: Omit<InsertEvent, "id" | "uid" | "createdAt" | "updatedAt">) {
    if (!haexVault.orm) return;
    const id = crypto.randomUUID();
    const uid = `${id}@haex-calendar`;

    await haexVault.orm.insert(events).values({
      ...data,
      id,
      uid,
    });

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

  async function updateEventAsync(id: string, data: Partial<Omit<InsertEvent, "id" | "uid">>) {
    if (!haexVault.orm) return;

    // Increment SEQUENCE on every update (CalDAV standard)
    const existing = visibleEvents.value.find((event) => event.id === id);
    const newSequence = (existing?.sequence ?? 0) + 1;

    await haexVault.orm
      .update(events)
      .set({ ...data, sequence: newSequence })
      .where(eq(events.id, id));

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

  return {
    events: visibleEvents,
    isLoading,
    loadEventsAsync,
    createEventAsync,
    updateEventAsync,
    deleteEventAsync,
    getEvent,
  };
});
