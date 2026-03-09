export type ViewMode = "month" | "week" | "day";

/**
 * Get the start of the week (Monday) for a given date.
 */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday = 1
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * For month view: extend range to fill the grid (start from Monday of first week,
 * end on Sunday of last week).
 */
function getMonthGridRange(date: Date): { start: string; end: string } {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  return {
    start: gridStart.toISOString(),
    end: gridEnd.toISOString(),
  };
}

function getWeekRange(date: Date): { start: string; end: string } {
  return {
    start: startOfWeek(date).toISOString(),
    end: endOfWeek(date).toISOString(),
  };
}

function getDayRange(date: Date): { start: string; end: string } {
  return {
    start: startOfDay(date).toISOString(),
    end: endOfDay(date).toISOString(),
  };
}

export const useCalendarViewStore = defineStore("calendarView", () => {
  const viewMode = ref<ViewMode>("month");
  const currentDate = ref(new Date());

  const visibleRange = computed(() => {
    switch (viewMode.value) {
      case "month":
        return getMonthGridRange(currentDate.value);
      case "week":
        return getWeekRange(currentDate.value);
      case "day":
        return getDayRange(currentDate.value);
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
        d.setMonth(d.getMonth() + 1);
        break;
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
        d.setMonth(d.getMonth() - 1);
        break;
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
    visibleRange,
    title,
    next,
    prev,
    today,
    goToDay,
  };
});
