import { eq } from "drizzle-orm";
import { events, type SelectEvent } from "~/database/schemas";
import { rrulesEqual } from "~/lib/rrule";
import {
  generateICS,
  parseICS,
  resolveEventTypeFromCategories,
  type IcalExportItem,
  type ImportedEventColumns,
  type ParsedEvent,
} from "~/lib/ical";

/**
 * Composable wrapping import/export with store integration.
 */
export function useIcal() {
  const eventsStore = useEventsStore();
  const eventTypesStore = useEventTypesStore();
  const haexVault = useHaexVaultStore();

  /** Resolve the effective values for a set of rows and build export items. */
  async function buildExportItemsAsync(eventRows: SelectEvent[]): Promise<IcalExportItem[]> {
    await eventTypesStore.loadTypesAsync();
    const items: IcalExportItem[] = [];
    for (const event of eventRows) {
      const type = eventTypesStore.getType(event.eventTypeId);
      const own = await eventsStore.loadEventRemindersAsync(event.id);
      const reminderOffsets = own.length
        ? own
        : type
          ? eventTypesStore.getTypeReminders(type.id)
          : [];
      // Prepend the type name to the user's free-text categories, separated by
      // a comma. The import step uses the first entry to look up the type and
      // keeps the rest as the event's own categories — so the user's free-text
      // tags survive a CalDAV round-trip alongside the type slot.
      const userCats = event.categories?.trim() || null;
      const combinedCategories = type
        ? userCats
          ? `${type.name}, ${userCats}`
          : type.name
        : userCats;

      items.push({
        event,
        rrule: eventsStore.effectiveRrule(event),
        reminderOffsets,
        categories: combinedCategories,
        color: event.colorOverride ? event.color ?? null : type?.color ?? event.color ?? null,
      });
    }
    return items;
  }

  /** Event columns for a parsed event (types must be loaded). */
  function importedEventColumns(parsed: ParsedEvent): ImportedEventColumns {
    const { eventTypeId, categories } = resolveEventTypeFromCategories(
      parsed.categories,
      eventTypesStore.types,
    );
    const type = eventTypeId ? eventTypesStore.getType(eventTypeId) : undefined;
    // Override only when an rrule is actually present AND differs semantically
    // from the matched type's default. Raw string compare would treat
    // BYDAY=FR,MO as a different rule than BYDAY=MO,FR and silently lock the
    // event out of future type-default updates.
    const rruleOverride = parsed.rrule
      ? !rrulesEqual(parsed.rrule, type?.defaultRrule ?? null)
      : false;
    // Export writes the effective colour (often the type's); reading that back
    // must not pin it as an override.
    const colorOverride = !!parsed.color && parsed.color.toLowerCase() !== type?.color.toLowerCase();
    return {
      summary: parsed.summary,
      description: parsed.description,
      location: parsed.location,
      dtstart: parsed.dtstart,
      dtend: parsed.dtend,
      allDay: parsed.allDay,
      timezone: parsed.timezone,
      status: parsed.status,
      sequence: parsed.sequence,
      url: parsed.url,
      color: parsed.color,
      kind: parsed.kind,
      rrule: parsed.rrule,
      rruleOverride,
      colorOverride,
      eventTypeId,
      // Type name stripped from the front, see resolveEventTypeFromCategories.
      categories,
      completedAt: parsed.completedAt,
    };
  }

  /**
   * Import a .ics file into a calendar. UID-based upsert: update only when the
   * incoming SEQUENCE is higher.
   */
  async function importFileAsync(file: File, calendarId: string): Promise<{ imported: number; updated: number; skipped: number }> {
    const text = await file.text();
    const parsed = parseICS(text);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    if (!haexVault.orm) throw new Error("Database not initialized");
    await eventTypesStore.loadTypesAsync();

    for (const event of parsed) {
      const columns = importedEventColumns(event);

      const existing = await haexVault.orm
        .select()
        .from(events)
        .where(eq(events.uid, event.uid))
        .limit(1);

      if (existing.length > 0) {
        if (event.sequence > (existing[0]?.sequence ?? 0)) {
          await eventsStore.updateEventAsync(existing[0]!.id, {
            ...columns,
            reminderOffsets: event.reminderOffsets,
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await eventsStore.createEventAsync({
          calendarId,
          ...columns,
          reminderOffsets: event.reminderOffsets,
        });
        imported++;
      }
    }

    return { imported, updated, skipped };
  }

  /**
   * Export a calendar's events as a .ics file download.
   */
  async function exportCalendarAsync(calendarId: string, calendarName: string) {
    if (!haexVault.orm) throw new Error("Database not initialized");

    const allEvents = await haexVault.orm
      .select()
      .from(events)
      .where(eq(events.calendarId, calendarId));

    const items = await buildExportItemsAsync(allEvents);
    const icsString = generateICS(items, calendarName);
    const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${calendarName.replace(/\s+/g, "_")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    buildExportItemsAsync,
    importedEventColumns,
    importFileAsync,
    exportCalendarAsync,
  };
}
