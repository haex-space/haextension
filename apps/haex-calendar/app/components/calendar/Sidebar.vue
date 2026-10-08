<template>
  <div class="flex flex-col gap-3">
    <!-- Mini month calendar -->
    <ShadcnCalendar
      :model-value="selectedCalendarDate"
      locale="de-DE"
      weekday-format="short"
      :show-week-numbers="settingsStore.showWeekNumbers"
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
            <ShadcnDropdownMenuItem @click="emit('add-local')">
              <CalendarPlus class="w-4 h-4 mr-2" />
              {{ t('sidebar.addLocal') }}
            </ShadcnDropdownMenuItem>
            <ShadcnDropdownMenuItem @click="emit('add-caldav')">
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
        >
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
            <ShadcnDropdownMenuItem @click="emit('share', cal.id)">
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
              @click="emit('delete', cal.id)"
            >
              <Trash2 class="w-4 h-4 mr-2" />
              {{ t('sidebar.delete') }}
            </ShadcnDropdownMenuItem>
          </ShadcnDropdownMenuContent>
        </ShadcnDropdownMenu>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CalendarPlus,
  Cloud,
  EllipsisVertical,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  Users,
} from "@lucide/vue";
import { CalendarDate, type DateValue } from "@internationalized/date";
import { onClickOutside } from "@vueuse/core";

const emit = defineEmits<{
  "add-local": [];
  "add-caldav": [];
  share: [calendarId: string];
  delete: [calendarId: string];
}>();

const { t } = useI18n();

const calendarView = useCalendarViewStore();
const calendarsStore = useCalendarsStore();
const eventsStore = useEventsStore();
const settingsStore = useSettingsStore();
const caldavSync = useCaldavSyncStore();

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
en:
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
</i18n>
