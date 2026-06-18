<template>
  <UiDrawerModal v-model:open="isOpen" :title="isNew ? t('title.new') : t('title.edit')">
    <template #content>
      <div class="space-y-4 p-4">
        <!-- Kind toggle: Termin | Aufgabe -->
        <div class="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            type="button"
            :class="kindButtonClass(form.kind === 'event')"
            @click="form.kind = 'event'"
          >
            {{ t('kind.event') }}
          </button>
          <button
            type="button"
            :class="kindButtonClass(form.kind === 'task')"
            @click="form.kind = 'task'"
          >
            {{ t('kind.task') }}
          </button>
        </div>

        <!-- Summary -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.summary') }}</label>
          <input
            v-model="form.summary"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
          >
        </div>

        <!-- Description -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.description') }}</label>
          <textarea
            v-model="form.description"
            rows="3"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary resize-none"
          />
        </div>

        <!-- All day toggle -->
        <label class="flex items-center gap-2 cursor-pointer">
          <ShadcnCheckbox v-model="form.allDay" />
          <span>{{ t('fields.allDay') }}</span>
        </label>

        <!-- Date pickers (tasks have a single due date, no end) -->
        <div :class="form.kind === 'task' ? '' : 'grid grid-cols-2 gap-3'">
          <div>
            <label class="text-sm font-medium mb-1 block">
              {{ form.kind === 'task' ? t('fields.due') : t('fields.start') }}
            </label>
            <ShadcnDatePicker v-model="form.startDate" :clearable="false" locale="de-DE" />
          </div>
          <div v-if="form.kind === 'event'">
            <label class="text-sm font-medium mb-1 block">{{ t('fields.end') }}</label>
            <ShadcnDatePicker v-model="form.endDate" :clearable="false" locale="de-DE" />
          </div>
        </div>

        <!-- Time pickers (only when not all day) -->
        <div v-if="!form.allDay" :class="form.kind === 'task' ? '' : 'grid grid-cols-2 gap-3'">
          <div>
            <label class="text-sm font-medium mb-1 block">
              {{ form.kind === 'task' ? t('fields.dueTime') : t('fields.startTime') }}
            </label>
            <UiTimePicker v-model="form.startTime" />
          </div>
          <div v-if="form.kind === 'event'">
            <label class="text-sm font-medium mb-1 block">{{ t('fields.endTime') }}</label>
            <UiTimePicker v-model="form.endTime" />
          </div>
        </div>

        <!-- Reminders -->
        <div>
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium">{{ t('fields.reminders') }}</label>
            <span
              v-if="hasType"
              class="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
            >
              {{ remindersOverridden ? t('inherited.overridden') : t('inherited.inherited') }}
            </span>
          </div>
          <div v-if="hasType && !remindersOverridden" class="mt-1 space-y-1">
            <p class="text-sm text-muted-foreground">
              {{ inheritedRemindersLabel || t('reminders.none') }}
            </p>
            <button type="button" class="text-sm text-primary hover:opacity-80" @click="startOverrideReminders">
              {{ t('inherited.customize') }}
            </button>
          </div>
          <div v-else class="mt-1 space-y-2">
            <CalendarRemindersEditor v-model="form.reminderOffsets" />
            <button
              v-if="hasType"
              type="button"
              class="text-sm text-muted-foreground hover:opacity-80"
              @click="resetReminders"
            >
              {{ t('inherited.reset') }}
            </button>
          </div>
        </div>

        <!-- Recurrence -->
        <div>
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium">{{ t('fields.recurrence') }}</label>
            <span
              v-if="hasType"
              class="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
            >
              {{ form.rruleOverride ? t('inherited.overridden') : t('inherited.inherited') }}
            </span>
          </div>
          <div v-if="hasType && !form.rruleOverride" class="mt-1 space-y-1">
            <p class="text-sm text-muted-foreground">
              {{ inheritedRecurrenceLabel || t('recurrence.none') }}
            </p>
            <button type="button" class="text-sm text-primary hover:opacity-80" @click="startOverrideRecurrence">
              {{ t('inherited.customize') }}
            </button>
          </div>
          <div v-else class="mt-1 space-y-2">
            <CalendarRecurrenceEditor v-model="form.rrule" :dtstart="recurrenceSampleStart" />
            <button
              v-if="hasType"
              type="button"
              class="text-sm text-muted-foreground hover:opacity-80"
              @click="resetRecurrence"
            >
              {{ t('inherited.reset') }}
            </button>
          </div>
        </div>

        <!-- Location -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.location') }}</label>
          <input
            v-model="form.location"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
            :placeholder="t('fields.locationPlaceholder')"
          >
        </div>

        <!-- Status -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.status') }}</label>
          <ShadcnSelect v-model="form.status">
            <ShadcnSelectTrigger class="mt-1">
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem value="CONFIRMED">{{ t('status.confirmed') }}</ShadcnSelectItem>
              <ShadcnSelectItem value="TENTATIVE">{{ t('status.tentative') }}</ShadcnSelectItem>
              <ShadcnSelectItem value="CANCELLED">{{ t('status.cancelled') }}</ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

        <!-- Color -->
        <div>
          <label class="text-sm font-medium mb-1 block">{{ t('fields.color') }}</label>
          <div class="flex gap-2">
            <button
              v-for="c in presetColors"
              :key="c"
              :class="[
                'w-8 h-8 rounded-full border-2 transition-transform',
                form.color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
              ]"
              :style="{ backgroundColor: c }"
              @click="pickColor(c)"
            />
          </div>
        </div>

        <!-- Categories -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.categories') }}</label>
          <input
            v-model="form.categories"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
            :placeholder="t('fields.categoriesPlaceholder')"
          >
        </div>

        <!-- URL -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.url') }}</label>
          <input
            v-model="form.url"
            type="url"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
            placeholder="https://..."
          >
        </div>

        <!-- Calendar -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.calendar') }}</label>
          <ShadcnSelect v-model="form.calendarId">
            <ShadcnSelectTrigger class="mt-1">
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem
                v-for="cal in calendarsStore.calendars"
                :key="cal.id"
                :value="cal.id"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="w-2.5 h-2.5 rounded-full shrink-0"
                    :style="{ backgroundColor: cal.color }"
                  />
                  {{ cal.name }}
                </span>
              </ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

        <!-- Event type ("Termin-Art") -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.eventType') }}</label>
          <ShadcnSelect v-model="eventTypeIdStr">
            <ShadcnSelectTrigger class="mt-1">
              <ShadcnSelectValue :placeholder="t('eventType.none')" />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem value="__none__">{{ t('eventType.none') }}</ShadcnSelectItem>
              <ShadcnSelectItem
                v-for="ty in eventTypesStore.types"
                :key="ty.id"
                :value="ty.id"
              >
                <span class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: ty.color }" />
                  {{ ty.name }}
                </span>
              </ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

      </div>
    </template>

    <template #footer>
      <div class="flex gap-2 w-full">
        <button
          v-if="!isNew"
          class="text-destructive hover:text-destructive/80 px-3 py-2 transition-colors"
          @click="confirmDelete"
        >
          {{ t('delete') }}
        </button>
        <div class="flex-1" />
        <button
          class="text-muted-foreground px-3 py-2"
          @click="isOpen = false"
        >
          {{ t('cancel') }}
        </button>
        <button
          class="bg-primary text-primary-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity"
          @click="handleSave"
        >
          {{ t('save') }}
        </button>
      </div>
    </template>
  </UiDrawerModal>

  <UiDrawerModal
    v-model:open="showDeleteConfirm"
    :title="t(form.kind === 'task' ? 'deleteConfirm.titleTask' : 'deleteConfirm.titleEvent')"
  >
    <template #content>
      <div class="space-y-2 p-4">
        <p class="font-semibold">{{ form.summary || t('deleteConfirm.untitled') }}</p>
        <p class="text-sm text-muted-foreground">
          {{ form.rrule ? t('deleteConfirm.descriptionRecurring') : t('deleteConfirm.description') }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <button
          class="text-muted-foreground px-3 py-2"
          @click="showDeleteConfirm = false"
        >
          {{ t('deleteConfirm.cancel') }}
        </button>
        <button
          class="bg-destructive text-destructive-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity"
          @click="executeDelete"
        >
          {{ t('deleteConfirm.confirm') }}
        </button>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { formatRemindersShort } from "~/lib/reminders";
import { rruleFrequency } from "~/lib/rrule";

const isOpen = defineModel<boolean>("open", { default: false });

import type { EventDrawerInitialValues } from "~/stores/eventDrawer";

const props = defineProps<{
  eventId?: string | null;
  initialValues?: EventDrawerInitialValues | null;
}>();

const { t } = useI18n();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();
const eventTypesStore = useEventTypesStore();

const presetColors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#6b7280"];

const isNew = computed(() => !props.eventId);

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

// ShadcnSelect needs a string value; map null ↔ a "__none__" sentinel.
const eventTypeIdStr = computed({
  get: () => form.eventTypeId ?? "__none__",
  set: (value: string) => {
    form.eventTypeId = value === "__none__" ? null : value;
  },
});

const inheritedRemindersLabel = computed(() =>
  formatRemindersShort(eventTypesStore.getTypeReminders(form.eventTypeId)),
);

const inheritedRecurrenceLabel = computed(() => {
  const type = eventTypesStore.getType(form.eventTypeId);
  const freq = rruleFrequency(type?.defaultRrule);
  return freq ? t(`freq.${freq}`) : "";
});

/** Sample dtstart for the recurrence preview. */
const recurrenceSampleStart = computed(() => {
  if (!form.startDate) return new Date();
  const iso = form.allDay ? form.startDate : `${form.startDate}T${form.startTime}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
});

function kindButtonClass(active: boolean) {
  return [
    "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
  ];
}

function startOverrideReminders() {
  form.reminderOffsets = [...eventTypesStore.getTypeReminders(form.eventTypeId)];
  remindersOverridden.value = true;
}

function resetReminders() {
  form.reminderOffsets = [];
  remindersOverridden.value = false;
}

function startOverrideRecurrence() {
  const type = eventTypesStore.getType(form.eventTypeId);
  form.rrule = type?.defaultRrule ?? null;
  form.rruleOverride = true;
}

function resetRecurrence() {
  form.rrule = null;
  form.rruleOverride = false;
}

/**
 * Click handler for the colour palette. Sets `colorOverride` based on whether
 * the user actively picked a colour, not on whether `form.color` happens to
 * hold a non-null value (which it almost always does after load).
 */
function pickColor(c: string) {
  if (form.color === c) {
    // Toggle off — back to inherited (when typed) or no colour (when not).
    form.color = null;
    form.colorOverride = false;
  } else {
    form.color = c;
    form.colorOverride = true;
  }
}

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

onMounted(() => {
  eventTypesStore.loadTypesAsync();
});

/**
 * Parse an ISO/all-day dtstring into the {date, time} pair the form uses.
 * Same logic as the load path below, exposed as a helper so initialValues
 * (which carry dtstart/dtend strings) can reuse it.
 */
function parseDtToFormPair(dt: string, allDay: boolean, defaultTime: string): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (allDay) return { date: dt.split("T")[0] ?? "", time: defaultTime };
  const d = new Date(dt);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

// Load event data when eventId changes
watch(
  () => [props.eventId, props.initialValues] as const,
  async ([id, initial]) => {
    if (!id) {
      // New-event mode: start from defaults, then layer initialValues on top.
      // Date/time form fields are derived from the optional dtstart/dtend.
      const startPair = initial?.dtstart
        ? parseDtToFormPair(initial.dtstart, !!initial.allDay, "09:00")
        : { date: "", time: "09:00" };
      const endPair = initial?.dtend
        ? parseDtToFormPair(initial.dtend, !!initial.allDay, "10:00")
        : { date: "", time: "10:00" };

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

    const pad = (n: number) => String(n).padStart(2, "0");

    const parseDateTime = (dt: string) => {
      const d = new Date(dt);
      return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      };
    };

    const start = event.allDay
      ? { date: event.dtstart.split("T")[0], time: "09:00" }
      : parseDateTime(event.dtstart);
    const end = event.allDay
      ? { date: event.dtend.split("T")[0], time: "10:00" }
      : parseDateTime(event.dtend);

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
  const dtend =
    form.kind === "task"
      ? dtstart
      : form.allDay
        ? form.endDate
        : new Date(`${form.endDate}T${form.endTime}`).toISOString();

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

const showDeleteConfirm = ref(false);

function confirmDelete() {
  if (!props.eventId) return;
  showDeleteConfirm.value = true;
}

async function executeDelete() {
  if (!props.eventId) return;
  await eventsStore.deleteEventAsync(props.eventId);
  showDeleteConfirm.value = false;
  isOpen.value = false;
}
</script>

<i18n lang="yaml">
de:
  title:
    new: Neues Event
    edit: Event bearbeiten
  kind:
    event: Termin
    task: Aufgabe
  fields:
    summary: Titel
    start: Start
    end: Ende
    due: Fällig am
    dueTime: Fällig um
    startTime: Startzeit
    endTime: Endzeit
    allDay: Ganztägig
    location: Ort
    locationPlaceholder: Ort hinzufügen
    status: Status
    color: Farbe
    categories: Kategorien
    categoriesPlaceholder: Arbeit, Privat, ...
    url: URL
    description: Beschreibung
    calendar: Kalender
    eventType: Termin-Art
    reminders: Erinnerungen
    recurrence: Wiederholung
  eventType:
    none: Keine
  inherited:
    inherited: geerbt
    overridden: überschrieben
    customize: Anpassen
    reset: Auf Default zurücksetzen
  reminders:
    none: Keine Erinnerungen
  recurrence:
    none: Keine Wiederholung
  freq:
    daily: täglich
    weekly: wöchentlich
    monthly: monatlich
    yearly: jährlich
  status:
    confirmed: Bestätigt
    tentative: Vorläufig
    cancelled: Abgesagt
  save: Speichern
  cancel: Abbrechen
  delete: Löschen
  deleteConfirm:
    titleEvent: Termin löschen?
    titleTask: Aufgabe löschen?
    description: Wird unwiderruflich gelöscht.
    descriptionRecurring: Die gesamte Serie wird unwiderruflich gelöscht (alle Wiederholungen).
    untitled: (ohne Titel)
    confirm: Löschen
    cancel: Abbrechen
en:
  title:
    new: New Event
    edit: Edit Event
  kind:
    event: Event
    task: Task
  fields:
    summary: Title
    start: Start
    end: End
    due: Due date
    dueTime: Due time
    startTime: Start time
    endTime: End time
    allDay: All day
    location: Location
    locationPlaceholder: Add location
    status: Status
    color: Color
    categories: Categories
    categoriesPlaceholder: Work, Personal, ...
    url: URL
    description: Description
    calendar: Calendar
    eventType: Event type
    reminders: Reminders
    recurrence: Recurrence
  eventType:
    none: None
  inherited:
    inherited: inherited
    overridden: overridden
    customize: Customize
    reset: Reset to default
  reminders:
    none: No reminders
  recurrence:
    none: No recurrence
  freq:
    daily: daily
    weekly: weekly
    monthly: monthly
    yearly: yearly
  status:
    confirmed: Confirmed
    tentative: Tentative
    cancelled: Cancelled
  save: Save
  cancel: Cancel
  delete: Delete
  deleteConfirm:
    titleEvent: Delete event?
    titleTask: Delete task?
    description: This will be permanently deleted.
    descriptionRecurring: The whole series will be permanently deleted (every occurrence).
    untitled: (untitled)
    confirm: Delete
    cancel: Cancel
</i18n>
