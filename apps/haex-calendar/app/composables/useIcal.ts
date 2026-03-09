import ICAL from "ical.js";
import { eq } from "drizzle-orm";
import { events } from "~/database/schemas";
import type { InsertEvent, SelectEvent } from "~/database/schemas";

export interface ParsedEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  dtstart: string;
  dtend: string;
  allDay: boolean;
  timezone: string;
  status: string;
  sequence: number;
  url: string | null;
  categories: string | null;
  color: string | null;
}

/**
 * Parse a .ics file string into an array of events.
 */
export function parseICS(icsString: string): ParsedEvent[] {
  const jcal = ICAL.parse(icsString);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");

  return vevents.map((vevent: any) => {
    const event = new ICAL.Event(vevent);
    const startDate = event.startDate;
    const endDate = event.endDate;

    return {
      uid: event.uid,
      summary: event.summary || "Untitled",
      description: event.description || null,
      location: event.location || null,
      dtstart: startDate.toString(),
      dtend: endDate.toString(),
      allDay: startDate.isDate,
      timezone: startDate.zone?.tzid || "UTC",
      status: vevent.getFirstPropertyValue("status") || "CONFIRMED",
      sequence: vevent.getFirstPropertyValue("sequence") || 0,
      url: vevent.getFirstPropertyValue("url") || null,
      categories: vevent.getFirstPropertyValue("categories")?.toString() || null,
      color: vevent.getFirstPropertyValue("color") || null,
    };
  });
}

/**
 * Generate a .ics file string from an array of events.
 */
export function generateICS(eventList: SelectEvent[], calendarName: string): string {
  const comp = new ICAL.Component(["vcalendar", [], []]);
  comp.updatePropertyWithValue("prodid", "-//haex-calendar//NONSGML v1.0//EN");
  comp.updatePropertyWithValue("version", "2.0");
  comp.updatePropertyWithValue("calscale", "GREGORIAN");
  comp.updatePropertyWithValue("x-wr-calname", calendarName);

  for (const event of eventList) {
    const vevent = new ICAL.Component("vevent");
    vevent.updatePropertyWithValue("uid", event.uid);
    vevent.updatePropertyWithValue("summary", event.summary);
    vevent.updatePropertyWithValue("sequence", event.sequence);
    vevent.updatePropertyWithValue("status", event.status);

    if (event.allDay) {
      const dtstart = ICAL.Time.fromDateString(event.dtstart.split("T")[0] ?? event.dtstart);
      vevent.updatePropertyWithValue("dtstart", dtstart);
      const dtend = ICAL.Time.fromDateString(event.dtend.split("T")[0] ?? event.dtend);
      vevent.updatePropertyWithValue("dtend", dtend);
    } else {
      vevent.updatePropertyWithValue("dtstart", ICAL.Time.fromString(event.dtstart, "UTC"));
      vevent.updatePropertyWithValue("dtend", ICAL.Time.fromString(event.dtend, "UTC"));
    }

    if (event.description) vevent.updatePropertyWithValue("description", event.description);
    if (event.location) vevent.updatePropertyWithValue("location", event.location);
    if (event.url) vevent.updatePropertyWithValue("url", event.url);
    if (event.categories) vevent.updatePropertyWithValue("categories", event.categories);
    if (event.color) vevent.updatePropertyWithValue("color", event.color);

    if (event.createdAt) {
      vevent.updatePropertyWithValue("created", ICAL.Time.fromJSDate(event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt), false));
    }
    if (event.updatedAt) {
      vevent.updatePropertyWithValue("last-modified", ICAL.Time.fromJSDate(event.updatedAt instanceof Date ? event.updatedAt : new Date(event.updatedAt), false));
    }

    comp.addSubcomponent(vevent);
  }

  return comp.toString();
}

/**
 * Composable wrapping import/export with store integration.
 */
export function useIcal() {
  const eventsStore = useEventsStore();
  const haexVault = useHaexVaultStore();

  /**
   * Import a .ics file into a calendar.
   * Uses UID-based upsert: if event with same UID exists and incoming SEQUENCE is higher, update it.
   */
  async function importFileAsync(file: File, calendarId: string): Promise<{ imported: number; updated: number; skipped: number }> {
    const text = await file.text();
    const parsed = parseICS(text);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    if (!haexVault.orm) throw new Error("Database not initialized");

    for (const event of parsed) {
      // Check if event with this UID already exists
      const existing = await haexVault.orm
        .select()
        .from(events)
        .where(eq(events.uid, event.uid))
        .limit(1);

      if (existing.length > 0) {
        // Update only if incoming SEQUENCE is higher
        if (event.sequence > (existing[0]?.sequence ?? 0)) {
          await eventsStore.updateEventAsync(existing[0]!.id, {
            summary: event.summary,
            description: event.description,
            location: event.location,
            dtstart: event.dtstart,
            dtend: event.dtend,
            allDay: event.allDay,
            timezone: event.timezone,
            status: event.status,
            sequence: event.sequence,
            url: event.url,
            categories: event.categories,
            color: event.color,
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await eventsStore.createEventAsync({
          calendarId,
          summary: event.summary,
          description: event.description,
          location: event.location,
          dtstart: event.dtstart,
          dtend: event.dtend,
          allDay: event.allDay,
          timezone: event.timezone,
          status: event.status,
          sequence: event.sequence,
          url: event.url,
          categories: event.categories,
          color: event.color,
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

    const icsString = generateICS(allEvents, calendarName);
    const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${calendarName.replace(/\s+/g, "_")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    parseICS,
    generateICS,
    importFileAsync,
    exportCalendarAsync,
  };
}
