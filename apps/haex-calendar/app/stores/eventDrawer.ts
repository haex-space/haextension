/**
 * Values the EventDrawer accepts when opening for a brand-new event (no ID
 * yet). Used by QuickCreate's "Mehr Details" path: instead of creating the
 * event eagerly and then loading it, the drawer opens in "new" mode with
 * these values pre-filled, and the actual create happens on Save.
 */
export interface EventDrawerInitialValues {
  calendarId?: string;
  summary?: string;
  kind?: "event" | "task";
  dtstart?: string;
  dtend?: string;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  reminderOffsets?: number[];
  rrule?: string | null;
}

export const useEventDrawerStore = defineStore("eventDrawer", () => {
  const isOpen = ref(false);
  const eventId = ref<string | null>(null);
  const initialValues = ref<EventDrawerInitialValues | null>(null);

  function open(id: string) {
    eventId.value = id;
    initialValues.value = null;
    isOpen.value = true;
  }

  /** Open for a new event with pre-filled values (e.g. handed over from QuickCreate). */
  function openNew(values: EventDrawerInitialValues = {}) {
    eventId.value = null;
    initialValues.value = values;
    isOpen.value = true;
  }

  function close() {
    isOpen.value = false;
    eventId.value = null;
    initialValues.value = null;
  }

  // The drawer's v-model:open path sets isOpen directly (Save / Cancel /
  // backdrop click) without going through close(). Clear the per-open
  // payload whenever the drawer transitions to closed so the next open()
  // / openNew() call starts from a clean slate.
  watch(isOpen, (open) => {
    if (!open) {
      eventId.value = null;
      initialValues.value = null;
    }
  });

  return { isOpen, eventId, initialValues, open, openNew, close };
});
