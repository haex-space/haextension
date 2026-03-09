<template>
  <div
    ref="popoverRef"
    class="fixed z-50 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border p-3 w-72"
    :style="{ top: `${position.y}px`, left: `${position.x}px` }"
  >
    <input
      ref="titleInput"
      v-model="title"
      class="w-full bg-transparent text-sm font-medium outline-none border-b border-border pb-1 mb-2 placeholder:text-muted-foreground"
      :placeholder="t('titlePlaceholder')"
      @keydown.enter="handleCreate"
      @keydown.escape="emit('close')"
    />

    <div class="text-xs text-muted-foreground mb-3">
      {{ formattedDateTime }}
    </div>

    <!-- Calendar selector -->
    <select
      v-model="selectedCalendarId"
      class="w-full text-xs bg-muted rounded px-2 py-1 mb-3 outline-none"
    >
      <option
        v-for="cal in calendarsStore.calendars"
        :key="cal.id"
        :value="cal.id"
      >
        {{ cal.name }}
      </option>
    </select>

    <div class="flex gap-2">
      <button
        class="flex-1 text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:opacity-90 transition-opacity"
        @click="handleCreate"
      >
        {{ t('create') }}
      </button>
      <button
        class="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 transition-colors"
        @click="handleMoreDetails"
      >
        {{ t('moreDetails') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";

const props = defineProps<{
  date: Date;
  time?: string | null;
  position: { x: number; y: number };
}>();

const emit = defineEmits<{
  close: [];
  created: [];
}>();

const { t } = useI18n();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();
const openEventDrawer = inject<(id: string) => void>("openEventDrawer")!;

const popoverRef = ref<HTMLElement | null>(null);
const titleInput = ref<HTMLInputElement | null>(null);
const title = ref("");
const selectedCalendarId = ref(calendarsStore.calendars[0]?.id ?? "");

onClickOutside(popoverRef, () => emit("close"));

onMounted(() => {
  nextTick(() => titleInput.value?.focus());
});

const formattedDateTime = computed(() => {
  const d = props.date;
  const dateStr = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);

  if (props.time) {
    const [h, m] = props.time.split(":");
    const endH = String(Number(h) + 1).padStart(2, "0");
    return `${dateStr}, ${h}:${m} – ${endH}:${m}`;
  }
  return dateStr;
});

async function handleCreate() {
  if (!title.value.trim()) return;
  if (!selectedCalendarId.value) return;

  const d = props.date;
  let dtstart: string;
  let dtend: string;
  let allDay = false;

  if (props.time) {
    const [h, m] = props.time.split(":");
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(h), Number(m));
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    dtstart = start.toISOString();
    dtend = end.toISOString();
  } else {
    // All-day event
    dtstart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    dtend = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
    allDay = true;
  }

  await eventsStore.createEventAsync({
    calendarId: selectedCalendarId.value,
    summary: title.value.trim(),
    dtstart,
    dtend,
    allDay,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: "CONFIRMED",
    sequence: 0,
  });

  emit("created");
}

async function handleMoreDetails() {
  // Create the event first, then open detail drawer
  if (!title.value.trim() || !selectedCalendarId.value) {
    emit("close");
    return;
  }
  const id = await handleCreate();
  // TODO: openEventDrawer after creation
  emit("close");
}
</script>

<i18n lang="yaml">
de:
  titlePlaceholder: Titel eingeben
  create: Erstellen
  moreDetails: Mehr Details →
en:
  titlePlaceholder: Add title
  create: Create
  moreDetails: More details →
</i18n>
