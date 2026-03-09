<template>
  <div class="h-full flex flex-col" :style="{ '--week-grid': gridCols }">
    <!-- Day headers with all-day events -->
    <div class="border-b border-border shrink-0 overflow-y-hidden pr-[var(--scrollbar-width,0px)]">
      <!-- Day names -->
      <div class="grid grid-cols-(--week-grid)">
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

      <!-- All-day / multi-day event bars -->
      <div
        v-if="allDayBars.bars.length > 0"
        class="grid grid-cols-(--week-grid) border-t border-border"
      >
        <div class="text-xs text-muted-foreground p-1 text-right">{{ t('allDay') }}</div>
        <div
          :class="`col-span-${dayCount} gap-y-0.5 px-0.5 py-0.5 grid`"
          :style="{ gridTemplateColumns: `repeat(${dayCount}, 1fr)`, minHeight: `${allDayBars.rowCount * 20 + 4}px` }"
        >
          <div
            v-for="bar in allDayBars.bars"
            :key="bar.event.id"
            class="text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity h-[18px] leading-[18px]"
            :style="{
              gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
              gridRow: bar.row + 1,
              backgroundColor: getEventColor(bar.event),
              color: 'white',
            }"
            @click.stop="eventPreview.open(bar.event.id)"
          >
            {{ bar.showTitle ? bar.event.summary : '' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable time grid -->
    <ShadcnScrollArea ref="scrollAreaRef" class="flex-1">
      <div class="grid grid-cols-(--week-grid) relative pt-2" :style="{ height: `${HOUR_HEIGHT * 24 + 8}px` }">
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
          v-for="(day, dayIndex) in weekDays"
          :key="day.key"
          class="relative border-l border-border select-none"
          @mousedown="onDayMouseDown(dayIndex, $event)"
          @mousemove="onDayMouseMove(dayIndex, $event)"
          @mouseup="onDayMouseUp(dayIndex)"
        >
          <!-- Hour lines -->
          <div
            v-for="hour in 24"
            :key="hour"
            class="absolute w-full border-t border-border/50"
            :style="{ top: `${hour * HOUR_HEIGHT}px` }"
          />

          <!-- Drag selection highlight -->
          <div
            v-if="drag.isDragging && drag.dayIndex === dayIndex"
            class="absolute left-0 right-0 bg-primary/20 rounded border border-primary/40 pointer-events-none z-10"
            :style="{
              top: `${dragSelectionTop}px`,
              height: `${dragSelectionHeight}px`,
            }"
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
            data-event
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
            @click.stop="eventPreview.open(pe.event.id)"
          >
            <div class="font-medium truncate">{{ pe.event.summary }}</div>
            <div class="truncate">
              {{ formatTime(pe.event.dtstart) }} – {{ formatTime(pe.event.dtend) }}
            </div>
          </div>
        </div>
      </div>
    </ShadcnScrollArea>

    <CalendarQuickCreate
      v-if="quickCreateDate"
      :date="quickCreateDate"
      :time="quickCreateTime"
      :end-time="quickCreateEndTime"
      @close="quickCreateDate = null"
      @created="quickCreateDate = null"
    />
  </div>
</template>

<script setup lang="ts">
import type { SelectEvent } from "~/database/schemas";
import type { ComponentPublicInstance } from "vue";
import {
  positionEventsInDay,
  groupEventsByDay,
  getAllDayEvents,
  eventSpansDate,
  toDateKey,
} from "~/composables/useTimeGrid";

const { t } = useI18n();
const calendarView = useCalendarViewStore();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();
const eventDrawer = useEventDrawerStore();
const eventPreview = useEventPreviewStore();
const settingsStore = useSettingsStore();

const dayCount = computed(() => settingsStore.showWeekends ? 7 : 5);
const gridCols = computed(() => `3.5rem repeat(${dayCount.value}, 1fr)`);

const scrollAreaRef = ref<ComponentPublicInstance | null>(null);
const scrollContainer = ref<HTMLElement | null>(null);
const quickCreateDate = ref<Date | null>(null);
const quickCreateTime = ref<string | null>(null);
const quickCreateEndTime = ref<string | null>(null);

const HOUR_HEIGHT = 60; // px per hour
const SLOT_MINUTES = 15;
const SLOT_HEIGHT = HOUR_HEIGHT / (60 / SLOT_MINUTES); // 15px per 15-min slot

// Find the reka-ui viewport element (actual scrollable container) and scroll to 7am
onMounted(() => {
  nextTick(() => {
    const el = scrollAreaRef.value?.$el;
    if (!el) return;
    const viewport = el.querySelector("[data-reka-scroll-area-viewport]") as HTMLElement | null;
    if (viewport) {
      scrollContainer.value = viewport;
      viewport.scrollTop = 7 * HOUR_HEIGHT;
    }
  });
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
    const dow = d.getDay();
    if (!settingsStore.showWeekends && (dow === 0 || dow === 6)) continue;
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

interface AllDayBar {
  event: SelectEvent;
  startCol: number;
  span: number;
  row: number;
  showTitle: boolean;
}

const allDayBars = computed(() => {
  const days = weekDays.value;
  if (days.length === 0) return { bars: [] as AllDayBar[], rowCount: 0 };

  const allDayEventsList = getAllDayEvents(eventsStore.events);
  const weekStartKey = days[0]!.key;
  const weekEndDate = new Date(days[days.length - 1]!.date);
  weekEndDate.setDate(weekEndDate.getDate() + 1);
  const weekEndKey = toDateKey(weekEndDate.toISOString());

  const bars: AllDayBar[] = [];
  const rowSlots: string[][] = [];

  for (const event of allDayEventsList) {
    const eventStartKey = toDateKey(event.dtstart);
    const eventEndKey = toDateKey(event.dtend);

    // Check overlap with this week
    if (eventStartKey >= weekEndKey || eventEndKey <= weekStartKey) continue;

    // Calculate column positions
    const clampedStartKey = eventStartKey < weekStartKey ? weekStartKey : eventStartKey;
    const clampedEndKey = eventEndKey > weekEndKey ? weekEndKey : eventEndKey;

    const startCol = days.findIndex((day) => day.key === clampedStartKey);
    const endCol = days.findIndex((day) => day.key >= clampedEndKey);
    const effectiveEndCol = endCol === -1 ? days.length : endCol;
    const span = Math.max(1, effectiveEndCol - Math.max(0, startCol));

    // Always show title — WeekView only renders one week at a time
    const showTitle = true;

    // Find first available row
    let assignedRow = 0;
    while (assignedRow < rowSlots.length) {
      const rowOccupied = rowSlots[assignedRow]!;
      const hasConflict = rowOccupied.some((id) => {
        const existing = bars.find((bar) => bar.event.id === id);
        if (!existing) return false;
        const existingEnd = existing.startCol + existing.span;
        return Math.max(0, startCol) < existingEnd && (Math.max(0, startCol) + span) > existing.startCol;
      });
      if (!hasConflict) break;
      assignedRow++;
    }

    if (!rowSlots[assignedRow]) rowSlots[assignedRow] = [];
    rowSlots[assignedRow]!.push(event.id);

    bars.push({
      event,
      startCol: Math.max(0, startCol),
      span,
      row: assignedRow,
      showTitle,
    });
  }

  return { bars, rowCount: rowSlots.length };
});

function getPositionedEvents(dateKey: string) {
  const dayEvents = eventsByDay.value.get(dateKey) ?? [];
  return positionEventsInDay(dayEvents);
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

// --- Drag-to-select ---
const drag = reactive({
  isDragging: false,
  dayIndex: -1,
  startSlot: 0,
  endSlot: 0,
});

function getTimeSlot(dayIndex: number, event: MouseEvent): number {
  if (!scrollContainer.value) return 0;
  const scrollRect = scrollContainer.value.getBoundingClientRect();
  const relativeY = event.clientY - scrollRect.top + scrollContainer.value.scrollTop;
  return Math.max(0, Math.min(95, Math.floor(relativeY / SLOT_HEIGHT)));
}

function slotToTime(slot: number): string {
  const totalMinutes = slot * SLOT_MINUTES;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const dragSelectionTop = computed(() => {
  const minSlot = Math.min(drag.startSlot, drag.endSlot);
  return minSlot * SLOT_HEIGHT;
});

const dragSelectionHeight = computed(() => {
  const diff = Math.abs(drag.endSlot - drag.startSlot) + 1;
  return diff * SLOT_HEIGHT;
});

function onDayMouseDown(dayIndex: number, event: MouseEvent) {
  if (event.button !== 0) return;
  if ((event.target as HTMLElement).closest("[data-event]")) return;

  const slot = getTimeSlot(dayIndex, event);
  drag.isDragging = true;
  drag.dayIndex = dayIndex;
  drag.startSlot = slot;
  drag.endSlot = slot;
}

function onDayMouseMove(dayIndex: number, event: MouseEvent) {
  if (!drag.isDragging || drag.dayIndex !== dayIndex) return;
  drag.endSlot = getTimeSlot(dayIndex, event);
}

function onDayMouseUp(dayIndex: number) {
  if (!drag.isDragging || drag.dayIndex !== dayIndex) {
    drag.isDragging = false;
    return;
  }

  const startSlot = Math.min(drag.startSlot, drag.endSlot);
  const endSlot = Math.max(drag.startSlot, drag.endSlot);
  const wasDragged = startSlot !== endSlot;

  drag.isDragging = false;

  const day = weekDays.value[dayIndex];
  if (!day) return;

  quickCreateDate.value = day.date;
  quickCreateTime.value = slotToTime(startSlot);
  quickCreateEndTime.value = wasDragged ? slotToTime(endSlot + 1) : null;
}
</script>

<i18n lang="yaml">
de:
  allDay: Ganztägig
en:
  allDay: All day
</i18n>
