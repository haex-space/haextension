<template>
  <div class="h-full flex flex-col">
    <!-- All-day events -->
    <div
      v-if="allDayEventsForDay.length > 0"
      class="border-b border-border p-2 space-y-1 shrink-0"
    >
      <div class="text-xs text-muted-foreground mb-1">{{ t('allDay') }}</div>
      <div
        v-for="event in allDayEventsForDay"
        :key="event.id"
        class="text-xs px-2 py-1 rounded cursor-pointer"
        :style="{ backgroundColor: getEventColor(event), color: 'white' }"
        @click="openEventDrawer(event.id)"
      >
        {{ event.summary }}
      </div>
    </div>

    <!-- Scrollable time grid -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto">
      <div class="grid grid-cols-[3.5rem_1fr] relative" :style="{ height: `${HOUR_HEIGHT * 24}px` }">
        <!-- Time labels -->
        <div class="relative">
          <div
            v-for="hour in 24"
            :key="hour"
            class="absolute text-xs text-muted-foreground text-right pr-2 w-full -translate-y-1/2"
            :style="{ top: `${(hour - 1) * HOUR_HEIGHT}px` }"
          >
            {{ String(hour - 1).padStart(2, '0') }}:00
          </div>
        </div>

        <!-- Single day column -->
        <div
          class="relative border-l border-border"
          @click="onColumnClick($event)"
        >
          <!-- Hour lines -->
          <div
            v-for="hour in 24"
            :key="hour"
            class="absolute w-full border-t border-border/50"
            :style="{ top: `${hour * HOUR_HEIGHT}px` }"
          />

          <!-- Current time indicator -->
          <div
            v-if="isToday"
            class="absolute w-full z-10 pointer-events-none"
            :style="{ top: `${currentTimePosition}px` }"
          >
            <div class="flex items-center">
              <div class="w-2.5 h-2.5 rounded-full bg-destructive -ml-1" />
              <div class="flex-1 h-0.5 bg-destructive" />
            </div>
          </div>

          <!-- Positioned events -->
          <div
            v-for="pe in positionedEvents"
            :key="pe.event.id"
            class="absolute rounded-md px-2 py-1 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity text-sm border"
            :style="{
              top: `${(pe.top / 100) * HOUR_HEIGHT * 24}px`,
              height: `${(pe.height / 100) * HOUR_HEIGHT * 24}px`,
              left: `${pe.left}%`,
              width: `${pe.width}%`,
              backgroundColor: getEventColor(pe.event) + '20',
              borderColor: getEventColor(pe.event),
              color: getEventColor(pe.event),
            }"
            @click.stop="openEventDrawer(pe.event.id)"
          >
            <div class="font-medium">{{ pe.event.summary }}</div>
            <div>
              {{ formatTime(pe.event.dtstart) }} – {{ formatTime(pe.event.dtend) }}
            </div>
            <div v-if="pe.event.location" class="text-xs opacity-75 truncate">
              {{ pe.event.location }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <CalendarQuickCreate
      v-if="quickCreateDate"
      :date="quickCreateDate"
      :time="quickCreateTime"
      :position="quickCreatePosition"
      @close="quickCreateDate = null"
      @created="quickCreateDate = null"
    />
  </div>
</template>

<script setup lang="ts">
import type { SelectEvent } from "~/database/schemas";
import {
  positionEventsInDay,
  getAllDayEvents,
  toDateKey,
} from "~/composables/useTimeGrid";

const { t } = useI18n();
const calendarView = useCalendarViewStore();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();
const openEventDrawer = inject<(id: string) => void>("openEventDrawer")!;

const scrollContainer = ref<HTMLElement | null>(null);
const quickCreateDate = ref<Date | null>(null);
const quickCreateTime = ref<string | null>(null);
const quickCreatePosition = ref({ x: 0, y: 0 });

const HOUR_HEIGHT = 60;

onMounted(() => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 7 * HOUR_HEIGHT;
  }
});

const currentDateKey = computed(() => toDateKey(calendarView.currentDate.toISOString()));

const isToday = computed(() => {
  const today = new Date();
  return toDateKey(today.toISOString()) === currentDateKey.value;
});

const currentTimePosition = computed(() => {
  const now = new Date();
  return (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT;
});

const timedEvents = computed(() =>
  eventsStore.events.filter((e) => !e.allDay && toDateKey(e.dtstart) === currentDateKey.value)
);

const allDayEventsForDay = computed(() =>
  getAllDayEvents(eventsStore.events).filter((e) => toDateKey(e.dtstart) === currentDateKey.value)
);

const positionedEvents = computed(() => positionEventsInDay(timedEvents.value));

function getEventColor(event: SelectEvent): string {
  if (event.color) return event.color;
  const cal = calendarsStore.getCalendar(event.calendarId);
  return cal?.color ?? "#3b82f6";
}

function formatTime(dt: string): string {
  const d = new Date(dt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function onColumnClick(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const relativeY = event.clientY - rect.top + (scrollContainer.value?.scrollTop ?? 0);
  const hour = Math.floor(relativeY / HOUR_HEIGHT);
  const minutes = Math.round(((relativeY % HOUR_HEIGHT) / HOUR_HEIGHT) * 60 / 15) * 15;

  quickCreateDate.value = calendarView.currentDate;
  quickCreateTime.value = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  quickCreatePosition.value = { x: event.clientX, y: event.clientY };
}
</script>

<i18n lang="yaml">
de:
  allDay: Ganztägig
en:
  allDay: All day
</i18n>
