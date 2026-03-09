import { and, gte, lte, inArray, eq } from "drizzle-orm";
import { events, type InsertEvent, type SelectEvent } from "~/database/schemas";

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
    await loadEventsAsync();
    return id;
  }

  async function updateEventAsync(id: string, data: Partial<Omit<InsertEvent, "id" | "uid">>) {
    if (!haexVault.orm) return;

    // Increment SEQUENCE on every update (CalDAV standard)
    const existing = visibleEvents.value.find((e) => e.id === id);
    const newSequence = (existing?.sequence ?? 0) + 1;

    await haexVault.orm
      .update(events)
      .set({ ...data, sequence: newSequence })
      .where(eq(events.id, id));
    await loadEventsAsync();
  }

  async function deleteEventAsync(id: string) {
    if (!haexVault.orm) return;
    await haexVault.orm.delete(events).where(eq(events.id, id));
    await loadEventsAsync();
  }

  function getEvent(id: string) {
    return visibleEvents.value.find((e) => e.id === id);
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
