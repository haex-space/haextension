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
        @click="eventPreview.open(event.id)"
      >
        {{ event.summary }}
      </div>
    </div>

    <!-- Scrollable time grid -->
    <ShadcnScrollArea ref="scrollAreaRef" class="flex-1">
      <div class="grid grid-cols-[3.5rem_1fr] relative pt-2" :style="{ height: `${HOUR_HEIGHT * 24 + 8}px` }">
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
          ref="dayColumn"
          class="relative border-l border-border select-none"
          @mousedown="onMouseDown($event)"
          @mousemove="onMouseMove($event)"
          @mouseup="onMouseUp"
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
            v-if="drag.isDragging"
            class="absolute left-0 right-0 bg-primary/20 rounded border border-primary/40 pointer-events-none z-10"
            :style="{
              top: `${dragSelectionTop}px`,
              height: `${dragSelectionHeight}px`,
            }"
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
            data-event
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
            @click.stop="eventPreview.open(pe.event.id)"
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

const scrollAreaRef = ref<ComponentPublicInstance | null>(null);
const scrollContainer = ref<HTMLElement | null>(null);
const dayColumn = ref<HTMLElement | null>(null);
const quickCreateDate = ref<Date | null>(null);
const quickCreateTime = ref<string | null>(null);
const quickCreateEndTime = ref<string | null>(null);

const HOUR_HEIGHT = 60;
const SLOT_MINUTES = 15;
const SLOT_HEIGHT = HOUR_HEIGHT / (60 / SLOT_MINUTES);

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
  eventsStore.events.filter((event) => !event.allDay && eventSpansDate(event, currentDateKey.value))
);

const allDayEventsForDay = computed(() =>
  getAllDayEvents(eventsStore.events).filter((event) => eventSpansDate(event, currentDateKey.value))
);

const positionedEvents = computed(() => positionEventsInDay(timedEvents.value));

function getEventColor(event: SelectEvent): string {
  if (event.color) return event.color;
  const cal = calendarsStore.getCalendar(event.calendarId);
  return cal?.color ?? "#3b82f6";
}

function formatTime(dt: string): string {
  const date = new Date(dt);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// --- Drag-to-select ---
const drag = reactive({
  isDragging: false,
  startSlot: 0,
  endSlot: 0,
});

function getTimeSlot(event: MouseEvent): number {
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

function onMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  if ((event.target as HTMLElement).closest("[data-event]")) return;

  const slot = getTimeSlot(event);
  drag.isDragging = true;
  drag.startSlot = slot;
  drag.endSlot = slot;
}

function onMouseMove(event: MouseEvent) {
  if (!drag.isDragging) return;
  drag.endSlot = getTimeSlot(event);
}

function onMouseUp() {
  if (!drag.isDragging) return;

  const startSlot = Math.min(drag.startSlot, drag.endSlot);
  const endSlot = Math.max(drag.startSlot, drag.endSlot);
  const wasDragged = startSlot !== endSlot;

  drag.isDragging = false;

  quickCreateDate.value = calendarView.currentDate;
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
