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

        <CalendarEventInheritedFields
          v-model:reminder-offsets="form.reminderOffsets"
          v-model:reminders-overridden="remindersOverridden"
          v-model:rrule="form.rrule"
          v-model:rrule-override="form.rruleOverride"
          :event-type-id="form.eventTypeId"
          :dtstart="recurrenceSampleStart"
        />

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
import type { EventDrawerInitialValues } from "~/stores/eventDrawer";

const isOpen = defineModel<boolean>("open", { default: false });

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

const { form, remindersOverridden, handleSave } = useEventForm(props, isOpen);

// ShadcnSelect needs a string value; map null ↔ a "__none__" sentinel.
const eventTypeIdStr = computed({
  get: () => form.eventTypeId ?? "__none__",
  set: (value: string) => {
    form.eventTypeId = value === "__none__" ? null : value;
  },
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

onMounted(() => {
  eventTypesStore.loadTypesAsync();
});

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
  eventType:
    none: Keine
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
  eventType:
    none: None
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
