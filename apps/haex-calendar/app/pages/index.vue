<template>
  <div class="h-screen flex flex-col bg-background text-foreground">
    <!-- Toolbar -->
    <header class="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
      <!-- Navigation -->
      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors"
        :title="t('toolbar.today')"
        @click="calendarView.today()"
      >
        <CalendarDays class="w-5 h-5" />
      </button>

      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors"
        @click="calendarView.prev()"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors"
        @click="calendarView.next()"
      >
        <ChevronRight class="w-5 h-5" />
      </button>

      <h1 class="text-lg font-semibold min-w-48">
        {{ calendarView.title }}
      </h1>

      <div class="flex-1" />

      <!-- View Mode Toggle -->
      <div class="flex bg-muted rounded-md p-0.5 gap-0.5">
        <button
          v-for="mode in viewModes"
          :key="mode.value"
          :class="[
            'px-3 py-1 text-sm rounded-sm transition-colors',
            calendarView.viewMode === mode.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="calendarView.viewMode = mode.value"
        >
          {{ mode.label }}
        </button>
      </div>
    </header>

    <!-- Body -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <aside class="w-56 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto shrink-0">
        <!-- Calendar list -->
        <div class="space-y-1">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {{ t('sidebar.calendars') }}
            </span>
            <button
              class="p-1 rounded hover:bg-muted transition-colors"
              :title="t('sidebar.addCalendar')"
              @click="showCreateCalendar = true"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>

          <label
            v-for="cal in calendarsStore.calendars"
            :key="cal.id"
            class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer group"
          >
            <input
              type="checkbox"
              :checked="cal.visible"
              :style="{ accentColor: cal.color }"
              class="rounded"
              @change="calendarsStore.toggleVisibilityAsync(cal.id)"
            />
            <span
              class="w-2.5 h-2.5 rounded-full shrink-0"
              :style="{ backgroundColor: cal.color }"
            />
            <span class="text-sm truncate flex-1">{{ cal.name }}</span>
            <span
              v-if="cal.spaceId"
              class="text-xs text-muted-foreground"
              :title="t('sidebar.shared')"
            >
              <Users class="w-3.5 h-3.5" />
            </span>
          </label>
        </div>

        <div class="border-t border-border pt-3 space-y-1 mt-auto">
          <button
            class="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-sm transition-colors"
            @click="handleImport"
          >
            <Upload class="w-4 h-4" />
            {{ t('sidebar.import') }}
          </button>
        </div>
      </aside>

      <!-- Main content area -->
      <main class="flex-1 overflow-hidden">
        <CalendarMonthView v-if="calendarView.viewMode === 'month'" />
        <CalendarWeekView v-else-if="calendarView.viewMode === 'week'" />
        <CalendarDayView v-else-if="calendarView.viewMode === 'day'" />
      </main>
    </div>

    <!-- Create Calendar Dialog -->
    <CalendarCreateDialog
      v-model:open="showCreateCalendar"
    />

    <!-- Event Detail Drawer -->
    <CalendarEventDrawer
      v-model:open="showEventDrawer"
      :event-id="selectedEventId"
    />

    <!-- Hidden file input for import -->
    <input
      ref="fileInput"
      type="file"
      accept=".ics,.ical"
      class="hidden"
      @change="onFileSelected"
    />
  </div>
</template>

<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Upload,
  Users,
} from "lucide-vue-next";
import { watchDebounced } from "@vueuse/core";

const { t } = useI18n();

const calendarView = useCalendarViewStore();
const calendarsStore = useCalendarsStore();
const eventsStore = useEventsStore();
const haexVault = useHaexVaultStore();

const showCreateCalendar = ref(false);
const showEventDrawer = ref(false);
const selectedEventId = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const viewModes = computed(() => [
  { value: "month" as const, label: t("toolbar.month") },
  { value: "week" as const, label: t("toolbar.week") },
  { value: "day" as const, label: t("toolbar.day") },
]);

// Initialize on mount
onMounted(async () => {
  await haexVault.initializeAsync();
  await calendarsStore.loadCalendarsAsync();

  // Auto-create personal calendar on first run
  if (calendarsStore.calendars.length === 0) {
    await calendarsStore.createCalendarAsync({
      name: "Persönlich",
      color: "#3b82f6",
    });
  }

  await eventsStore.loadEventsAsync();
});

// Reload events when view range or visible calendars change
watchDebounced(
  () => [calendarView.visibleRange, calendarsStore.visibleCalendarIds] as const,
  () => eventsStore.loadEventsAsync(),
  { debounce: 100, deep: true }
);

// Provide event selection to child components
function openEventDrawer(eventId: string) {
  selectedEventId.value = eventId;
  showEventDrawer.value = true;
}

// iCal import
function handleImport() {
  fileInput.value?.click();
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const { importFileAsync } = useIcal();
  // Import into first calendar (or show picker if multiple)
  const firstCalendar = calendarsStore.calendars[0];
  if (!firstCalendar) return;

  const result = await importFileAsync(file, firstCalendar.id);
  console.log(`[haex-calendar] Import: ${result.imported} new, ${result.updated} updated, ${result.skipped} skipped`);

  // Reset file input
  input.value = "";
}

// Provide openEventDrawer to child components
provide("openEventDrawer", openEventDrawer);
</script>

<i18n lang="yaml">
de:
  toolbar:
    today: Heute
    month: Monat
    week: Woche
    day: Tag
  sidebar:
    calendars: Kalender
    addCalendar: Kalender erstellen
    shared: Geteilt
    import: Importieren (.ics)
en:
  toolbar:
    today: Today
    month: Month
    week: Week
    day: Day
  sidebar:
    calendars: Calendars
    addCalendar: Create calendar
    shared: Shared
    import: Import (.ics)
</i18n>
