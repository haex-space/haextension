import { exclusiveEndKey, inclusiveEndKey, toLocalDateKey } from "~/lib/dates";
import type { EventDrawerInitialValues } from "~/stores/eventDrawer";

/**
 * Form state of the EventDrawer: loads an existing event (or initialValues
 * for a new one) into the form and writes it back on save.
 */
export function useEventForm(
  props: { eventId?: string | null; initialValues?: EventDrawerInitialValues | null },
  isOpen: Ref<boolean>,
) {
  const eventsStore = useEventsStore();
  const calendarsStore = useCalendarsStore();
  const eventTypesStore = useEventTypesStore();

  const form = reactive({
    summary: "",
    kind: "event" as "event" | "task",
    startDate: "",
    endDate: "",
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    location: "",
    status: "CONFIRMED",
    color: null as string | null,
    colorOverride: false,
    categories: "",
    url: "",
    description: "",
    calendarId: calendarsStore.calendars[0]?.id ?? "",
    eventTypeId: null as string | null,
    reminderOffsets: [] as number[],
    rrule: null as string | null,
    rruleOverride: false,
  });

  /** UI flag: the event has its own reminders (overrides the type defaults). */
  const remindersOverridden = ref(false);

  const hasType = computed(() => !!form.eventTypeId);

  // Guard for the eventTypeId watcher: kept false during the watch-load Object.assign
  // so the initial load doesn't get treated as a user-driven type switch.
  let typeWatcherArmed = false;

  watch(
    () => form.eventTypeId,
    (newTypeId) => {
      if (!typeWatcherArmed) return;
      const type = newTypeId ? eventTypesStore.getType(newTypeId) : undefined;

      // Inherited rrule follows the new type's default — keep user overrides intact.
      if (!form.rruleOverride) {
        form.rrule = type?.defaultRrule ?? null;
      }
      // Inherited reminders: only refresh when the user hasn't overridden them.
      // form.reminderOffsets stays empty while inherited (the read path applies
      // the type defaults), so just keep it empty.
      if (!remindersOverridden.value) {
        form.reminderOffsets = [];
      }
      // Inherited colour follows the new type's color.
      if (!form.colorOverride) {
        form.color = null;
      }
    },
  );

  /**
   * {date, time} pair the form shows for a stored boundary. All-day ends are
   * stored exclusive but shown as the event's last day.
   */
  function toFormPair(dt: string, allDay: boolean, defaultTime: string): { date: string; time: string } {
    if (allDay) return { date: dt.slice(0, 10), time: defaultTime };
    const d = new Date(dt);
    const pad = (n: number) => String(n).padStart(2, "0");
    return { date: toLocalDateKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }

  function toFormRange(dtstart: string, dtend: string, allDay: boolean) {
    const start = toFormPair(dtstart, allDay, "09:00");
    const end = allDay
      ? { date: inclusiveEndKey(start.date, dtend), time: "10:00" }
      : toFormPair(dtend, false, "10:00");
    return { start, end };
  }

  // Load event data when eventId changes
  watch(
    () => [props.eventId, props.initialValues] as const,
    async ([id, initial]) => {
      if (!id) {
        // New-event mode: start from defaults, then layer initialValues on top.
        // Date/time form fields are derived from the optional dtstart/dtend.
        const { start: startPair, end: endPair } =
          initial?.dtstart && initial.dtend
            ? toFormRange(initial.dtstart, initial.dtend, !!initial.allDay)
            : { start: { date: "", time: "09:00" }, end: { date: "", time: "10:00" } };

        Object.assign(form, {
          summary: initial?.summary ?? "",
          kind: initial?.kind ?? "event",
          startDate: startPair.date,
          endDate: endPair.date,
          startTime: startPair.time,
          endTime: endPair.time,
          allDay: initial?.allDay ?? false,
          location: initial?.location ?? "",
          status: "CONFIRMED",
          color: null,
          colorOverride: false,
          categories: "",
          url: "",
          description: initial?.description ?? "",
          calendarId: initial?.calendarId ?? calendarsStore.calendars[0]?.id ?? "",
          eventTypeId: null,
          reminderOffsets: initial?.reminderOffsets ?? [],
          rrule: initial?.rrule ?? null,
          rruleOverride: !!initial?.rrule,
        });
        remindersOverridden.value = (initial?.reminderOffsets?.length ?? 0) > 0;
        typeWatcherArmed = true;
        return;
      }

      const event = eventsStore.getEvent(id);
      if (!event) return;

      const { start, end } = toFormRange(event.dtstart, event.dtend, event.allDay);

      const ownReminders = await eventsStore.loadEventRemindersAsync(id);

      // Disarm the eventTypeId watcher during load — it would otherwise treat
      // the initial assignment as a "user switched type" event and overwrite
      // the just-loaded rrule/reminders with the type defaults.
      typeWatcherArmed = false;
      Object.assign(form, {
        summary: event.summary,
        kind: event.kind === "task" ? "task" : "event",
        startDate: start.date,
        endDate: end.date,
        startTime: start.time,
        endTime: end.time,
        allDay: event.allDay,
        location: event.location ?? "",
        status: event.status,
        // While inheriting, leave form.color empty so the picker shows nothing
        // highlighted — pre-filling with a stale stored value (e.g. the type's
        // colour copied at some earlier save) would mislead the user into
        // thinking they had picked it themselves.
        color: event.colorOverride ? event.color : null,
        colorOverride: !!event.colorOverride,
        categories: event.categories ?? "",
        url: event.url ?? "",
        description: event.description ?? "",
        calendarId: event.calendarId,
        eventTypeId: event.eventTypeId ?? null,
        reminderOffsets: ownReminders,
        rrule: event.rrule ?? null,
        rruleOverride: !!event.rruleOverride,
      });
      remindersOverridden.value = ownReminders.length > 0;
      await nextTick();
      typeWatcherArmed = true;
    },
    { immediate: true }
  );

  async function handleSave() {
    if (!form.summary.trim()) return;

    const dtstart = form.allDay
      ? form.startDate
      : new Date(`${form.startDate}T${form.startTime}`).toISOString();
    // Tasks have no end — dtend mirrors dtstart (the due moment).
    let dtend: string;
    if (form.kind === "task") dtend = dtstart;
    else if (form.allDay) dtend = exclusiveEndKey(form.startDate, form.endDate || form.startDate);
    else {
      const end = new Date(`${form.endDate || form.startDate}T${form.endTime}`).toISOString();
      dtend = end < dtstart ? dtstart : end;
    }

    // Override resolution (per field):
    //  - rrule:     with a type, the override flag decides; without a type a set
    //               rule is always an override (otherwise it would never apply).
    //  - reminders: own rows win; empty → inherit the type defaults.
    const rruleOverrideEff = hasType.value ? form.rruleOverride : !!form.rrule;
    const rruleEff = rruleOverrideEff ? form.rrule || null : null;
    const reminderOffsetsEff =
      hasType.value && !remindersOverridden.value ? [] : [...form.reminderOffsets];

    const data = {
      summary: form.summary.trim(),
      kind: form.kind,
      dtstart,
      dtend,
      allDay: form.allDay,
      location: form.location || null,
      status: form.status,
      color: form.color,
      colorOverride: form.colorOverride,
      categories: form.categories || null,
      url: form.url || null,
      description: form.description || null,
      calendarId: form.calendarId,
      eventTypeId: form.eventTypeId,
      rrule: rruleEff,
      rruleOverride: rruleOverrideEff,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sequence: 0,
      reminderOffsets: reminderOffsetsEff,
    };

    if (props.eventId) {
      await eventsStore.updateEventAsync(props.eventId, data);
    } else {
      await eventsStore.createEventAsync(data);
    }

    isOpen.value = false;
  }

  return { form, remindersOverridden, handleSave };
}
