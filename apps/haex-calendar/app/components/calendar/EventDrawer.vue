<template>
  <UiDrawerModal v-model:open="isOpen" :title="isNew ? t('title.new') : t('title.edit')">
    <template #content>
      <div class="space-y-4 p-4">
        <!-- Summary -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.summary') }}</label>
          <input
            v-model="form.summary"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
          />
        </div>

        <!-- Date/Time -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm font-medium">{{ t('fields.start') }}</label>
            <input
              v-model="form.dtstart"
              :type="form.allDay ? 'date' : 'datetime-local'"
              class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            />
          </div>
          <div>
            <label class="text-sm font-medium">{{ t('fields.end') }}</label>
            <input
              v-model="form.dtend"
              :type="form.allDay ? 'date' : 'datetime-local'"
              class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            />
          </div>
        </div>

        <!-- All day toggle -->
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="form.allDay" type="checkbox" class="rounded" />
          <span class="text-sm">{{ t('fields.allDay') }}</span>
        </label>

        <!-- Location -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.location') }}</label>
          <input
            v-model="form.location"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            :placeholder="t('fields.locationPlaceholder')"
          />
        </div>

        <!-- Status -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.status') }}</label>
          <select
            v-model="form.status"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
          >
            <option value="CONFIRMED">{{ t('status.confirmed') }}</option>
            <option value="TENTATIVE">{{ t('status.tentative') }}</option>
            <option value="CANCELLED">{{ t('status.cancelled') }}</option>
          </select>
        </div>

        <!-- Color -->
        <div>
          <label class="text-sm font-medium mb-1 block">{{ t('fields.color') }}</label>
          <div class="flex gap-2">
            <button
              v-for="c in presetColors"
              :key="c"
              :class="[
                'w-7 h-7 rounded-full border-2 transition-transform',
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
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            :placeholder="t('fields.categoriesPlaceholder')"
          />
        </div>

        <!-- URL -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.url') }}</label>
          <input
            v-model="form.url"
            type="url"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
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
          <select
            v-model="form.calendarId"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
          >
            <option
              v-for="cal in calendarsStore.calendars"
              :key="cal.id"
              :value="cal.id"
            >
              {{ cal.name }}
            </option>
          </select>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex gap-2 p-4 border-t border-border">
        <button
          v-if="!isNew"
          class="text-sm text-destructive hover:text-destructive/80 px-3 py-2 transition-colors"
          @click="handleDelete"
        >
          {{ t('delete') }}
        </button>
        <div class="flex-1" />
        <button
          class="text-sm text-muted-foreground px-3 py-2"
          @click="isOpen = false"
        >
          {{ t('cancel') }}
        </button>
        <button
          class="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity"
          @click="handleSave"
        >
          {{ t('save') }}
        </button>
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
  dtstart: "",
  dtend: "",
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
      // Reset form for new event
      Object.assign(form, {
        summary: "",
        dtstart: "",
        dtend: "",
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

    // Format dates for input fields
    const formatForInput = (dt: string, allDay: boolean) => {
      if (allDay) return dt.split("T")[0];
      const d = new Date(dt);
      return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
    };

    Object.assign(form, {
      summary: event.summary,
      dtstart: formatForInput(event.dtstart, event.allDay),
      dtend: formatForInput(event.dtend, event.allDay),
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

  const data = {
    summary: form.summary.trim(),
    dtstart: form.allDay ? form.dtstart : new Date(form.dtstart).toISOString(),
    dtend: form.allDay ? form.dtend : new Date(form.dtend).toISOString(),
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
