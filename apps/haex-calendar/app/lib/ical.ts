import ICAL from "ical.js";
import type { SelectEvent, SelectEventType } from "~/database/schemas";
import { exclusiveEndKey, inclusiveEndKey, zonedWallClockToDate } from "~/lib/dates";

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

type IcalComponent = InstanceType<typeof ICAL.Component>;
type IcalTime = InstanceType<typeof ICAL.Time>;

// Typed reads of external iCal data: ical.js returns a union per property.
function textProp(component: IcalComponent, name: string): string | null {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" && value !== "" ? value : null;
}

function numberProp(component: IcalComponent, name: string): number | null {
  const value: unknown = component.getFirstPropertyValue(name);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timeProp(component: IcalComponent, name: string): IcalTime | null {
  const value = component.getFirstPropertyValue(name);
  return value instanceof ICAL.Time ? value : null;
}

/** Extract VALARM trigger offsets (minutes before) from a component. */
function extractReminderOffsets(component: IcalComponent): number[] {
  const offsets: number[] = [];
  for (const valarm of component.getAllSubcomponents("valarm")) {
    const value = valarm.getFirstProperty("trigger")?.getFirstValue();
    // Only relative (duration) triggers map to an offset; absolute DATE-TIME
    // triggers can't be expressed as "minutes before" and are skipped.
    if (value instanceof ICAL.Duration) {
      const seconds = value.toSeconds();
      if (seconds <= 0) offsets.push(Math.round(-seconds / 60));
    }
  }
  return offsets;
}

/** All CATEGORIES values (a multi-value property that may also repeat). */
function readCategories(component: IcalComponent): string | null {
  const values = component
    .getAllProperties("categories")
    .flatMap((prop): unknown[] => prop.getValues())
    .map((value) => String(value).trim())
    .filter(Boolean);
  return values.length ? values.join(", ") : null;
}

function rruleString(component: IcalComponent): string | null {
  const recur = component.getFirstPropertyValue("rrule");
  return recur instanceof ICAL.Recur ? recur.toString() : null;
}

/**
 * TZID of a date-time. ical.js leaves a TZID without matching VTIMEZONE as a
 * "floating" zone, so fall back to the property's TZID parameter.
 */
function timeZoneId(time: IcalTime, component: IcalComponent, propName: string): string | null {
  const tzid = time.zone?.tzid;
  if (tzid && tzid !== "floating") return tzid;
  const param = component.getFirstProperty(propName)?.getParameter("tzid");
  return typeof param === "string" ? param : null;
}

/**
 * Stored form of an iCal time: "YYYY-MM-DD" for dates, a UTC instant for
 * date-times. Floating times with a TZID are resolved through the IANA zone
 * database; truly floating times take the importing device's zone.
 */
function toStoredDateTime(time: IcalTime, tzid: string | null): string {
  if (time.isDate) return time.toString();
  if (tzid && time.zone?.tzid === "floating") {
    const resolved = zonedWallClockToDate(
      { year: time.year, month: time.month, day: time.day, hour: time.hour, minute: time.minute, second: time.second },
      tzid,
    );
    if (resolved) return resolved.toISOString();
  }
  return time.toJSDate().toISOString();
}

function parseVevent(vevent: IcalComponent): ParsedEvent | null {
  const event = new ICAL.Event(vevent);
  const startDate = event.startDate;
  const endDate = event.endDate;

  // Same UID-required guard as VTODO — see parseVtodo.
  if (!event.uid) return null;

  const startZone = timeZoneId(startDate, vevent, "dtstart");

  return {
    uid: event.uid,
    summary: event.summary || "Untitled",
    description: event.description || null,
    location: event.location || null,
    dtstart: toStoredDateTime(startDate, startZone),
    dtend: toStoredDateTime(endDate, timeZoneId(endDate, vevent, vevent.hasProperty("dtend") ? "dtend" : "dtstart")),
    allDay: startDate.isDate,
    timezone: startZone ?? "UTC",
    status: textProp(vevent, "status") ?? "CONFIRMED",
    sequence: numberProp(vevent, "sequence") ?? 0,
    url: textProp(vevent, "url"),
    categories: readCategories(vevent),
    color: textProp(vevent, "color"),
    kind: "event",
    rrule: rruleString(vevent),
    reminderOffsets: extractReminderOffsets(vevent),
    completedAt: null,
  };
}

function parseVtodo(vtodo: IcalComponent): ParsedEvent | null {
  // A task's due date maps to DUE (fall back to DTSTART). There is no end.
  const due = timeProp(vtodo, "due") ?? timeProp(vtodo, "dtstart");
  const allDay = due?.isDate ?? false;
  const dueProp = vtodo.hasProperty("due") ? "due" : "dtstart";
  const dueZone = due ? timeZoneId(due, vtodo, dueProp) : null;
  const dtstart = due ? toStoredDateTime(due, dueZone) : new Date().toISOString();
  const completed = timeProp(vtodo, "completed");

  // Skip UID-less VTODOs: importFileAsync upserts by UID, so a random
  // fallback UID would produce a new row on every re-import (duplicates).
  const uid = textProp(vtodo, "uid");
  if (!uid) return null;

  return {
    uid,
    summary: textProp(vtodo, "summary") ?? "Untitled",
    description: textProp(vtodo, "description"),
    location: textProp(vtodo, "location"),
    dtstart,
    dtend: dtstart, // tasks mirror dtstart into dtend (NOT NULL column)
    allDay,
    timezone: dueZone ?? "UTC",
    status: textProp(vtodo, "status") ?? "CONFIRMED",
    sequence: numberProp(vtodo, "sequence") ?? 0,
    url: textProp(vtodo, "url"),
    categories: readCategories(vtodo),
    color: textProp(vtodo, "color"),
    kind: "task",
    rrule: rruleString(vtodo),
    reminderOffsets: extractReminderOffsets(vtodo),
    completedAt: completed ? completed.toJSDate() : null,
  };
}

/**
 * Parse a .ics string into events. Handles both VEVENT (→ event) and
 * VTODO (→ task) components, including RRULE and VALARM.
 *
 * Returns one entry per UID. Components carrying RECURRENCE-ID are
 * single-instance overrides that share the master's UID; they must not
 * replace the master (and its RRULE). Overrides themselves are not modelled
 * yet, so they are dropped unless no master exists.
 */
export function parseICS(icsString: string): ParsedEvent[] {
  const jcal = ICAL.parse(icsString);
  const comp = new ICAL.Component(jcal);

  const parse = (c: IcalComponent, kind: "event" | "task") => ({
    parsed: kind === "event" ? parseVevent(c) : parseVtodo(c),
    isOverride: c.hasProperty("recurrence-id"),
  });

  const byUid = new Map<string, { parsed: ParsedEvent; isOverride: boolean }>();
  for (const candidate of [
    ...comp.getAllSubcomponents("vevent").map((c) => parse(c, "event")),
    ...comp.getAllSubcomponents("vtodo").map((c) => parse(c, "task")),
  ]) {
    if (!candidate.parsed) continue;
    const existing = byUid.get(candidate.parsed.uid);
    if (!existing || (existing.isOverride && !candidate.isOverride)) {
      byUid.set(candidate.parsed.uid, { parsed: candidate.parsed, isOverride: candidate.isOverride });
    }
  }
  return [...byUid.values()].map((entry) => entry.parsed);
}

function setDate(component: IcalComponent, prop: string, value: string, allDay: boolean) {
  if (allDay) {
    component.updatePropertyWithValue(prop, ICAL.Time.fromDateString(value.split("T")[0] ?? value));
  } else {
    // Values from older imports lack an offset; Date reads them as local time,
    // exactly as the views display them.
    component.updatePropertyWithValue(prop, ICAL.Time.fromJSDate(new Date(value), true));
  }
}

const TASK_STATUSES = new Set(["NEEDS-ACTION", "IN-PROCESS", "COMPLETED", "CANCELLED"]);
const EVENT_STATUSES = new Set(["TENTATIVE", "CONFIRMED", "CANCELLED"]);

/** STATUS valid for the component type (RFC 5545 §3.8.1.11). */
function exportStatus(event: SelectEvent): string {
  if (event.kind !== "task") return EVENT_STATUSES.has(event.status) ? event.status : "CONFIRMED";
  if (event.completedAt) return "COMPLETED";
  return TASK_STATUSES.has(event.status) && event.status !== "COMPLETED" ? event.status : "NEEDS-ACTION";
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
    vcomp.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
    vcomp.updatePropertyWithValue("sequence", event.sequence);
    vcomp.updatePropertyWithValue("status", exportStatus(event));

    if (isTask) {
      setDate(vcomp, "due", event.dtstart, event.allDay);
      if (event.completedAt) {
        const d = event.completedAt instanceof Date ? event.completedAt : new Date(event.completedAt);
        vcomp.updatePropertyWithValue("completed", ICAL.Time.fromJSDate(d, true));
      }
    } else {
      setDate(vcomp, "dtstart", event.dtstart, event.allDay);
      // Older rows may hold a zero-length all-day range; DTEND must be later.
      const dtend = event.allDay
        ? exclusiveEndKey(event.dtstart, inclusiveEndKey(event.dtstart, event.dtend))
        : event.dtend;
      setDate(vcomp, "dtend", dtend, event.allDay);
    }

    if (event.description) vcomp.updatePropertyWithValue("description", event.description);
    if (event.location) vcomp.updatePropertyWithValue("location", event.location);
    if (event.url) vcomp.updatePropertyWithValue("url", event.url);
    const categoryList = (categories ?? "").split(",").map((c) => c.trim()).filter(Boolean);
    if (categoryList.length) {
      // One value per category; a single string would be escaped into one
      // category "A\, B" that other clients can't match.
      const prop = new ICAL.Property("categories");
      prop.setValues(categoryList);
      vcomp.addProperty(prop);
    }
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

/**
 * Resolve the event type from a CATEGORIES list and return the remaining
 * user-typed entries. The convention is: if the first entry matches a known
 * type name (case-insensitive), it's the type slot; the rest is the user's
 * own categories. If no first-entry match, the whole list stays as-is.
 */
export function resolveEventTypeFromCategories(
  categories: string | null,
  types: SelectEventType[],
): { eventTypeId: string | null; categories: string | null } {
  if (!categories) return { eventTypeId: null, categories: null };
  const parts = categories.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { eventTypeId: null, categories: null };
  const firstLower = parts[0]!.toLowerCase();
  const matched = types.find((t) => t.name.toLowerCase() === firstLower);
  if (!matched) return { eventTypeId: null, categories: categories };
  const rest = parts.slice(1).join(", ");
  return { eventTypeId: matched.id, categories: rest || null };
}

/** Event columns of an imported VEVENT/VTODO, with type/recurrence overrides resolved. */
export interface ImportedEventColumns {
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
  color: string | null;
  kind: "event" | "task";
  rrule: string | null;
  rruleOverride: boolean;
  colorOverride: boolean;
  eventTypeId: string | null;
  categories: string | null;
  completedAt: Date | null;
}
