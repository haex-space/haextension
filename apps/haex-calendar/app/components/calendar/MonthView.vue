<template>
  <div class="h-full flex flex-col">
    <!-- Day headers -->
    <div class="grid grid-cols-7 border-b border-border">
      <div
        v-for="day in weekDayNames"
        :key="day"
        class="text-center text-xs font-medium text-muted-foreground py-2"
      >
        {{ day }}
      </div>
    </div>

    <!-- Grid -->
    <div class="flex-1 grid grid-cols-7 auto-rows-fr">
      <div
        v-for="(cell, index) in gridCells"
        :key="index"
        :class="[
          'border-b border-r border-border p-1 min-h-0 overflow-hidden cursor-pointer',
          'hover:bg-muted/50 transition-colors',
          !cell.isCurrentMonth && 'opacity-40',
          cell.isToday && 'bg-primary/5',
        ]"
        @click="onCellClick(cell, $event)"
      >
        <!-- Day number -->
        <button
          :class="[
            'text-xs font-medium w-6 h-6 rounded-full flex items-center justify-center mb-0.5',
            cell.isToday ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
          ]"
          @click.stop="calendarView.goToDay(cell.date)"
        >
          {{ cell.dayNumber }}
        </button>

        <!-- Event chips -->
        <div class="space-y-0.5">
          <div
            v-for="event in cell.events.slice(0, 3)"
            :key="event.id"
            :class="[
              'text-xs px-1.5 py-0.5 rounded truncate cursor-pointer',
              'hover:opacity-80 transition-opacity',
            ]"
            :style="{
              backgroundColor: getEventColor(event) + '20',
              color: getEventColor(event),
              borderLeft: `3px solid ${getEventColor(event)}`,
            }"
            @click.stop="openEventDrawer(event.id)"
          >
            <span v-if="!event.allDay" class="font-medium">
              {{ formatTime(event.dtstart) }}
            </span>
            {{ event.summary }}
          </div>
          <div
            v-if="cell.events.length > 3"
            class="text-xs text-muted-foreground px-1.5"
          >
            +{{ cell.events.length - 3 }}
          </div>
        </div>
      </div>
    </div>

    <!-- Quick create popover -->
    <CalendarQuickCreate
      v-if="quickCreateDate"
      :date="quickCreateDate"
      :position="quickCreatePosition"
      @close="quickCreateDate = null"
      @created="quickCreateDate = null"
    />
  </div>
</template>

<script setup lang="ts">
import type { SelectEvent } from "~/database/schemas";
import { toDateKey } from "~/composables/useTimeGrid";

const calendarView = useCalendarViewStore();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();

const openEventDrawer = inject<(id: string) => void>("openEventDrawer")!;

const quickCreateDate = ref<Date | null>(null);
const quickCreatePosition = ref({ x: 0, y: 0 });

const { t } = useI18n();

const weekDayNames = computed(() => {
  const formatter = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
  const days = [];
  // Start from Monday
  const baseDate = new Date(2024, 0, 1); // Monday
  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    days.push(formatter.format(d));
  }
  return days;
});

interface GridCell {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: SelectEvent[];
}

const gridCells = computed((): GridCell[] => {
  const current = calendarView.currentDate;
  const year = current.getFullYear();
  const month = current.getMonth();

  // First day of the month
  const firstDay = new Date(year, month, 1);
  // Start from Monday of the first week
  const startDay = firstDay.getDay(); // 0=Sun
  const offset = startDay === 0 ? -6 : 1 - startDay; // Adjust to Monday start
  const gridStart = new Date(year, month, 1 + offset);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Build event map by date
  const eventsByDate = new Map<string, SelectEvent[]>();
  for (const event of eventsStore.events) {
    const key = toDateKey(event.dtstart);
    const list = eventsByDate.get(key) ?? [];
    list.push(event);
    eventsByDate.set(key, list);
  }

  // Generate 42 cells (6 weeks)
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    cells.push({
      date: new Date(d),
      dayNumber: d.getDate(),
      isCurrentMonth: d.getMonth() === month,
      isToday: dateKey === todayKey,
      events: eventsByDate.get(dateKey) ?? [],
    });
  }

  return cells;
});

function getEventColor(event: SelectEvent): string {
  if (event.color) return event.color;
  const cal = calendarsStore.getCalendar(event.calendarId);
  return cal?.color ?? "#3b82f6";
}

function formatTime(dtstart: string): string {
  const date = new Date(dtstart);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function onCellClick(cell: GridCell, mouseEvent: MouseEvent) {
  quickCreateDate.value = cell.date;
  quickCreatePosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY };
}
</script>
