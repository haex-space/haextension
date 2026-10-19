import { eq, inArray } from "drizzle-orm";
import { calendars, events, caldavAccounts, type SelectEvent } from "~/database/schemas";
import { normalizeHref, resourceHref } from "~/lib/caldav";
import { getErrorMessage } from "~/lib/errors";
import { generateICS, parseICS } from "~/lib/ical";

export const useCaldavSyncStore = defineStore("caldavSync", () => {
  const haexVault = useHaexVaultStore();
  const eventsStore = useEventsStore();
  const eventTypesStore = useEventTypesStore();
  const accountsStore = useCaldavAccountsStore();
  const ical = useIcal();
  const caldav = useCaldav();

  const isSyncing = ref(false);
  const syncErrors = ref<Map<string, string>>(new Map()); // calendarId → error message
  /**
   * Last failed upload or removal of a single event. Stores have no i18n
   * scope, so the page turns this into a toast.
   */
  const lastRemoteFailure = ref<{ calendarId: string; action: "push" | "delete"; message: string } | null>(null);

  function reportRemoteFailure(calendarId: string, action: "push" | "delete", error: unknown) {
    console.warn(`[caldav-sync] Failed to ${action} event in calendar ${calendarId}:`, error);
    lastRemoteFailure.value = { calendarId, action, message: getErrorMessage(error) };
  }

  /** Calendar row and account of a CalDAV calendar; null for local calendars. */
  async function resolveRemoteAsync(calendarId: string) {
    if (!haexVault.orm) return null;
    const [calendarRow] = await haexVault.orm
      .select()
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .limit(1);
    if (!calendarRow?.caldavAccountId || !calendarRow.caldavPath) return null;

    const [account] = await haexVault.orm
      .select()
      .from(caldavAccounts)
      .where(eq(caldavAccounts.id, calendarRow.caldavAccountId))
      .limit(1);
    return account ? { calendarRow, caldavPath: calendarRow.caldavPath, account } : null;
  }

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
    const remote = await resolveRemoteAsync(calendarId);
    if (!haexVault.orm || !remote) return;
    const { calendarRow, caldavPath, account } = remote;

    try {
      syncErrors.value.delete(calendarId);
      await eventTypesStore.loadTypesAsync();

      const password = await accountsStore.getPasswordAsync(account);

      // Fetch event list from server
      const { ctag: serverCtag, events: serverEvents } = await caldav.fetchEventListAsync(
        caldavPath,
        account.username,
        password,
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

      const failures: string[] = [];

      // Build lookup maps
      const localByHref = new Map(
        localEvents.filter((e) => e.href).map((e) => [normalizeHref(e.href!), e]),
      );
      const serverHrefs = new Set(serverEvents.map((e) => normalizeHref(e.href)));

      // Determine which events need fetching (new or changed ETag)
      const hrefsToFetch = serverEvents
        .filter((serverEvent) => {
          const local = localByHref.get(normalizeHref(serverEvent.href));
          return !local || local.etag !== serverEvent.etag;
        })
        .map((e) => e.href);

      // Fetch changed events data
      if (hrefsToFetch.length > 0) {
        const fetchedEvents = await caldav.fetchEventsDataAsync(
          caldavPath,
          hrefsToFetch,
          account.username,
          password,
          account.serverUrl,
        );

        // Upsert events. One unusable resource must not block the rest of
        // the calendar; failures are reported once the loop is done.
        for (const fetched of fetchedEvents) {
          try {
            if (!fetched.icsData) continue;
            const parsed = parseICS(fetched.icsData);
            if (parsed.length === 0) continue;
            const eventData = parsed[0]!;

            const existingLocal = localByHref.get(normalizeHref(fetched.href));
            const columns = ical.importedEventColumns(eventData);

            if (existingLocal) {
              // Update existing
              await haexVault.orm
                .update(events)
                .set({
                  ...columns,
                  etag: fetched.etag,
                  href: fetched.href,
                })
                .where(eq(events.id, existingLocal.id));
              // Only replace own reminders when the server actually sent VALARMs.
              // Many CalDAV servers (iCloud, some Radicale configs) strip alarms
              // on round-trip; treating an empty list as "clear local reminders"
              // silently wipes user-set per-event reminders on every poll.
              if (eventData.reminderOffsets.length > 0) {
                await eventsStore.replaceEventRemindersAsync(existingLocal.id, eventData.reminderOffsets);
              }
            } else {
              // UIDs are unique across all calendars. The same UID can already
              // live elsewhere (an event moved out of this calendar, an imported
              // copy, an invitation in two calendars); inserting it would fail.
              const [sameUid] = await haexVault.orm
                .select({ calendarId: events.calendarId })
                .from(events)
                .where(eq(events.uid, eventData.uid))
                .limit(1);
              if (sameUid) {
                failures.push(`"${eventData.summary}": UID already used in another calendar`);
                continue;
              }

              const id = crypto.randomUUID();
              await haexVault.orm.insert(events).values({
                id,
                calendarId,
                uid: eventData.uid,
                ...columns,
                etag: fetched.etag,
                href: fetched.href,
              });
              if (eventData.reminderOffsets.length > 0) {
                await eventsStore.replaceEventRemindersAsync(id, eventData.reminderOffsets);
              }
            }
          } catch (error) {
            failures.push(`${fetched.href}: ${getErrorMessage(error)}`);
          }
        }
      }

      // Delete events that no longer exist on server
      const hrefsToDelete = localEvents
        .filter((local) => local.href && !serverHrefs.has(normalizeHref(local.href)))
        .map((local) => local.id);

      if (hrefsToDelete.length > 0) {
        await haexVault.orm
          .delete(events)
          .where(inArray(events.id, hrefsToDelete));
      }

      // Keep the old CTag while resources failed, so the next sync retries them.
      if (failures.length > 0) {
        syncErrors.value.set(calendarId, failures.join("\n"));
      } else {
        await haexVault.orm
          .update(calendars)
          .set({ caldavCtag: serverCtag })
          .where(eq(calendars.id, calendarId));
      }

      await haexVault.orm
        .update(caldavAccounts)
        .set({ lastSyncAt: new Date() })
        .where(eq(caldavAccounts.id, account.id));
    } catch (error) {
      syncErrors.value.set(calendarId, getErrorMessage(error));
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

    const remote = await resolveRemoteAsync(eventRow.calendarId);
    if (!remote) return;
    const { calendarRow, caldavPath, account } = remote;

    const password = await accountsStore.getPasswordAsync(account);

    // Generate ICS for this single event (effective rrule/reminders/type/colour)
    const items = await ical.buildExportItemsAsync([eventRow]);
    const icsData = generateICS(items, calendarRow.name);

    const create = !eventRow.href;
    const href = eventRow.href ?? resourceHref(caldavPath, eventRow.uid);

    const newEtag = await caldav.putEventAsync(
      href,
      icsData,
      eventRow.etag,
      create,
      account.username,
      password,
      account.serverUrl,
    );

    // Update local etag and href
    await haexVault.orm
      .update(events)
      .set({ etag: newEtag, href })
      .where(eq(events.id, eventId));
  }

  /**
   * Delete an event's resource from the CalDAV calendar it was synced to.
   * Takes the row as stored before any local change, because a caller moving
   * the event to another calendar still needs the old calendar's server.
   */
  async function deleteRemoteEventAsync(eventRow: SelectEvent) {
    if (!eventRow.href) return;
    const remote = await resolveRemoteAsync(eventRow.calendarId);
    if (!remote) return;
    const { account } = remote;

    const password = await accountsStore.getPasswordAsync(account);

    await caldav.deleteEventAsync(
      eventRow.href,
      eventRow.etag,
      account.username,
      password,
      account.serverUrl,
    );
  }

  return {
    isSyncing,
    syncErrors,
    lastRemoteFailure,
    reportRemoteFailure,
    syncCalendarAsync,
    syncAllRemoteCalendarsAsync,
    pushEventAsync,
    deleteRemoteEventAsync,
  };
});
