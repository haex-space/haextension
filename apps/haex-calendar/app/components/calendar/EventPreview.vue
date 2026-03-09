<template>
  <UiDrawerModal v-model:open="preview.isOpen" :title="event?.summary" :description="dateDescription">
    <template #content>
      <div class="space-y-3 p-4">
        <!-- Time -->
        <div v-if="event && !event.allDay" class="flex items-center gap-2 text-sm">
          <Clock class="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{{ formatTime(event.dtstart) }} – {{ formatTime(event.dtend) }}</span>
        </div>
        <div v-else-if="event?.allDay" class="flex items-center gap-2 text-sm">
          <Clock class="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{{ t('allDay') }}</span>
        </div>

        <!-- Location -->
        <div v-if="event?.location" class="flex items-center gap-2 text-sm">
          <MapPin class="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{{ event.location }}</span>
        </div>

        <!-- Calendar -->
        <div v-if="calendar" class="flex items-center gap-2 text-sm">
          <span
            class="w-2.5 h-2.5 rounded-full shrink-0"
            :style="{ backgroundColor: calendar.color }"
          />
          <span>{{ calendar.name }}</span>
        </div>

        <!-- Status (if not confirmed) -->
        <div v-if="event && event.status !== 'CONFIRMED'" class="flex items-center gap-2 text-sm">
          <Info class="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{{ t(`status.${event.status.toLowerCase()}`) }}</span>
        </div>

        <!-- Description (truncated) -->
        <div v-if="event?.description" class="text-sm text-muted-foreground line-clamp-3">
          {{ event.description }}
        </div>

        <!-- URL -->
        <div v-if="event?.url" class="flex items-center gap-2 text-sm">
          <Link class="w-4 h-4 text-muted-foreground shrink-0" />
          <a :href="event.url" target="_blank" class="text-primary hover:underline truncate">
            {{ event.url }}
          </a>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="w-full">
        <div class="-mx-6 border-t border-border" />
        <div class="flex gap-2 pt-4">
          <button
            class="text-destructive hover:text-destructive/80 px-3 py-2 transition-colors"
            @click="handleDelete"
          >
            <Trash2 class="w-4 h-4" />
          </button>
          <div class="flex-1" />
          <button
            class="text-muted-foreground px-3 py-2"
            @click="preview.close()"
          >
            {{ t('close') }}
          </button>
          <button
            class="bg-primary text-primary-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity"
            @click="handleEdit"
          >
            {{ t('edit') }}
          </button>
        </div>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { Clock, MapPin, Info, Link, Trash2 } from "lucide-vue-next";

const { t } = useI18n();
const preview = useEventPreviewStore();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();
const eventDrawer = useEventDrawerStore();

const event = computed(() => {
  if (!preview.eventId) return null;
  return eventsStore.getEvent(preview.eventId);
});

const calendar = computed(() => {
  if (!event.value) return null;
  return calendarsStore.getCalendar(event.value.calendarId);
});

const dateDescription = computed(() => {
  if (!event.value) return "";
  const dt = new Date(event.value.dtstart);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dt);
});

function formatTime(dt: string): string {
  const d = new Date(dt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function handleEdit() {
  const id = preview.eventId;
  preview.close();
  if (id) {
    eventDrawer.open(id);
  }
}

async function handleDelete() {
  const id = preview.eventId;
  if (!id) return;
  preview.close();
  await eventsStore.deleteEventAsync(id);
}
</script>

<i18n lang="yaml">
de:
  allDay: Ganztägig
  close: Schließen
  edit: Bearbeiten
  status:
    tentative: Vorläufig
    cancelled: Abgesagt
en:
  allDay: All day
  close: Close
  edit: Edit
  status:
    tentative: Tentative
    cancelled: Cancelled
</i18n>
