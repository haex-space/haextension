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

      <!-- Navigation -->
      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0"
        :title="t('toolbar.today')"
        @click="calendarView.today()"
      >
        <CalendarDays class="w-5 h-5" />
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
        <ShadcnSelectTrigger class="w-auto shrink-0">
          <ShadcnSelectValue />
        </ShadcnSelectTrigger>
        <ShadcnSelectContent>
          <ShadcnSelectItem
            v-for="mode in viewModes"
            :key="mode.value"
            :value="mode.value"
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
        <ShadcnDropdownMenuContent align="end" class="w-48">
          <ShadcnDropdownMenuItem @click="handleImport">
            <Upload class="w-4 h-4 mr-2" />
            {{ t('menu.import') }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuItem @click="handleExport">
            <Download class="w-4 h-4 mr-2" />
            {{ t('menu.export') }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuSeparator />
          <ShadcnDropdownMenuItem @click="handleShare">
            <Share2 class="w-4 h-4 mr-2" />
            {{ t('menu.share') }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuSeparator />
          <ShadcnDropdownMenuItem @click="router.push('/settings')">
            <Settings class="w-4 h-4 mr-2" />
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
          <div :class="['flex flex-col gap-3', sidebarOpen ? 'p-3' : 'p-0']">
        <!-- Mini month calendar -->
        <ShadcnCalendar
          :model-value="selectedCalendarDate"
          locale="de-DE"
          weekday-format="short"
          class="p-0 w-full"
          @update:model-value="onMiniCalendarSelect"
        />

        <div class="border-t border-border" />

        <!-- Calendar list -->
        <div class="space-y-1">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {{ t('sidebar.calendars') }}
            </span>
            <ShadcnDropdownMenu>
              <ShadcnDropdownMenuTrigger as-child>
                <button
                  class="p-1.5 rounded-md hover:bg-muted transition-colors"
                  :title="t('sidebar.addCalendar')"
                >
                  <Plus class="w-5 h-5" />
                </button>
              </ShadcnDropdownMenuTrigger>
              <ShadcnDropdownMenuContent align="end" class="w-48">
                <ShadcnDropdownMenuItem @click="showCreateCalendar = true">
                  <CalendarPlus class="w-4 h-4 mr-2" />
                  {{ t('sidebar.addLocal') }}
                </ShadcnDropdownMenuItem>
                <ShadcnDropdownMenuItem @click="showCaldavDialog = true">
                  <Cloud class="w-4 h-4 mr-2" />
                  {{ t('sidebar.addCaldav') }}
                </ShadcnDropdownMenuItem>
              </ShadcnDropdownMenuContent>
            </ShadcnDropdownMenu>
          </div>

          <div
            v-for="cal in calendarsStore.calendars"
            :key="cal.id"
            class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted cursor-pointer group"
            @contextmenu.prevent="openCalendarMenu(cal.id)"
            @pointerdown="startLongPress(cal.id, $event)"
            @pointerup="cancelLongPress"
            @pointerleave="cancelLongPress"
          >
            <ShadcnCheckbox
              :model-value="cal.visible"
              :style="{ '--color-primary': cal.color, '--color-primary-foreground': '#fff' }"
              @update:model-value="calendarsStore.toggleVisibilityAsync(cal.id)"
            />
            <span
              class="w-3 h-3 rounded-full shrink-0"
              :style="{ backgroundColor: cal.color }"
            />
            <input
              v-if="renamingCalendarId === cal.id"
              ref="renameInput"
              v-model="renameValue"
              class="flex-1 min-w-0 bg-muted rounded-md px-2 py-0.5 text-base outline-none focus:ring-2 ring-primary"
              @keydown.enter="confirmRename"
              @keydown.escape="renamingCalendarId = null"
              @click.stop
            />
            <span v-else class="text-base truncate flex-1">{{ cal.name }}</span>
            <span
              v-if="cal.caldavAccountId"
              class="text-muted-foreground"
              :title="t('sidebar.remote')"
            >
              <Cloud class="w-4 h-4" />
            </span>
            <span
              v-if="cal.spaceId"
              class="text-muted-foreground"
              :title="t('sidebar.shared')"
            >
              <Users class="w-4 h-4" />
            </span>

            <!-- Calendar context menu -->
            <ShadcnDropdownMenu v-model:open="calendarMenuOpen[cal.id]">
              <ShadcnDropdownMenuTrigger as-child>
                <button
                  class="p-1 rounded-md hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                  @click.stop
                >
                  <EllipsisVertical class="w-4 h-4" />
                </button>
              </ShadcnDropdownMenuTrigger>
              <ShadcnDropdownMenuContent align="end" class="w-48">
                <ShadcnDropdownMenuItem v-if="cal.caldavAccountId" @click="syncCalendar(cal.id)">
                  <RefreshCw class="w-4 h-4 mr-2" />
                  {{ t('sidebar.syncNow') }}
                </ShadcnDropdownMenuItem>
                <ShadcnDropdownMenuItem @click="openShareDialog(cal.id)">
                  <Share2 class="w-4 h-4 mr-2" />
                  {{ t('sidebar.share') }}
                </ShadcnDropdownMenuItem>
                <ShadcnDropdownMenuItem @click="startRenameCalendar(cal)">
                  <Pencil class="w-4 h-4 mr-2" />
                  {{ t('sidebar.rename') }}
                </ShadcnDropdownMenuItem>
                <ShadcnDropdownMenuSeparator />
                <ShadcnDropdownMenuLabel class="text-muted-foreground">
                  {{ t('sidebar.color') }}
                </ShadcnDropdownMenuLabel>
                <div class="flex gap-1.5 flex-wrap px-2 py-1.5">
                  <button
                    v-for="c in presetColors"
                    :key="c"
                    :class="[
                      'w-6 h-6 rounded-full border-2 transition-transform',
                      cal.color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-110',
                    ]"
                    :style="{ backgroundColor: c }"
                    @click="calendarsStore.updateCalendarAsync(cal.id, { color: c })"
                  />
                </div>
                <ShadcnDropdownMenuSeparator />
                <ShadcnDropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  @click="confirmDeleteCalendarId = cal.id"
                >
                  <Trash2 class="w-4 h-4 mr-2" />
                  {{ t('sidebar.delete') }}
                </ShadcnDropdownMenuItem>
              </ShadcnDropdownMenuContent>
            </ShadcnDropdownMenu>
          </div>
        </div>

          </div>
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
    <ShadcnAlertDialog v-model:open="showDeleteConfirm">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>{{ t('deleteConfirm.title') }}</ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>
            <span
              class="font-semibold inline-block my-1"
              :style="{ color: deleteCalendarColor }"
            >{{ deleteCalendarName }}</span>
            <br>
            {{ t('deleteConfirm.description') }}
          </ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>{{ t('deleteConfirm.abort') }}</ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction @click="executeDeleteCalendar">
            {{ t('deleteConfirm.confirm') }}
          </ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>

    <!-- Toast notifications -->
    <ShadcnSonnerToaster position="bottom-right" />

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
  Download,
  EllipsisVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Palette,
  CalendarPlus,
  Cloud,
  RefreshCw,
  Settings,
  Share2,
  Trash2,
  Upload,
  Users,
} from "lucide-vue-next";
import { CalendarDate, type DateValue } from "@internationalized/date";
import { watchDebounced, useMediaQuery, onClickOutside } from "@vueuse/core";

const { t } = useI18n();
const router = useRouter();

const calendarView = useCalendarViewStore();
const calendarsStore = useCalendarsStore();
const eventsStore = useEventsStore();
const haexVault = useHaexVaultStore();

const settingsStore = useSettingsStore();
const eventDrawer = useEventDrawerStore();

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

// Mini calendar bridge: convert between CalendarDate (reka-ui) and Date (store)
const selectedCalendarDate = computed(() => {
  const date = calendarView.currentDate;
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
});

function onMiniCalendarSelect(value: DateValue | undefined) {
  if (!value) return;
  const date = new Date(value.year, value.month - 1, value.day);
  calendarView.currentDate = date;
}

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

  // Auto-create personal calendar on first run
  if (calendarsStore.calendars.length === 0) {
    await calendarsStore.createCalendarAsync({
      name: "Persönlich",
      color: "#3b82f6",
    });
  }

  await eventsStore.loadEventsAsync();

  // Load CalDAV accounts and trigger initial sync
  await caldavAccounts.loadAccountsAsync();
  caldavSync.syncAllRemoteCalendarsAsync(); // Non-blocking
});

// Reload events when view range or visible calendars change
watchDebounced(
  () => [calendarView.visibleRange, calendarsStore.visibleCalendarIds] as const,
  () => {
    eventsStore.loadEventsAsync();
    caldavSync.syncAllRemoteCalendarsAsync();
  },
  { debounce: 100, deep: true }
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

async function syncCalendar(calendarId: string) {
  await caldavSync.syncCalendarAsync(calendarId);
  await eventsStore.loadEventsAsync();
}

// Calendar context menu
const presetColors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#6b7280"];
const calendarMenuOpen = reactive<Record<string, boolean>>({});

function openCalendarMenu(calId: string) {
  calendarMenuOpen[calId] = true;
}

// Long-press for small screens
let longPressTimer: ReturnType<typeof setTimeout> | null = null;

function startLongPress(calId: string, event: PointerEvent) {
  if (event.pointerType !== "touch") return;
  longPressTimer = setTimeout(() => {
    openCalendarMenu(calId);
    longPressTimer = null;
  }, 500);
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
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

// Inline rename
const renamingCalendarId = ref<string | null>(null);
const renameValue = ref("");
const renameInput = ref<HTMLInputElement[]>([]);

// Close rename input when clicking outside (blur is unreliable due to DropdownMenu focus restore)
onClickOutside(
  computed(() => renameInput.value?.[0] ?? null),
  () => confirmRename(),
  { ignore: [] },
);

function startRenameCalendar(cal: { id: string; name: string }) {
  renamingCalendarId.value = cal.id;
  renameValue.value = cal.name;
  // DropdownMenu restores focus to its trigger after close animation (~200-300ms).
  // We must wait for that to finish before focusing our input.
  setTimeout(() => renameInput.value?.[0]?.focus(), 300);
}

async function confirmRename() {
  if (!renamingCalendarId.value) return;
  const trimmed = renameValue.value.trim();
  if (trimmed) {
    await calendarsStore.updateCalendarAsync(renamingCalendarId.value, { name: trimmed });
  }
  renamingCalendarId.value = null;
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
  sidebar:
    calendars: Kalender
    addCalendar: Kalender erstellen
    addLocal: Lokaler Kalender
    addCaldav: CalDAV-Account
    shared: Geteilt
    remote: CalDAV
    share: Teilen
    rename: Umbenennen
    color: Farbe
    delete: Löschen
    syncNow: Jetzt synchronisieren
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
  sidebar:
    calendars: Calendars
    addCalendar: Create calendar
    addLocal: Local calendar
    addCaldav: CalDAV account
    shared: Shared
    remote: CalDAV
    share: Share
    rename: Rename
    color: Color
    delete: Delete
    syncNow: Sync now
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
