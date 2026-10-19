<template>
  <div class="h-full flex flex-col">
    <!-- Day headers -->
    <div class="grid border-b border-border" :style="{ gridTemplateColumns: headerGridCols }">
      <div v-if="settingsStore.showWeekNumbers" class="text-center text-xs font-medium text-muted-foreground/60 py-2 w-8">{{ t('weekShort') }}</div>
      <div
        v-for="day in weekDayNames"
        :key="day"
        class="text-center text-xs font-medium text-muted-foreground py-2"
      >
        {{ day }}
      </div>
    </div>

    <!-- Week rows -->
    <div class="flex-1 flex flex-col select-none">
      <div
        v-for="(week, weekIndex) in weeks"
        :key="weekIndex"
        class="flex-1 min-h-0 flex flex-col border-b border-border"
      >
        <!-- Day numbers + multi-day bars -->
        <div class="grid" :style="{ gridTemplateColumns: headerGridCols }">
          <div
            v-if="settingsStore.showWeekNumbers"
            class="flex items-start justify-center w-8 pt-1 text-xs text-muted-foreground/60 font-mono"
          >
            {{ week.weekNumber }}
          </div>
          <div
            v-for="(cell, colIndex) in week.cells"
            :key="colIndex"
            :class="[
              'border-r border-border px-1 pt-0.5 cursor-pointer transition-colors',
              !cell.isCurrentMonth && 'opacity-40',
              cell.isToday && 'bg-primary/5',
              isCellInSelection(weekIndex * colCount + colIndex) ? 'bg-primary/15' : 'hover:bg-muted/50',
            ]"
            @mousedown="onCellMouseDown(weekIndex * colCount + colIndex, $event)"
            @mouseenter="onCellMouseEnter(weekIndex * colCount + colIndex)"
            @mouseup="onCellMouseUp"
          >
            <button
              :class="[
                'text-xs font-medium w-6 h-6 rounded-full flex items-center justify-center',
                cell.isToday ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              ]"
              @click.stop="calendarView.goToDay(cell.date)"
            >
              {{ cell.dayNumber }}
            </button>
          </div>
        </div>

        <!-- Multi-day event bars -->
        <div
          v-if="week.multiDayBars.length > 0"
          class="grid gap-y-0.5 px-0.5"
          :style="{ gridTemplateColumns: settingsStore.showWeekNumbers ? `2rem repeat(${colCount}, 1fr)` : `repeat(${colCount}, 1fr)`, minHeight: `${week.multiDayBars.length > 0 ? week.barRows * 18 + 2 : 0}px` }"
        >
          <div v-if="settingsStore.showWeekNumbers" />
          <template v-for="bar in week.multiDayBars" :key="`${bar.event.id}-${bar.event.dtstart}-${weekIndex}`">
            <div
              data-event
              :class="[
                'text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity h-[16px] leading-[16px]',
                isEventPast(bar.event) && 'opacity-40',
              ]"
              :style="{
                gridColumn: `${bar.startCol + (settingsStore.showWeekNumbers ? 2 : 1)} / span ${bar.span}`,
                gridRow: bar.row + 1,
                backgroundColor: eventsStore.effectiveColor(bar.event),
                color: 'white',
              }"
              @click.stop="eventPreview.open(bar.event.id, bar.event.dtstart)"
            >
              {{ bar.event.summary }}
            </div>
          </template>
        </div>

        <!-- Single-day events per cell -->
        <div class="flex-1 grid min-h-0" :style="{ gridTemplateColumns: headerGridCols }">
          <div v-if="settingsStore.showWeekNumbers" class="w-8" />
          <div
            v-for="(cell, colIndex) in week.cells"
            :key="colIndex"
            :class="[
              'border-r border-border px-1 pb-0.5 overflow-hidden cursor-pointer transition-colors',
              !cell.isCurrentMonth && 'opacity-40',
              isCellInSelection(weekIndex * colCount + colIndex) ? 'bg-primary/15' : 'hover:bg-muted/50',
            ]"
            @mousedown="onCellMouseDown(weekIndex * colCount + colIndex, $event)"
            @mouseenter="onCellMouseEnter(weekIndex * colCount + colIndex)"
            @mouseup="onCellMouseUp"
          >
            <div class="space-y-0.5">
              <div
                v-for="event in cell.singleDayEvents.slice(0, 3)"
                :key="`${event.id}-${event.dtstart}`"
                data-event
                :class="[
                  'text-xs px-1.5 py-0.5 rounded truncate cursor-pointer',
                  'hover:opacity-80 transition-opacity',
                  isEventPast(event) && 'opacity-40',
                ]"
                :style="{
                  backgroundColor: eventsStore.effectiveColor(event) + '20',
                  color: eventsStore.effectiveColor(event),
                  borderLeft: `3px solid ${eventsStore.effectiveColor(event)}`,
                }"
                @click.stop="eventPreview.open(event.id, event.dtstart)"
              >
                <span
                  v-if="event.kind === 'task'"
                  class="inline-flex items-center mr-1 align-middle cursor-pointer"
                  role="checkbox"
                  :aria-checked="!!event.completedAt"
                  @click.stop="eventsStore.completeTaskAsync(event.id)"
                >
                  <CheckSquare v-if="event.completedAt" class="w-3 h-3" />
                  <Square v-else class="w-3 h-3" />
                </span>
                <span v-else class="font-medium">
                  {{ formatClock(new Date(event.dtstart), settingsStore.timeFormat) }}
                </span>
                <span :class="event.completedAt ? 'line-through opacity-60' : ''">{{ event.summary }}</span>
              </div>
              <div
                v-if="cell.totalOverflow > 0"
                class="text-xs text-muted-foreground px-1.5"
              >
                +{{ cell.totalOverflow }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick create popover -->
    <CalendarQuickCreate
      v-if="quickCreateDate"
      :date="quickCreateDate"
      :end-date="quickCreateEndDate"
      @close="quickCreateDate = null"
      @created="quickCreateDate = null"
    />
  </div>
</template>

<script setup lang="ts">
import { CheckSquare, Square } from "@lucide/vue";
import type { SelectEvent } from "~/database/schemas";
import { eventSpan, formatClock, isoWeek, isWeekend, toLocalDateKey } from "~/lib/dates";
import { eventDayRange, packBars, toDateKey, type DayBar } from "~/lib/timeGrid";

const { t, locale } = useI18n();
const calendarView = useCalendarViewStore();
const eventsStore = useEventsStore();
const settingsStore = useSettingsStore();

const eventPreview = useEventPreviewStore();

const colCount = computed(() => settingsStore.showWeekends ? 7 : 5);
const headerGridCols = computed(() =>
  settingsStore.showWeekNumbers ? `2rem repeat(${colCount.value}, 1fr)` : `repeat(${colCount.value}, 1fr)`,
);

function isEventPast(event: SelectEvent): boolean {
  return settingsStore.dimPastEvents && eventSpan(event).end < new Date();
}

const quickCreateDate = ref<Date | null>(null);
const quickCreateEndDate = ref<Date | null>(null);

const isVisibleDay = (date: Date) => settingsStore.showWeekends || !isWeekend(date);

const weekDayNames = computed(() => {
  const formatter = new Intl.DateTimeFormat(locale.value, { weekday: "short" });
  return calendarView.monthGrid.slice(0, 7).filter(isVisibleDay).map((d) => formatter.format(d));
});

interface GridCell {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  singleDayEvents: SelectEvent[];
  totalOverflow: number;
}

interface WeekRow {
  cells: GridCell[];
  multiDayBars: DayBar[];
  barRows: number;
  weekNumber: number;
}

function isMultiDayEvent(event: SelectEvent): boolean {
  if (event.allDay) return true;
  const { first, last } = eventDayRange(event);
  return first !== last;
}

const weeks = computed((): WeekRow[] => {
  const month = calendarView.currentDate.getMonth();
  const todayKey = toLocalDateKey(new Date());

  // Same 42 days the store loads events for.
  const allDates = calendarView.monthGrid;

  // Separate multi-day and single-day events
  const multiDayEvents: SelectEvent[] = [];
  const singleDayByDate = new Map<string, SelectEvent[]>();

  for (const event of eventsStore.events) {
    if (isMultiDayEvent(event)) {
      multiDayEvents.push(event);
    } else {
      const key = toDateKey(event.dtstart);
      const list = singleDayByDate.get(key) ?? [];
      list.push(event);
      singleDayByDate.set(key, list);
    }
  }

  const weekRows: WeekRow[] = [];
  for (let weekIdx = 0; weekIdx < 6; weekIdx++) {
    const weekDates = allDates.slice(weekIdx * 7, weekIdx * 7 + 7);
    const days = weekDates.filter(isVisibleDay);
    const dayKeys = days.map(toLocalDateKey);
    const { bars, rowCount } = packBars(multiDayEvents, dayKeys);

    const cells: GridCell[] = days.map((date, col) => {
      const singleEvents = singleDayByDate.get(dayKeys[col]!) ?? [];
      return {
        date,
        dayNumber: date.getDate(),
        isCurrentMonth: date.getMonth() === month,
        isToday: dayKeys[col] === todayKey,
        singleDayEvents: singleEvents,
        totalOverflow: Math.max(0, singleEvents.length - 3),
      };
    });

    weekRows.push({
      cells,
      multiDayBars: bars,
      barRows: rowCount,
      // The row's middle day decides the ISO week for either week start.
      weekNumber: isoWeek(weekDates[3]!),
    });
  }

  return weekRows;
});

// --- Drag-to-select ---
const drag = reactive({
  isDragging: false,
  startIndex: -1,
  endIndex: -1,
});

function isCellInSelection(cellIndex: number): boolean {
  if (!drag.isDragging) return false;
  const minIndex = Math.min(drag.startIndex, drag.endIndex);
  const maxIndex = Math.max(drag.startIndex, drag.endIndex);
  return cellIndex >= minIndex && cellIndex <= maxIndex;
}

function onCellMouseDown(cellIndex: number, event: MouseEvent) {
  if (event.button !== 0) return;
  if ((event.target as HTMLElement).closest("[data-event]")) return;

  drag.isDragging = true;
  drag.startIndex = cellIndex;
  drag.endIndex = cellIndex;
}

function onCellMouseEnter(cellIndex: number) {
  if (!drag.isDragging) return;
  drag.endIndex = cellIndex;
}

function onCellMouseUp() {
  if (!drag.isDragging) return;

  const startIndex = Math.min(drag.startIndex, drag.endIndex);
  const endIndex = Math.max(drag.startIndex, drag.endIndex);
  const wasDragged = startIndex !== endIndex;

  drag.isDragging = false;

  const allCells = weeks.value.flatMap((week) => week.cells);
  const startCell = allCells[startIndex];
  const endCell = allCells[endIndex];
  if (!startCell) return;

  quickCreateDate.value = startCell.date;
  quickCreateEndDate.value = wasDragged && endCell ? endCell.date : null;
}

// Handle mouseup outside the grid
onMounted(() => {
  const onGlobalMouseUp = () => {
    if (drag.isDragging) {
      onCellMouseUp();
    }
  };
  window.addEventListener("mouseup", onGlobalMouseUp);
  onUnmounted(() => window.removeEventListener("mouseup", onGlobalMouseUp));
});
</script>

<i18n lang="yaml">
de:
  weekShort: KW
en:
  weekShort: Wk
</i18n>
