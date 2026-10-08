<template>
  <div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
    <!-- Toolbar -->
    <header class="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 shrink-0">
      <!-- Sidebar toggle -->
      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0"
        :title="sidebarOpen ? t('toolbar.hideSidebar') : t('toolbar.showSidebar')"
        @click="sidebarOpen = !sidebarOpen"
      >
        <PanelLeftClose v-if="sidebarOpen" class="w-5 h-5" />
        <PanelLeftOpen v-else class="w-5 h-5" />
      </button>

      <!-- Jump to today. Disabled-look when the current view already shows
           today, so a click would be a no-op and the user can tell. -->
      <button
        class="px-2.5 py-1 rounded-md text-sm font-medium transition-colors shrink-0"
        :class="
          calendarView.isShowingToday
            ? 'text-muted-foreground/50 cursor-default'
            : 'hover:bg-muted text-foreground'
        "
        :disabled="calendarView.isShowingToday"
        @click="calendarView.today()"
      >
        {{ t('toolbar.today') }}
      </button>

      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0"
        @click="calendarView.prev()"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0"
        @click="calendarView.next()"
      >
        <ChevronRight class="w-5 h-5" />
      </button>

      <h1 class="text-lg font-semibold truncate">
        {{ calendarView.title }}
      </h1>

      <div class="flex-1 min-w-0" />

      <!-- View Mode Select -->
      <ShadcnSelect v-model="calendarView.viewMode">
        <ShadcnSelectTrigger class="w-auto min-w-32 shrink-0 text-base py-2">
          <ShadcnSelectValue />
        </ShadcnSelectTrigger>
        <ShadcnSelectContent>
          <ShadcnSelectItem
            v-for="mode in viewModes"
            :key="mode.value"
            :value="mode.value"
            class="text-base py-2"
          >
            {{ mode.label }}
          </ShadcnSelectItem>
        </ShadcnSelectContent>
      </ShadcnSelect>

      <!-- Burger menu -->
      <ShadcnDropdownMenu>
        <ShadcnDropdownMenuTrigger as-child>
          <button class="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0">
            <EllipsisVertical class="w-5 h-5" />
          </button>
        </ShadcnDropdownMenuTrigger>
        <ShadcnDropdownMenuContent align="end" class="w-56">
          <ShadcnDropdownMenuItem class="py-2.5 text-base" @click="handleImport">
            <Upload class="w-5 h-5 mr-2" />
            {{ t('menu.import') }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuItem class="py-2.5 text-base" @click="handleExport">
            <Download class="w-5 h-5 mr-2" />
            {{ t('menu.export') }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuSeparator />
          <ShadcnDropdownMenuItem class="py-2.5 text-base" @click="handleShare">
            <Share2 class="w-5 h-5 mr-2" />
            {{ t('menu.share') }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuSeparator />
          <ShadcnDropdownMenuItem class="py-2.5 text-base" @click="router.push('/settings')">
            <Settings class="w-5 h-5 mr-2" />
            {{ t('menu.settings') }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuContent>
      </ShadcnDropdownMenu>
    </header>

    <!-- Body -->
    <div class="flex flex-1 overflow-hidden relative">
      <!-- Sidebar -->
      <aside
        :class="[
          'shrink-0 transition-all duration-200 ease-in-out',
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
          isSmallScreen && sidebarOpen ? 'absolute inset-y-0 left-0 z-30 bg-background shadow-lg' : '',
        ]"
        :style="{ width: sidebarOpen ? '18rem' : '0', minWidth: sidebarOpen ? '18rem' : '0' }"
      >
        <ShadcnScrollArea class="h-full">
          <CalendarSidebar
            :class="sidebarOpen ? 'p-3' : 'p-0'"
            @add-local="showCreateCalendar = true"
            @add-caldav="showCaldavDialog = true"
            @share="openShareDialog"
            @delete="confirmDeleteCalendarId = $event"
          />
        </ShadcnScrollArea>
      </aside>

      <!-- Backdrop for small screen sidebar overlay -->
      <div
        v-if="isSmallScreen && sidebarOpen"
        class="absolute inset-0 z-20 bg-black/30"
        @click="sidebarOpen = false"
      />

      <!-- Main content area -->
      <div class="flex-1 overflow-hidden bg-calendar-surface p-2 pb-3">
        <main class="h-full overflow-hidden bg-calendar-bg rounded-lg">
          <CalendarMonthView v-if="calendarView.viewMode === 'month'" />
          <CalendarWeekView v-else-if="calendarView.viewMode === 'week'" />
          <CalendarDayView v-else-if="calendarView.viewMode === 'day'" />
        </main>
      </div>
    </div>

    <!-- Create Calendar Dialog -->
    <CalendarCreateDialog
      v-model:open="showCreateCalendar"
    />

    <!-- Event Preview (lightweight) -->
    <CalendarEventPreview />

    <!-- Event Detail Drawer (full editor) -->
    <CalendarEventDrawer
      v-model:open="eventDrawer.isOpen"
      :event-id="eventDrawer.eventId"
      :initial-values="eventDrawer.initialValues"
    />

    <!-- Share Calendar Dialog -->
    <CalendarShareDialog
      v-if="shareCalendarId"
      v-model:open="showShareDialog"
      :calendar-id="shareCalendarId"
    />

    <!-- CalDAV Account Dialog -->
    <CalendarCaldavAccountDialog
      v-model:open="showCaldavDialog"
    />

    <!-- Delete calendar confirmation -->
    <UiDrawerModal
      v-model:open="showDeleteConfirm"
      :title="t('deleteConfirm.title')"
    >
      <template #content>
        <div class="space-y-2 p-4">
          <p
            class="font-semibold"
            :style="{ color: deleteCalendarColor }"
          >{{ deleteCalendarName }}</p>
          <p class="text-sm text-muted-foreground">
            {{ t('deleteConfirm.description') }}
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <button
            class="text-muted-foreground px-3 py-2"
            @click="showDeleteConfirm = false"
          >
            {{ t('deleteConfirm.abort') }}
          </button>
          <button
            class="bg-destructive text-destructive-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity"
            @click="executeDeleteCalendar"
          >
            {{ t('deleteConfirm.confirm') }}
          </button>
        </div>
      </template>
    </UiDrawerModal>

    <!-- Toast notifications -->
    <ShadcnSonnerToaster position="bottom-right" />

    <!-- Hidden file input for import -->
    <input
      ref="fileInput"
      type="file"
      accept=".ics,.ical"
      class="hidden"
      @change="onFileSelected"
    >
  </div>
</template>

<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  Download,
  EllipsisVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Share2,
  Upload,
} from "@lucide/vue";
import { watchDebounced, useMediaQuery } from "@vueuse/core";
import { calendars } from "~/database/schemas";

const { t } = useI18n();
const router = useRouter();

const calendarView = useCalendarViewStore();
const calendarsStore = useCalendarsStore();
const eventsStore = useEventsStore();
const haexVault = useHaexVaultStore();

const settingsStore = useSettingsStore();
const eventDrawer = useEventDrawerStore();
const eventTypesStore = useEventTypesStore();
const reminderScheduler = useReminderScheduler();
const eventPreview = useEventPreviewStore();

// Unsubscribe handle for the notification click listener.
let unsubscribeNotificationClick: (() => void) | null = null;

// Mount-time loads (calendars, types, events, scheduler.start) populate the
// refs the watchers below observe. Without this gate the watchers would re-run
// loadEventsAsync / syncRemote / rebuildAsync that onMounted just did.
const initialized = ref(false);

const showCreateCalendar = ref(false);
const showCaldavDialog = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const caldavSync = useCaldavSyncStore();
const caldavAccounts = useCaldavAccountsStore();

const isSmallScreen = useMediaQuery("(max-width: 640px)");
const sidebarOpen = ref(!isSmallScreen.value);

watch(isSmallScreen, (small) => {
  if (small) sidebarOpen.value = false;
});

const viewModes = computed(() => [
  { value: "month" as const, label: t("toolbar.month") },
  { value: "week" as const, label: t("toolbar.week") },
  { value: "day" as const, label: t("toolbar.day") },
]);

// Initialize on mount
onMounted(async () => {
  try {
    await haexVault.initializeAsync();
  } catch (error) {
    console.warn("[haex-calendar] HaexVault initialization failed (running outside extension host?):", error);
    return;
  }

  await settingsStore.loadSettingsAsync();
  calendarView.viewMode = settingsStore.defaultView;

  await calendarsStore.loadCalendarsAsync();
  await eventTypesStore.loadTypesAsync();

  // Auto-create personal calendar on first run (query DB directly to avoid HMR race conditions)
  if (haexVault.orm) {
    const existing = await haexVault.orm.select({ id: calendars.id }).from(calendars).limit(1);
    if (existing.length === 0) {
      await calendarsStore.createCalendarAsync({
        name: t("defaultCalendarName"),
        color: "#3b82f6",
      });
    }
  }

  await eventsStore.loadEventsAsync();

  // Load CalDAV accounts and trigger initial sync
  await caldavAccounts.loadAccountsAsync();
  caldavSync.syncAllRemoteCalendarsAsync(); // Non-blocking

  // Start firing reminders for the loaded data.
  reminderScheduler.start();

  // React to clicks on our notifications (deep-link "/event/:id"). Optional-
  // chained so it is a no-op against SDKs without the notifications API.
  unsubscribeNotificationClick =
    haexVault.client.notifications?.onClick?.((e) => {
      const path = e.path;
      if (!path?.startsWith("/event/")) return;
      const id = path.slice("/event/".length).split("?")[0];
      if (id) eventPreview.open(id);
    }) ?? null;

  initialized.value = true;
});

onUnmounted(() => {
  reminderScheduler.stop();
  unsubscribeNotificationClick?.();
});

// Reload events when view range or visible calendars change
watchDebounced(
  () => [calendarView.visibleRange, calendarsStore.visibleCalendarIds] as const,
  () => {
    if (!initialized.value) return;
    eventsStore.loadEventsAsync();
    caldavSync.syncAllRemoteCalendarsAsync();
  },
  { debounce: 100, deep: true }
);

// Recompute reminders after event / type / reminder mutations.
watchDebounced(
  () => [eventsStore.rawEvents, eventTypesStore.types, eventTypesStore.remindersByType] as const,
  () => {
    if (!initialized.value) return;
    reminderScheduler.refresh();
  },
  { debounce: 500, deep: true }
);

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

function handleExport() {
  // TODO: implement .ics export
  console.log("[haex-calendar] Export not yet implemented");
}

// Share dialog
const shareCalendarId = ref<string | null>(null);
const showShareDialog = computed({
  get: () => shareCalendarId.value !== null,
  set: (v) => { if (!v) shareCalendarId.value = null; },
});

function handleShare() {
  // Open share dialog for the first calendar (toolbar menu)
  const firstCalendar = calendarsStore.calendars[0];
  if (!firstCalendar) return;
  shareCalendarId.value = firstCalendar.id;
}

function openShareDialog(calendarId: string) {
  shareCalendarId.value = calendarId;
}

// Delete confirmation
const confirmDeleteCalendarId = ref<string | null>(null);
const showDeleteConfirm = computed({
  get: () => confirmDeleteCalendarId.value !== null,
  set: (v) => { if (!v) confirmDeleteCalendarId.value = null; },
});

const deleteCalendarName = computed(() => {
  if (!confirmDeleteCalendarId.value) return "";
  return calendarsStore.getCalendar(confirmDeleteCalendarId.value)?.name ?? "";
});

const deleteCalendarColor = computed(() => {
  if (!confirmDeleteCalendarId.value) return "";
  return calendarsStore.getCalendar(confirmDeleteCalendarId.value)?.color ?? "#3b82f6";
});

async function executeDeleteCalendar() {
  if (!confirmDeleteCalendarId.value) return;
  await calendarsStore.deleteCalendarAsync(confirmDeleteCalendarId.value);
  confirmDeleteCalendarId.value = null;
}

</script>

<i18n lang="yaml">
de:
  toolbar:
    today: Heute
    month: Monat
    week: Woche
    day: Tag
    hideSidebar: Sidebar ausblenden
    showSidebar: Sidebar einblenden
  defaultCalendarName: Persönlich
  deleteConfirm:
    title: Kalender löschen
    description: Dieser Kalender und alle zugehörigen Termine werden unwiderruflich gelöscht.
    confirm: Löschen
    abort: Abbrechen
  menu:
    import: Importieren (.ics)
    export: Exportieren (.ics)
    share: Kalender teilen
    settings: Einstellungen
en:
  toolbar:
    today: Today
    month: Month
    week: Week
    day: Day
    hideSidebar: Hide sidebar
    showSidebar: Show sidebar
  defaultCalendarName: Personal
  deleteConfirm:
    title: Delete calendar
    description: This calendar and all its events will be permanently deleted.
    confirm: Delete
    abort: Cancel
  menu:
    import: Import (.ics)
    export: Export (.ics)
    share: Share calendar
    settings: Settings
</i18n>
