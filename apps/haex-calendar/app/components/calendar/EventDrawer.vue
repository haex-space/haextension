<template>
  <UiDrawerModal v-model:open="isOpen" :title="isNew ? t('title.new') : t('title.edit')">
    <template #content>
      <div class="space-y-4 p-4">
        <!-- Summary -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.summary') }}</label>
          <input
            v-model="form.summary"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
          />
        </div>

        <!-- All day toggle -->
        <label class="flex items-center gap-2 cursor-pointer">
          <ShadcnCheckbox v-model="form.allDay" />
          <span>{{ t('fields.allDay') }}</span>
        </label>

        <!-- Date pickers -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm font-medium mb-1 block">{{ t('fields.start') }}</label>
            <ShadcnDatePicker v-model="form.startDate" :clearable="false" locale="de-DE" />
          </div>
          <div>
            <label class="text-sm font-medium mb-1 block">{{ t('fields.end') }}</label>
            <ShadcnDatePicker v-model="form.endDate" :clearable="false" locale="de-DE" />
          </div>
        </div>

        <!-- Time pickers (only when not all day) -->
        <div v-if="!form.allDay" class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm font-medium mb-1 block">{{ t('fields.startTime') }}</label>
            <UiTimePicker v-model="form.startTime" />
          </div>
          <div>
            <label class="text-sm font-medium mb-1 block">{{ t('fields.endTime') }}</label>
            <UiTimePicker v-model="form.endTime" />
          </div>
        </div>

        <!-- Location -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.location') }}</label>
          <input
            v-model="form.location"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
            :placeholder="t('fields.locationPlaceholder')"
          />
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
              @click="form.color = form.color === c ? null : c"
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
          />
        </div>

        <!-- URL -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.url') }}</label>
          <input
            v-model="form.url"
            type="url"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
            placeholder="https://..."
          />
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
      </div>
    </template>

    <template #footer>
      <div class="w-full">
        <div class="-mx-6 border-t border-border" />
        <div class="flex gap-2 pt-4">
          <button
            v-if="!isNew"
            class="text-destructive hover:text-destructive/80 px-3 py-2 transition-colors"
            @click="handleDelete"
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
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
const isOpen = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  eventId?: string | null;
}>();

const { t } = useI18n();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();

const presetColors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#6b7280"];

const isNew = computed(() => !props.eventId);

const form = reactive({
  summary: "",
  startDate: "",
  endDate: "",
  startTime: "09:00",
  endTime: "10:00",
  allDay: false,
  location: "",
  status: "CONFIRMED",
  color: null as string | null,
  categories: "",
  url: "",
  description: "",
  calendarId: calendarsStore.calendars[0]?.id ?? "",
});

// Load event data when eventId changes
watch(
  () => props.eventId,
  (id) => {
    if (!id) {
      Object.assign(form, {
        summary: "",
        startDate: "",
        endDate: "",
        startTime: "09:00",
        endTime: "10:00",
        allDay: false,
        location: "",
        status: "CONFIRMED",
        color: null,
        categories: "",
        url: "",
        description: "",
        calendarId: calendarsStore.calendars[0]?.id ?? "",
      });
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

    Object.assign(form, {
      summary: event.summary,
      startDate: start.date,
      endDate: end.date,
      startTime: start.time,
      endTime: end.time,
      allDay: event.allDay,
      location: event.location ?? "",
      status: event.status,
      color: event.color,
      categories: event.categories ?? "",
      url: event.url ?? "",
      description: event.description ?? "",
      calendarId: event.calendarId,
    });
  },
  { immediate: true }
);

async function handleSave() {
  if (!form.summary.trim()) return;

  const dtstart = form.allDay
    ? form.startDate
    : new Date(`${form.startDate}T${form.startTime}`).toISOString();
  const dtend = form.allDay
    ? form.endDate
    : new Date(`${form.endDate}T${form.endTime}`).toISOString();

  const data = {
    summary: form.summary.trim(),
    dtstart,
    dtend,
    allDay: form.allDay,
    location: form.location || null,
    status: form.status,
    color: form.color,
    categories: form.categories || null,
    url: form.url || null,
    description: form.description || null,
    calendarId: form.calendarId,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sequence: 0,
  };

  if (props.eventId) {
    await eventsStore.updateEventAsync(props.eventId, data);
  } else {
    await eventsStore.createEventAsync(data);
  }

  isOpen.value = false;
}

async function handleDelete() {
  if (!props.eventId) return;
  await eventsStore.deleteEventAsync(props.eventId);
  isOpen.value = false;
}
</script>

<i18n lang="yaml">
de:
  title:
    new: Neues Event
    edit: Event bearbeiten
  fields:
    summary: Titel
    start: Start
    end: Ende
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
  status:
    confirmed: Bestätigt
    tentative: Vorläufig
    cancelled: Abgesagt
  save: Speichern
  cancel: Abbrechen
  delete: Löschen
en:
  title:
    new: New Event
    edit: Edit Event
  fields:
    summary: Title
    start: Start
    end: End
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
  status:
    confirmed: Confirmed
    tentative: Tentative
    cancelled: Cancelled
  save: Save
  cancel: Cancel
  delete: Delete
</i18n>
