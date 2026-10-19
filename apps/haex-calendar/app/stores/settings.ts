import { watchDebounced } from "@vueuse/core";
import { eq } from "drizzle-orm";
import { settings, type SelectSettings } from "~/database/schemas";
import type { TimeFormat, WeekStart } from "~/lib/dates";
import type { ViewMode } from "./calendarView";

export type DefaultEventDuration = 15 | 30 | 60 | 120;
export type DateFormat = "dd.MM.yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";

const SETTINGS_ID = "default";

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const browserLocale = navigator.language.startsWith("de") ? "de" : "en";

/** Default values used before DB is loaded and for initial row creation */
const defaults = {
  defaultView: "month" as ViewMode,
  weekStart: "monday" as WeekStart,
  defaultEventDuration: 60 as DefaultEventDuration,
  locale: browserLocale,
  timeFormat: "24h" as TimeFormat,
  dateFormat: "dd.MM.yyyy" as DateFormat,
  timezone: browserTimezone,
  showWeekends: true,
  showDeclinedEvents: true,
  showCompletedTasks: true,
  showWeekNumbers: false,
  shorterEvents: false,
  dimPastEvents: false,
  sideBySideDayView: true,
};

export const useSettingsStore = defineStore("settings", () => {
  const haexVault = useHaexVaultStore();
  const isLoaded = ref(false);

  // Reactive settings state (initialized with defaults, overwritten from DB)
  const defaultView = ref<ViewMode>(defaults.defaultView);
  const weekStart = ref<WeekStart>(defaults.weekStart);
  const defaultEventDuration = ref<DefaultEventDuration>(defaults.defaultEventDuration);
  const locale = ref(defaults.locale);
  const timeFormat = ref<TimeFormat>(defaults.timeFormat);
  const dateFormat = ref<DateFormat>(defaults.dateFormat);
  const timezone = ref(defaults.timezone);
  const showWeekends = ref(defaults.showWeekends);
  const showDeclinedEvents = ref(defaults.showDeclinedEvents);
  const showCompletedTasks = ref(defaults.showCompletedTasks);
  const showWeekNumbers = ref(defaults.showWeekNumbers);
  const shorterEvents = ref(defaults.shorterEvents);
  const dimPastEvents = ref(defaults.dimPastEvents);
  const sideBySideDayView = ref(defaults.sideBySideDayView);

  /** Snapshot of all settings as a plain object for change detection */
  const allSettings = computed(() => ({
    defaultView: defaultView.value,
    weekStart: weekStart.value,
    defaultEventDuration: defaultEventDuration.value,
    locale: locale.value,
    timeFormat: timeFormat.value,
    dateFormat: dateFormat.value,
    timezone: timezone.value,
    showWeekends: showWeekends.value,
    showDeclinedEvents: showDeclinedEvents.value,
    showCompletedTasks: showCompletedTasks.value,
    showWeekNumbers: showWeekNumbers.value,
    shorterEvents: shorterEvents.value,
    dimPastEvents: dimPastEvents.value,
    sideBySideDayView: sideBySideDayView.value,
  }));

  /**
   * Outcome of the last auto-save, for the settings page to toast (stores
   * have no i18n scope).
   */
  const lastSave = ref<{ ok: boolean; at: number } | null>(null);

  // What the DB holds. Loading fires the watcher below with the loaded values;
  // comparing against this keeps that from writing (and toasting) on start.
  let persisted = "";

  // Auto-persist: debounced write to DB when any setting changes
  watchDebounced(
    allSettings,
    async (data) => {
      if (!isLoaded.value || !haexVault.orm) return;
      const serialized = JSON.stringify(data);
      if (serialized === persisted) return;
      try {
        await haexVault.orm.update(settings).set(data).where(eq(settings.id, SETTINGS_ID));
        persisted = serialized;
        lastSave.value = { ok: true, at: Date.now() };
      } catch (error) {
        console.error("[haex-calendar] Failed to save settings:", error);
        lastSave.value = { ok: false, at: Date.now() };
      }
    },
    { debounce: 300, deep: true },
  );

  function applyFromRow(row: SelectSettings) {
    defaultView.value = row.defaultView as ViewMode;
    weekStart.value = row.weekStart as WeekStart;
    defaultEventDuration.value = row.defaultEventDuration as DefaultEventDuration;
    locale.value = row.locale;
    timeFormat.value = row.timeFormat as TimeFormat;
    dateFormat.value = row.dateFormat as DateFormat;
    timezone.value = row.timezone;
    showWeekends.value = row.showWeekends;
    showDeclinedEvents.value = row.showDeclinedEvents;
    showCompletedTasks.value = row.showCompletedTasks;
    showWeekNumbers.value = row.showWeekNumbers;
    shorterEvents.value = row.shorterEvents;
    dimPastEvents.value = row.dimPastEvents;
    sideBySideDayView.value = row.sideBySideDayView;
  }

  async function loadSettingsAsync() {
    if (!haexVault.orm) return;
    const rows = await haexVault.orm.select().from(settings);
    if (rows.length > 0) {
      applyFromRow(rows[0]!);
    } else {
      // First run: create settings row with browser-detected defaults
      await haexVault.orm.insert(settings).values({
        id: SETTINGS_ID,
        ...defaults,
      });
    }
    persisted = JSON.stringify(allSettings.value);
    isLoaded.value = true;
  }

  return {
    isLoaded,
    lastSave,
    defaultView,
    weekStart,
    defaultEventDuration,
    locale,
    timeFormat,
    dateFormat,
    timezone,
    showWeekends,
    showDeclinedEvents,
    showCompletedTasks,
    showWeekNumbers,
    shorterEvents,
    dimPastEvents,
    sideBySideDayView,
    loadSettingsAsync,
  };
});
