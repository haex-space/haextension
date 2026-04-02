import { eq } from "drizzle-orm";
import { getTableName, type SpaceAssignment } from "@haex-space/vault-sdk";
import { calendars, events, type InsertCalendar, type SelectCalendar } from "~/database/schemas";
import manifest from "../../haextension/manifest.json";
import packageJson from "../../package.json";

const FULL_CALENDARS_TABLE = getTableName(manifest.publicKey, packageJson.name, "calendars");
const FULL_EVENTS_TABLE = getTableName(manifest.publicKey, packageJson.name, "events");

export { FULL_CALENDARS_TABLE, FULL_EVENTS_TABLE };

export const useCalendarsStore = defineStore("calendars", () => {
  const haexVault = useHaexVaultStore();

  const allCalendars = ref<SelectCalendar[]>([]);
  const isLoading = ref(false);

  // Only calendars marked as visible
  const visibleCalendarIds = computed(() =>
    allCalendars.value.filter((cal) => cal.visible).map((cal) => cal.id)
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
    const calendar = allCalendars.value.find((cal) => cal.id === id);
    if (!calendar) return;
    await updateCalendarAsync(id, { visible: !calendar.visible });
  }

  function getCalendar(id: string) {
    return allCalendars.value.find((cal) => cal.id === id);
  }

  /**
   * Get current space assignments for a calendar.
   */
  async function getCalendarAssignmentsAsync(calendarId: string): Promise<SpaceAssignment[]> {
    return haexVault.client.spaces.getAssignmentsAsync(
      FULL_CALENDARS_TABLE,
      JSON.stringify({ id: calendarId }),
    );
  }

  /**
   * Share a calendar (and all its events) with a shared space.
   */
  async function shareCalendarWithSpaceAsync(calendarId: string, spaceId: string) {
    if (!haexVault.orm) return;

    const calendar = getCalendar(calendarId);

    // Gather all events for this calendar
    const calendarEvents = await haexVault.orm
      .select()
      .from(events)
      .where(eq(events.calendarId, calendarId));

    // Shared metadata — groupId ties calendar + events together as one logical unit
    const groupId = calendarId;
    const type = "Calendar";
    const label = calendar?.name ?? undefined;

    // Build assignments: calendar row + all event rows
    const assignments: SpaceAssignment[] = [
      {
        tableName: FULL_CALENDARS_TABLE,
        rowPks: JSON.stringify({ id: calendarId }),
        spaceId,
        groupId,
        type,
        label,
      },
      ...calendarEvents.map((calendarEvent) => ({
        tableName: FULL_EVENTS_TABLE,
        rowPks: JSON.stringify({ id: calendarEvent.id }),
        spaceId,
        groupId,
      })),
    ];

    await haexVault.client.spaces.assignAsync(assignments);

    // Update local space_id column
    await haexVault.orm
      .update(calendars)
      .set({ spaceId })
      .where(eq(calendars.id, calendarId));
    await loadCalendarsAsync();
  }

  /**
   * Unshare a calendar (and all its events) from a shared space.
   */
  async function unshareCalendarFromSpaceAsync(calendarId: string, spaceId: string) {
    if (!haexVault.orm) return;

    // Gather all events for this calendar
    const calendarEvents = await haexVault.orm
      .select()
      .from(events)
      .where(eq(events.calendarId, calendarId));

    const groupId = calendarId;

    // Build unassignment list
    const assignments: SpaceAssignment[] = [
      {
        tableName: FULL_CALENDARS_TABLE,
        rowPks: JSON.stringify({ id: calendarId }),
        spaceId,
        groupId,
      },
      ...calendarEvents.map((calendarEvent) => ({
        tableName: FULL_EVENTS_TABLE,
        rowPks: JSON.stringify({ id: calendarEvent.id }),
        spaceId,
        groupId,
      })),
    ];

    await haexVault.client.spaces.unassignAsync(assignments);

    // Check if any assignments remain
    const remainingAssignments = await getCalendarAssignmentsAsync(calendarId);
    const newSpaceId = remainingAssignments[0]?.spaceId ?? null;

    await haexVault.orm
      .update(calendars)
      .set({ spaceId: newSpaceId })
      .where(eq(calendars.id, calendarId));
    await loadCalendarsAsync();
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
    getCalendarAssignmentsAsync,
    shareCalendarWithSpaceAsync,
    unshareCalendarFromSpaceAsync,
  };
});
