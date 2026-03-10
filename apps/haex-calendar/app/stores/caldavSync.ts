import { eq, inArray } from "drizzle-orm";
import { calendars, events, caldavAccounts } from "~/database/schemas";
import { parseICS, generateICS } from "~/composables/useIcal";
import {
  fetchEventListAsync,
  fetchEventsDataAsync,
  putEventAsync,
  deleteEventAsync as caldavDeleteAsync,
} from "~/composables/useCaldav";

export const useCaldavSyncStore = defineStore("caldavSync", () => {
  const haexVault = useHaexVaultStore();
  const eventsStore = useEventsStore();

  const isSyncing = ref(false);
  const syncErrors = ref<Map<string, string>>(new Map()); // calendarId → error message

  /**
   * Sync a single CalDAV calendar.
   * 1. CTag check — skip if unchanged
   * 2. Fetch event list (HREFs + ETags)
   * 3. Compare with local ETags → determine delta
   * 4. Fetch changed events via multiget
   * 5. Upsert locally, delete removed events
   * 6. Update CTag
   */
  async function syncCalendarAsync(calendarId: string) {
    if (!haexVault.orm) return;

    // Load calendar + account
    const [calendarRow] = await haexVault.orm
      .select()
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .limit(1);

    if (!calendarRow?.caldavAccountId || !calendarRow.caldavPath) return;

    const [account] = await haexVault.orm
      .select()
      .from(caldavAccounts)
      .where(eq(caldavAccounts.id, calendarRow.caldavAccountId))
      .limit(1);

    if (!account) return;

    try {
      syncErrors.value.delete(calendarId);

      // Fetch event list from server
      const { ctag: serverCtag, events: serverEvents } = await fetchEventListAsync(
        calendarRow.caldavPath,
        account.username,
        account.password,
        account.serverUrl,
      );

      // CTag check — skip if unchanged
      if (serverCtag && serverCtag === calendarRow.caldavCtag) {
        return;
      }

      // Load local events for this calendar
      const localEvents = await haexVault.orm
        .select()
        .from(events)
        .where(eq(events.calendarId, calendarId));

      // Build lookup maps
      const localByHref = new Map(localEvents.filter((e) => e.href).map((e) => [e.href!, e]));
      const serverHrefs = new Set(serverEvents.map((e) => e.href));

      // Determine which events need fetching (new or changed ETag)
      const hrefsToFetch = serverEvents
        .filter((serverEvent) => {
          const local = localByHref.get(serverEvent.href);
          return !local || local.etag !== serverEvent.etag;
        })
        .map((e) => e.href);

      // Fetch changed events data
      if (hrefsToFetch.length > 0) {
        const fetchedEvents = await fetchEventsDataAsync(
          calendarRow.caldavPath,
          hrefsToFetch,
          account.username,
          account.password,
          account.serverUrl,
        );

        // Upsert events
        for (const fetched of fetchedEvents) {
          if (!fetched.icsData) continue;
          const parsed = parseICS(fetched.icsData);
          if (parsed.length === 0) continue;
          const eventData = parsed[0]!;

          const existingLocal = localByHref.get(fetched.href);

          if (existingLocal) {
            // Update existing
            await haexVault.orm
              .update(events)
              .set({
                summary: eventData.summary,
                description: eventData.description,
                location: eventData.location,
                dtstart: eventData.dtstart,
                dtend: eventData.dtend,
                allDay: eventData.allDay,
                timezone: eventData.timezone,
                status: eventData.status,
                sequence: eventData.sequence,
                url: eventData.url,
                categories: eventData.categories,
                color: eventData.color,
                etag: fetched.etag,
                href: fetched.href,
              })
              .where(eq(events.id, existingLocal.id));
          } else {
            // Insert new
            const id = crypto.randomUUID();
            await haexVault.orm.insert(events).values({
              id,
              calendarId,
              uid: eventData.uid || `${id}@haex-calendar`,
              summary: eventData.summary,
              description: eventData.description,
              location: eventData.location,
              dtstart: eventData.dtstart,
              dtend: eventData.dtend,
              allDay: eventData.allDay,
              timezone: eventData.timezone,
              status: eventData.status,
              sequence: eventData.sequence,
              url: eventData.url,
              categories: eventData.categories,
              color: eventData.color,
              etag: fetched.etag,
              href: fetched.href,
            });
          }
        }
      }

      // Delete events that no longer exist on server
      const hrefsToDelete = localEvents
        .filter((local) => local.href && !serverHrefs.has(local.href))
        .map((local) => local.id);

      if (hrefsToDelete.length > 0) {
        await haexVault.orm
          .delete(events)
          .where(inArray(events.id, hrefsToDelete));
      }

      // Update calendar CTag and account lastSyncAt
      await haexVault.orm
        .update(calendars)
        .set({ caldavCtag: serverCtag })
        .where(eq(calendars.id, calendarId));

      await haexVault.orm
        .update(caldavAccounts)
        .set({ lastSyncAt: new Date() })
        .where(eq(caldavAccounts.id, account.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      syncErrors.value.set(calendarId, message);
      console.warn(`[caldav-sync] Failed to sync calendar ${calendarId}:`, error);
    }
  }

  /**
   * Sync all remote CalDAV calendars.
   */
  async function syncAllRemoteCalendarsAsync() {
    if (!haexVault.orm || isSyncing.value) return;

    isSyncing.value = true;
    try {
      const allCalendars = await haexVault.orm.select().from(calendars);

      // Filter for remote calendars (has caldavAccountId)
      const caldavCalendars = allCalendars.filter((cal) => cal.caldavAccountId);

      for (const cal of caldavCalendars) {
        await syncCalendarAsync(cal.id);
      }

      // Reload events in the events store
      await eventsStore.loadEventsAsync();
    } finally {
      isSyncing.value = false;
    }
  }

  /**
   * Push a single event to its CalDAV server.
   * Called after local save/create for remote calendar events.
   */
  async function pushEventAsync(eventId: string) {
    if (!haexVault.orm) return;

    const [eventRow] = await haexVault.orm
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!eventRow) return;

    const [calendarRow] = await haexVault.orm
      .select()
      .from(calendars)
      .where(eq(calendars.id, eventRow.calendarId))
      .limit(1);

    if (!calendarRow?.caldavAccountId || !calendarRow.caldavPath) return;

    const [account] = await haexVault.orm
      .select()
      .from(caldavAccounts)
      .where(eq(caldavAccounts.id, calendarRow.caldavAccountId))
      .limit(1);

    if (!account) return;

    // Generate ICS for this single event
    const icsData = generateICS([eventRow], calendarRow.name);

    // Determine href — use existing or create new
    const href = eventRow.href || `${calendarRow.caldavPath}${eventRow.uid}.ics`;

    const newEtag = await putEventAsync(
      href,
      icsData,
      eventRow.etag,
      account.username,
      account.password,
      account.serverUrl,
    );

    // Update local etag and href
    await haexVault.orm
      .update(events)
      .set({ etag: newEtag, href })
      .where(eq(events.id, eventId));
  }

  /**
   * Delete an event from its CalDAV server.
   */
  async function deleteRemoteEventAsync(eventId: string) {
    if (!haexVault.orm) return;

    const [eventRow] = await haexVault.orm
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!eventRow?.href || !eventRow.etag) return;

    const [calendarRow] = await haexVault.orm
      .select()
      .from(calendars)
      .where(eq(calendars.id, eventRow.calendarId))
      .limit(1);

    if (!calendarRow?.caldavAccountId) return;

    const [account] = await haexVault.orm
      .select()
      .from(caldavAccounts)
      .where(eq(caldavAccounts.id, calendarRow.caldavAccountId))
      .limit(1);

    if (!account) return;

    await caldavDeleteAsync(
      eventRow.href,
      eventRow.etag,
      account.username,
      account.password,
      account.serverUrl,
    );
  }

  return {
    isSyncing,
    syncErrors,
    syncCalendarAsync,
    syncAllRemoteCalendarsAsync,
    pushEventAsync,
    deleteRemoteEventAsync,
  };
});
