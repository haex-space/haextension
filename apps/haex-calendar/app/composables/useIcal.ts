import ICAL from "ical.js";
import { eq } from "drizzle-orm";
import { events } from "~/database/schemas";
import type { SelectEvent, SelectEventType } from "~/database/schemas";

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
  // --- extensions (events/tasks, recurrence, reminders) ---
  kind: "event" | "task";
  rrule: string | null;
  reminderOffsets: number[];
  completedAt: Date | null;
}

/** A resolved event ready for iCal serialization (effective values applied). */
export interface IcalExportItem {
  event: SelectEvent;
  rrule: string | null;
  reminderOffsets: number[];
  categories: string | null;
  color: string | null;
}

/** Extract VALARM trigger offsets (minutes before) from a component. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractReminderOffsets(component: any): number[] {
  const offsets: number[] = [];
  for (const valarm of component.getAllSubcomponents("valarm")) {
    const trigger = valarm.getFirstProperty("trigger");
    if (!trigger) continue;
    const value = trigger.getFirstValue();
    // Only relative (duration) triggers map to an offset; absolute DATE-TIME
    // triggers can't be expressed as "minutes before" and are skipped.
    if (value && typeof value.toSeconds === "function") {
      const seconds = value.toSeconds();
      if (seconds <= 0) offsets.push(Math.round(-seconds / 60));
    }
  }
  return offsets;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rruleString(component: any): string | null {
  const recur = component.getFirstPropertyValue("rrule");
  return recur ? recur.toString() : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseVevent(vevent: any): ParsedEvent | null {
  const event = new ICAL.Event(vevent);
  const startDate = event.startDate;
  const endDate = event.endDate;

  // Same UID-required guard as VTODO — see parseVtodo.
  if (!event.uid) return null;

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
    kind: "event",
    rrule: rruleString(vevent),
    reminderOffsets: extractReminderOffsets(vevent),
    completedAt: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseVtodo(vtodo: any): ParsedEvent | null {
  // A task's due date maps to DUE (fall back to DTSTART). There is no end.
  const due = vtodo.getFirstPropertyValue("due") ?? vtodo.getFirstPropertyValue("dtstart");
  const allDay = due?.isDate ?? false;
  const dtstart = due ? due.toString() : new Date().toISOString();
  const completed = vtodo.getFirstPropertyValue("completed");

  // Skip UID-less VTODOs: importFileAsync upserts by UID, so a random
  // fallback UID would produce a new row on every re-import (duplicates).
  const uid = vtodo.getFirstPropertyValue("uid");
  if (!uid) return null;

  return {
    uid,
    summary: vtodo.getFirstPropertyValue("summary") || "Untitled",
    description: vtodo.getFirstPropertyValue("description") || null,
    location: vtodo.getFirstPropertyValue("location") || null,
    dtstart,
    dtend: dtstart, // tasks mirror dtstart into dtend (NOT NULL column)
    allDay,
    timezone: due?.zone?.tzid || "UTC",
    status: vtodo.getFirstPropertyValue("status") || "CONFIRMED",
    sequence: vtodo.getFirstPropertyValue("sequence") || 0,
    url: vtodo.getFirstPropertyValue("url") || null,
    categories: vtodo.getFirstPropertyValue("categories")?.toString() || null,
    color: vtodo.getFirstPropertyValue("color") || null,
    kind: "task",
    rrule: rruleString(vtodo),
    reminderOffsets: extractReminderOffsets(vtodo),
    completedAt: completed ? completed.toJSDate() : null,
  };
}

/**
 * Parse a .ics string into events. Handles both VEVENT (→ event) and
 * VTODO (→ task) components, including RRULE and VALARM.
 */
export function parseICS(icsString: string): ParsedEvent[] {
  const jcal = ICAL.parse(icsString);
  const comp = new ICAL.Component(jcal);

  return [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...comp.getAllSubcomponents("vevent").map((c: any) => parseVevent(c)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...comp.getAllSubcomponents("vtodo").map((c: any) => parseVtodo(c)),
  ].filter((e): e is ParsedEvent => e !== null);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setDate(component: any, prop: string, value: string, allDay: boolean) {
  if (allDay) {
    component.updatePropertyWithValue(prop, ICAL.Time.fromDateString(value.split("T")[0] ?? value));
  } else {
    component.updatePropertyWithValue(prop, ICAL.Time.fromString(value, "UTC"));
  }
}

/**
 * Generate a .ics string from resolved export items. Events become VEVENT,
 * tasks become VTODO (DUE = dtstart, no DTEND). Effective RRULE, reminders
 * (VALARM), category (type name) and colour are written out.
 */
export function generateICS(items: IcalExportItem[], calendarName: string): string {
  const comp = new ICAL.Component(["vcalendar", [], []]);
  comp.updatePropertyWithValue("prodid", "-//haex-calendar//NONSGML v1.0//EN");
  comp.updatePropertyWithValue("version", "2.0");
  comp.updatePropertyWithValue("calscale", "GREGORIAN");
  comp.updatePropertyWithValue("x-wr-calname", calendarName);

  for (const { event, rrule, reminderOffsets, categories, color } of items) {
    const isTask = event.kind === "task";
    const vcomp = new ICAL.Component(isTask ? "vtodo" : "vevent");
    vcomp.updatePropertyWithValue("uid", event.uid);
    vcomp.updatePropertyWithValue("summary", event.summary);
    vcomp.updatePropertyWithValue("sequence", event.sequence);
    vcomp.updatePropertyWithValue("status", event.status);

    if (isTask) {
      setDate(vcomp, "due", event.dtstart, event.allDay);
      if (event.completedAt) {
        const d = event.completedAt instanceof Date ? event.completedAt : new Date(event.completedAt);
        vcomp.updatePropertyWithValue("completed", ICAL.Time.fromJSDate(d, true));
      }
    } else {
      setDate(vcomp, "dtstart", event.dtstart, event.allDay);
      setDate(vcomp, "dtend", event.dtend, event.allDay);
    }

    if (event.description) vcomp.updatePropertyWithValue("description", event.description);
    if (event.location) vcomp.updatePropertyWithValue("location", event.location);
    if (event.url) vcomp.updatePropertyWithValue("url", event.url);
    if (categories) vcomp.updatePropertyWithValue("categories", categories);
    if (color) vcomp.updatePropertyWithValue("color", color);
    if (rrule) vcomp.updatePropertyWithValue("rrule", ICAL.Recur.fromString(rrule));

    for (const offset of reminderOffsets) {
      const valarm = new ICAL.Component("valarm");
      valarm.updatePropertyWithValue("action", "DISPLAY");
      valarm.updatePropertyWithValue("description", event.summary);
      valarm.updatePropertyWithValue("trigger", ICAL.Duration.fromString(`-PT${offset}M`));
      vcomp.addSubcomponent(valarm);
    }

    if (event.createdAt) {
      vcomp.updatePropertyWithValue("created", ICAL.Time.fromJSDate(event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt), false));
    }
    if (event.updatedAt) {
      vcomp.updatePropertyWithValue("last-modified", ICAL.Time.fromJSDate(event.updatedAt instanceof Date ? event.updatedAt : new Date(event.updatedAt), false));
    }

    comp.addSubcomponent(vcomp);
  }

  return comp.toString();
}

/** Match a CATEGORIES value (first entry) against a type name, case-insensitive. */
export function resolveEventTypeId(categories: string | null, types: SelectEventType[]): string | null {
  if (!categories) return null;
  const first = categories.split(",")[0]?.trim().toLowerCase();
  if (!first) return null;
  return types.find((t) => t.name.toLowerCase() === first)?.id ?? null;
}

/** Columns derived from a parsed event for import (type/recurrence/kind). */
export interface ImportColumns {
  kind: "event" | "task";
  rrule: string | null;
  rruleOverride: boolean;
  eventTypeId: string | null;
  completedAt: Date | null;
}

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
      items.push({
        event,
        rrule: eventsStore.effectiveRrule(event),
        reminderOffsets,
        // Type name takes the CATEGORIES slot when a type is set; otherwise the
        // event's free-text categories round-trip unchanged.
        categories: type?.name ?? event.categories ?? null,
        color: event.colorOverride ? event.color ?? null : type?.color ?? event.color ?? null,
      });
    }
    return items;
  }

  /** Map a parsed event to the type/recurrence/kind columns (types must be loaded). */
  function mapImportColumns(parsed: ParsedEvent): ImportColumns {
    const eventTypeId = resolveEventTypeId(parsed.categories, eventTypesStore.types);
    const type = eventTypeId ? eventTypesStore.getType(eventTypeId) : undefined;
    // Override when the incoming rule differs from the matched type's default
    // (also true when there is no type but a rule is present, so it applies).
    const rruleOverride = parsed.rrule ? parsed.rrule !== (type?.defaultRrule ?? null) : false;
    return {
      kind: parsed.kind,
      rrule: parsed.rrule,
      rruleOverride,
      eventTypeId,
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
      const columns = mapImportColumns(event);

      const existing = await haexVault.orm
        .select()
        .from(events)
        .where(eq(events.uid, event.uid))
        .limit(1);

      if (existing.length > 0) {
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
    parseICS,
    generateICS,
    buildExportItemsAsync,
    mapImportColumns,
    importFileAsync,
    exportCalendarAsync,
  };
}
