<template>
  <div class="h-full flex flex-col">
    <!-- Day headers -->
    <div class="grid border-b border-border" :style="{ gridTemplateColumns: headerGridCols }">
      <div v-if="settingsStore.showWeekNumbers" class="text-center text-xs font-medium text-muted-foreground/60 py-2 w-8">KW</div>
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
          <template v-for="bar in week.multiDayBars" :key="`${bar.event.id}-${weekIndex}`">
            <div
              data-event
              :class="[
                'text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity h-[16px] leading-[16px]',
                isEventPast(bar.event) && 'opacity-40',
              ]"
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
                :key="event.id"
                data-event
                :class="[
                  'text-xs px-1.5 py-0.5 rounded truncate cursor-pointer',
                  'hover:opacity-80 transition-opacity',
                  isEventPast(event) && 'opacity-40',
                ]"
                :style="{
                  backgroundColor: getEventColor(event) + '20',
                  color: getEventColor(event),
                  borderLeft: `3px solid ${getEventColor(event)}`,
                }"
                @click.stop="eventPreview.open(event.id)"
              >
                <span class="font-medium">
                  {{ formatTime(event.dtstart) }}
                </span>
                {{ event.summary }}
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
import type { SelectEvent } from "~/database/schemas";
import { toDateKey } from "~/composables/useTimeGrid";

const calendarView = useCalendarViewStore();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();
const settingsStore = useSettingsStore();

const eventPreview = useEventPreviewStore();

const colCount = computed(() => settingsStore.showWeekends ? 7 : 5);
const headerGridCols = computed(() =>
  settingsStore.showWeekNumbers ? `2rem repeat(${colCount.value}, 1fr)` : `repeat(${colCount.value}, 1fr)`,
);

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function isEventPast(event: SelectEvent): boolean {
  return settingsStore.dimPastEvents && new Date(event.dtend) < new Date();
}

const quickCreateDate = ref<Date | null>(null);
const quickCreateEndDate = ref<Date | null>(null);

const weekDayNames = computed(() => {
  const formatter = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
  const days = [];
  const baseDate = new Date(2024, 0, 1); // Monday
  const count = settingsStore.showWeekends ? 7 : 5;
  for (let i = 0; i < count; i++) {
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
  singleDayEvents: SelectEvent[];
  totalOverflow: number;
}

interface MultiDayBar {
  event: SelectEvent;
  startCol: number;
  span: number;
  row: number;
  showTitle: boolean;
}

interface WeekRow {
  cells: GridCell[];
  multiDayBars: MultiDayBar[];
  barRows: number;
  weekNumber: number;
}

function isMultiDayEvent(event: SelectEvent): boolean {
  if (event.allDay) return true;
  const start = toDateKey(event.dtstart);
  const end = toDateKey(event.dtend);
  return start !== end;
}

function daysBetween(dateA: Date, dateB: Date): number {
  const msPerDay = 86400000;
  const a = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const b = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

const weeks = computed((): WeekRow[] => {
  const current = calendarView.currentDate;
  const year = current.getFullYear();
  const month = current.getMonth();

  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const offset = startDay === 0 ? -6 : 1 - startDay;
  const gridStart = new Date(year, month, 1 + offset);

  const today = new Date();
  const todayKey = toDateKey(today.toISOString());

  // Generate all 42 dates
  const allDates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    allDates.push(d);
  }

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

  // Build 6 week rows
  const weekRows: WeekRow[] = [];
  const visibleCols = settingsStore.showWeekends ? 7 : 5;

  for (let weekIdx = 0; weekIdx < 6; weekIdx++) {
    const weekStart = allDates[weekIdx * 7]!;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7); // exclusive end

    // Find multi-day events that overlap this week
    const bars: MultiDayBar[] = [];
    const rowSlots: string[][] = []; // Track which event IDs occupy each row

    for (const event of multiDayEvents) {
      const eventStart = new Date(event.dtstart);
      const eventEnd = new Date(event.dtend);

      // Check overlap: event starts before week ends AND event ends after week starts
      if (eventStart >= weekEnd || eventEnd <= weekStart) continue;

      // Calculate column positions within this week
      const barStartDate = eventStart < weekStart ? weekStart : eventStart;
      const barEndDate = eventEnd > weekEnd ? weekEnd : eventEnd;

      let startCol = daysBetween(weekStart, barStartDate);
      let endCol = daysBetween(weekStart, barEndDate);
      // Clamp to visible columns when weekends are hidden
      if (!settingsStore.showWeekends) {
        if (startCol >= visibleCols) continue; // Entirely in weekend
        endCol = Math.min(endCol, visibleCols);
        startCol = Math.min(startCol, visibleCols - 1);
      }
      const span = Math.max(1, endCol - startCol);

      // Is this the first week segment for this event?
      const showTitle = eventStart >= weekStart || daysBetween(eventStart, weekStart) % 7 === 0;

      // Find first available row (no overlap)
      let assignedRow = 0;
      while (assignedRow < rowSlots.length) {
        const rowOccupied = rowSlots[assignedRow]!;
        const hasConflict = rowOccupied.some((id) => {
          const existing = bars.find((b) => b.event.id === id);
          if (!existing) return false;
          const existingEnd = existing.startCol + existing.span;
          return startCol < existingEnd && (startCol + span) > existing.startCol;
        });
        if (!hasConflict) break;
        assignedRow++;
      }

      if (!rowSlots[assignedRow]) rowSlots[assignedRow] = [];
      rowSlots[assignedRow]!.push(event.id);

      bars.push({
        event,
        startCol,
        span,
        row: assignedRow,
        showTitle,
      });
    }

    // Build cells for this week (skip weekends when hidden)
    const cells: GridCell[] = [];
    for (let col = 0; col < visibleCols; col++) {
      const date = allDates[weekIdx * 7 + col]!;
      const dateKey = toDateKey(date.toISOString());
      const singleEvents = singleDayByDate.get(dateKey) ?? [];

      cells.push({
        date,
        dayNumber: date.getDate(),
        isCurrentMonth: date.getMonth() === month,
        isToday: dateKey === todayKey,
        singleDayEvents: singleEvents,
        totalOverflow: Math.max(0, singleEvents.length - 3),
      });
    }

    weekRows.push({
      cells,
      multiDayBars: bars,
      barRows: rowSlots.length,
      weekNumber: getISOWeekNumber(allDates[weekIdx * 7]!),
    });
  }

  return weekRows;
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
