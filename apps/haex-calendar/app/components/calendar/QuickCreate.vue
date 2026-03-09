<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('title')" :description="formattedDate">
    <template #content>
      <div class="space-y-4 p-4">
        <input
          ref="titleInput"
          v-model="title"
          class="w-full bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary placeholder:text-muted-foreground"
          :placeholder="t('titlePlaceholder')"
          @keydown.enter="handleCreate"
        >

        <!-- All day toggle -->
        <label class="flex items-center gap-2 cursor-pointer">
          <ShadcnCheckbox v-model="allDay" />
          <span>{{ t('allDay') }}</span>
        </label>

        <!-- Time pickers (only when not all day) -->
        <div v-if="!allDay" class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm font-medium mb-1 block">{{ t('startTime') }}</label>
            <UiTimePicker v-model="startTimeStr" />
          </div>
          <div>
            <label class="text-sm font-medium mb-1 block">{{ t('endTime') }}</label>
            <UiTimePicker v-model="endTimeStr" />
          </div>
        </div>

        <!-- Calendar selector -->
        <ShadcnSelect v-model="selectedCalendarId">
          <ShadcnSelectTrigger>
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
    </template>

    <template #footer>
      <div class="w-full">
        <div class="-mx-6 border-t border-border" />
        <div class="flex justify-end gap-2 pt-4">
          <button
            class="text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
            @click="handleMoreDetails"
          >
            {{ t('moreDetails') }}
          </button>
          <button
            class="bg-primary text-primary-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity"
            @click="handleCreate"
          >
            {{ t('create') }}
          </button>
        </div>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  date: Date;
  endDate?: Date | null;
  time?: string | null;
  endTime?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  created: [];
}>();

const { t } = useI18n();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();
const eventDrawer = useEventDrawerStore();

const isOpen = ref(true);

watch(isOpen, (open) => {
  if (!open) emit("close");
});

const titleInput = ref<HTMLInputElement | null>(null);
const title = ref("");
const selectedCalendarId = ref(calendarsStore.calendars[0]?.id ?? "");
const isMultiDay = !!props.endDate && props.endDate.getTime() !== props.date.getTime();
const allDay = ref(isMultiDay);

const pad = (n: number) => String(n).padStart(2, "0");

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dateStr = toDateStr(props.date);
const startTimeStr = ref("09:00");
const endTimeStr = ref("10:00");

if (props.time) {
  const [h, m] = props.time.split(":");
  startTimeStr.value = `${pad(Number(h))}:${pad(Number(m))}`;

  if (props.endTime) {
    const [eh, em] = props.endTime.split(":");
    endTimeStr.value = `${pad(Number(eh))}:${pad(Number(em))}`;
  } else {
    const endH = (Number(h) + 1) % 24;
    endTimeStr.value = `${pad(endH)}:${pad(Number(m))}`;
  }
}

onMounted(() => {
  nextTick(() => titleInput.value?.focus());
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const formattedDate = computed(() => {
  if (isMultiDay && props.endDate) {
    return `${dateFormatter.format(props.date)} – ${dateFormatter.format(props.endDate)}`;
  }
  return dateFormatter.format(props.date);
});

function buildEventData() {
  if (allDay.value) {
    const endDay = props.endDate ?? props.date;
    const dayAfterEnd = new Date(endDay);
    dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
    return {
      dtstart: dateStr,
      dtend: toDateStr(dayAfterEnd),
      allDay: true,
    };
  }
  const dtstart = new Date(`${dateStr}T${startTimeStr.value}`).toISOString();
  const dtend = new Date(`${dateStr}T${endTimeStr.value}`).toISOString();
  return { dtstart, dtend, allDay: false };
}

async function handleCreate() {
  if (!title.value.trim()) return;
  if (!selectedCalendarId.value) return;

  const { dtstart, dtend, allDay: isAllDay } = buildEventData();

  const id = await eventsStore.createEventAsync({
    calendarId: selectedCalendarId.value,
    summary: title.value.trim(),
    dtstart,
    dtend,
    allDay: isAllDay,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: "CONFIRMED",
    sequence: 0,
  });

  emit("created");
  return id;
}

async function handleMoreDetails() {
  if (!selectedCalendarId.value) return;

  const { dtstart, dtend, allDay: isAllDay } = buildEventData();

  const id = await eventsStore.createEventAsync({
    calendarId: selectedCalendarId.value,
    summary: title.value.trim() || t("titlePlaceholder"),
    dtstart,
    dtend,
    allDay: isAllDay,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: "CONFIRMED",
    sequence: 0,
  });

  emit("created");
  if (id) {
    eventDrawer.open(id);
  }
}
</script>

<i18n lang="yaml">
de:
  title: Neues Event
  titlePlaceholder: Titel eingeben
  startTime: Von
  endTime: Bis
  allDay: Ganztägig
  create: Erstellen
  moreDetails: Mehr Details →
en:
  title: New Event
  titlePlaceholder: Add title
  startTime: From
  endTime: To
  allDay: All day
  create: Create
  moreDetails: More details →
</i18n>
