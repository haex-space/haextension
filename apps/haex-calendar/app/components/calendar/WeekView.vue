<template>
  <div class="h-full flex flex-col">
    <!-- Day headers with all-day events -->
    <div class="border-b border-border shrink-0">
      <!-- Day names -->
      <div class="grid grid-cols-[3.5rem_repeat(7,1fr)]">
        <div /> <!-- Time gutter spacer -->
        <div
          v-for="day in weekDays"
          :key="day.key"
          :class="[
            'text-center py-1.5 border-l border-border',
            day.isToday && 'bg-primary/5',
          ]"
        >
          <div class="text-xs text-muted-foreground">{{ day.weekday }}</div>
          <button
            :class="[
              'text-lg font-semibold w-8 h-8 rounded-full flex items-center justify-center mx-auto',
              day.isToday ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            ]"
            @click="calendarView.goToDay(day.date)"
          >
            {{ day.dayNumber }}
          </button>
        </div>
      </div>

      <!-- All-day events row -->
      <div
        v-if="allDayEvents.length > 0"
        class="grid grid-cols-[3.5rem_repeat(7,1fr)] border-t border-border"
      >
        <div class="text-xs text-muted-foreground p-1 text-right">{{ t('allDay') }}</div>
        <div
          v-for="day in weekDays"
          :key="day.key"
          class="border-l border-border p-0.5 space-y-0.5"
        >
          <div
            v-for="event in getAllDayForDate(day.key)"
            :key="event.id"
            :class="['text-xs px-1.5 py-0.5 rounded truncate cursor-pointer']"
            :style="{
              backgroundColor: getEventColor(event),
              color: 'white',
            }"
            @click="openEventDrawer(event.id)"
          >
            {{ event.summary }}
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable time grid -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto">
      <div class="grid grid-cols-[3.5rem_repeat(7,1fr)] relative" :style="{ height: `${HOUR_HEIGHT * 24}px` }">
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

        <!-- Day columns -->
        <div
          v-for="day in weekDays"
          :key="day.key"
          class="relative border-l border-border"
          @click="onColumnClick(day.date, $event)"
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
            v-if="day.isToday"
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
            v-for="pe in getPositionedEvents(day.key)"
            :key="pe.event.id"
            class="absolute rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity text-xs border"
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
            <div class="font-medium truncate">{{ pe.event.summary }}</div>
            <div class="truncate">
              {{ formatTime(pe.event.dtstart) }} – {{ formatTime(pe.event.dtend) }}
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
  groupEventsByDay,
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

const HOUR_HEIGHT = 60; // px per hour

// Scroll to 7am on mount
onMounted(() => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 7 * HOUR_HEIGHT;
  }
});

const weekDays = computed(() => {
  const range = calendarView.visibleRange;
  const start = new Date(range.start);
  const today = new Date();
  const todayKey = toDateKey(today.toISOString());
  const formatter = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = toDateKey(d.toISOString());
    days.push({
      date: new Date(d),
      key,
      weekday: formatter.format(d),
      dayNumber: d.getDate(),
      isToday: key === todayKey,
    });
  }
  return days;
});

// Current time indicator position
const currentTimePosition = computed(() => {
  const now = new Date();
  return (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT;
});

const eventsByDay = computed(() => groupEventsByDay(eventsStore.events));
const allDayEvents = computed(() => getAllDayEvents(eventsStore.events));

function getPositionedEvents(dateKey: string) {
  const dayEvents = eventsByDay.value.get(dateKey) ?? [];
  return positionEventsInDay(dayEvents);
}

function getAllDayForDate(dateKey: string) {
  return allDayEvents.value.filter((e) => toDateKey(e.dtstart) === dateKey);
}

function getEventColor(event: SelectEvent): string {
  if (event.color) return event.color;
  const cal = calendarsStore.getCalendar(event.calendarId);
  return cal?.color ?? "#3b82f6";
}

function formatTime(dt: string): string {
  const d = new Date(dt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function onColumnClick(date: Date, event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const relativeY = event.clientY - rect.top + (scrollContainer.value?.scrollTop ?? 0);
  const hour = Math.floor(relativeY / HOUR_HEIGHT);
  const minutes = Math.round(((relativeY % HOUR_HEIGHT) / HOUR_HEIGHT) * 60 / 15) * 15; // Snap to 15min

  quickCreateDate.value = date;
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
