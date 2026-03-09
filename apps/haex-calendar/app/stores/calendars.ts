import { eq } from "drizzle-orm";
import { calendars, type InsertCalendar, type SelectCalendar } from "~/database/schemas";

export const useCalendarsStore = defineStore("calendars", () => {
  const haexVault = useHaexVaultStore();

  const allCalendars = ref<SelectCalendar[]>([]);
  const isLoading = ref(false);

  // Only calendars marked as visible
  const visibleCalendarIds = computed(() =>
    allCalendars.value.filter((c) => c.visible).map((c) => c.id)
  );

  async function loadCalendarsAsync() {
    if (!haexVault.orm) return;
    isLoading.value = true;
    try {
      allCalendars.value = await haexVault.orm.select().from(calendars);
    } finally {
      isLoading.value = false;
    }
  }

  async function createCalendarAsync(data: { name: string; color: string; spaceId?: string }) {
    if (!haexVault.orm) return;
    const id = crypto.randomUUID();
    const entry: InsertCalendar = {
      id,
      name: data.name,
      color: data.color,
      spaceId: data.spaceId ?? null,
    };
    await haexVault.orm.insert(calendars).values(entry);
    await loadCalendarsAsync();
    return id;
  }

  async function updateCalendarAsync(id: string, data: Partial<Pick<InsertCalendar, "name" | "color" | "visible">>) {
    if (!haexVault.orm) return;
    await haexVault.orm.update(calendars).set(data).where(eq(calendars.id, id));
    await loadCalendarsAsync();
  }

  async function deleteCalendarAsync(id: string) {
    if (!haexVault.orm) return;
    await haexVault.orm.delete(calendars).where(eq(calendars.id, id));
    await loadCalendarsAsync();
  }

  async function toggleVisibilityAsync(id: string) {
    const cal = allCalendars.value.find((c) => c.id === id);
    if (!cal) return;
    await updateCalendarAsync(id, { visible: !cal.visible });
  }

  function getCalendar(id: string) {
    return allCalendars.value.find((c) => c.id === id);
  }

  return {
    calendars: allCalendars,
    visibleCalendarIds,
    isLoading,
    loadCalendarsAsync,
    createCalendarAsync,
    updateCalendarAsync,
    deleteCalendarAsync,
    toggleVisibilityAsync,
    getCalendar,
  };
});
