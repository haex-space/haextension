import { addDays, addMonths, monthGridDays, startOfWeek, type WeekStart } from "~/lib/dates";

export type ViewMode = "month" | "week" | "day";

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toRange(first: Date, last: Date): { start: string; end: string } {
  return { start: startOfDay(first).toISOString(), end: endOfDay(last).toISOString() };
}

export const useCalendarViewStore = defineStore("calendarView", () => {
  const viewMode = ref<ViewMode>("month");
  const currentDate = ref(new Date());
  const settingsStore = useSettingsStore();
  const weekStart = computed<WeekStart>(() => settingsStore.weekStart);

  /** The 6 × 7 days the month view renders; the month range covers all of them. */
  const monthGrid = computed(() => monthGridDays(currentDate.value, weekStart.value));

  const visibleRange = computed(() => {
    switch (viewMode.value) {
      case "month":
        return toRange(monthGrid.value[0]!, monthGrid.value[41]!);
      case "week": {
        const first = startOfWeek(currentDate.value, weekStart.value);
        return toRange(first, addDays(first, 6));
      }
      case "day":
        return toRange(currentDate.value, currentDate.value);
    }
  });

  /**
   * Whether the current view already shows today — used to gray out the
   * "jump to today" button so the user knows their click would be a no-op.
   * Granularity matches the current view: same day for day view, same ISO
   * week for week view, same month/year for month view.
   */
  const isShowingToday = computed(() => {
    const now = new Date();
    const d = currentDate.value;
    switch (viewMode.value) {
      case "day":
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      case "week": {
        return startOfWeek(d, weekStart.value).getTime() === startOfWeek(now, weekStart.value).getTime();
      }
      case "month":
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
  });

  /**
   * Title for the toolbar (e.g., "März 2026", "KW 10, 2026", "9. März 2026")
   */
  const title = computed(() => {
    const d = currentDate.value;
    const formatter = new Intl.DateTimeFormat("de-DE", {
      month: "long",
      year: "numeric",
    });

    switch (viewMode.value) {
      case "month":
        return formatter.format(d);
      case "week":
        return formatter.format(d);
      case "day":
        return new Intl.DateTimeFormat("de-DE", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(d);
    }
  });

  function next() {
    const d = new Date(currentDate.value);
    switch (viewMode.value) {
      case "month":
        currentDate.value = addMonths(d, +1);
        return;
      case "week":
        d.setDate(d.getDate() + 7);
        break;
      case "day":
        d.setDate(d.getDate() + 1);
        break;
    }
    currentDate.value = d;
  }

  function prev() {
    const d = new Date(currentDate.value);
    switch (viewMode.value) {
      case "month":
        currentDate.value = addMonths(d, -1);
        return;
      case "week":
        d.setDate(d.getDate() - 7);
        break;
      case "day":
        d.setDate(d.getDate() - 1);
        break;
    }
    currentDate.value = d;
  }

  function today() {
    currentDate.value = new Date();
  }

  /**
   * Navigate to a specific day (e.g., clicking a date in month view -> switch to day view)
   */
  function goToDay(date: Date) {
    currentDate.value = date;
    viewMode.value = "day";
  }

  return {
    viewMode,
    currentDate,
    weekStart,
    monthGrid,
    visibleRange,
    title,
    isShowingToday,
    next,
    prev,
    today,
    goToDay,
  };
});
