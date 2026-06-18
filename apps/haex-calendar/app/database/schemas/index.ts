import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";

const tableName = (name: string) => getTableName(manifest.publicKey, packageJson.name, name);

// Reusable timestamp columns
const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
};

/**
 * Calendars — each calendar is either personal (spaceId=null) or shared (spaceId=Space UUID).
 * A shared calendar IS a Space (1:1 mapping).
 */
export const calendars = sqliteTable(
  tableName("calendars"),
  {
    id: text().primaryKey(),
    name: text().notNull(),
    color: text().notNull().default("#3b82f6"), // Default blue
    spaceId: text("space_id"), // null = personal, non-null = shared Space
    visible: integer({ mode: "boolean" }).notNull().default(true),
    caldavAccountId: text("caldav_account_id"),
    caldavPath: text("caldav_path"),
    caldavCtag: text("caldav_ctag"),
    ...timestamps,
  }
);
export type InsertCalendar = typeof calendars.$inferInsert;
export type SelectCalendar = typeof calendars.$inferSelect;

/**
 * Events — CalDAV/iCalendar (RFC 5545) oriented VEVENT properties.
 * Each event belongs to one calendar.
 */
export const events = sqliteTable(
  tableName("events"),
  {
    id: text().primaryKey(),
    calendarId: text("calendar_id")
      .references((): AnySQLiteColumn => calendars.id, { onDelete: "cascade" })
      .notNull(),

    // CalDAV core properties
    uid: text().notNull().unique(),          // UID — global iCal identifier (uuid@haex-calendar)
    summary: text().notNull(),               // SUMMARY — event title
    description: text(),                     // DESCRIPTION
    location: text(),                        // LOCATION

    // Date/time (ISO 8601 strings for direct iCal compatibility)
    dtstart: text().notNull(),               // DTSTART — "2026-03-09T14:00:00"
    // DTEND — "2026-03-09T15:00:00". Kept NOT NULL (the CRDT-managed events
    // table is not safe to recreate just to relax nullability). For tasks
    // (kind="task") this mirrors dtstart and is ignored — VTODO export emits
    // dtstart as DUE and omits DTEND.
    dtend: text().notNull(),
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    timezone: text().notNull().default("Europe/Berlin"), // TZID

    // CalDAV metadata
    status: text().notNull().default("CONFIRMED"), // STATUS: CONFIRMED, TENTATIVE, CANCELLED
    sequence: integer().notNull().default(0),       // SEQUENCE — change counter for sync conflicts
    url: text(),                              // URL
    categories: text(),                       // CATEGORIES — comma-separated tags
    color: text(),                            // COLOR — overrides calendar color
    etag: text(),
    href: text(),

    // --- Termin/Aufgabe, Termin-Arten, Wiederholung (migrations 0005–0008) ---
    // "event" (Termin) or "task" (Aufgabe). Existing rows default to "event".
    kind: text().notNull().default("event"),
    // References event_types.id. No DB-level FK (added via ALTER COLUMN, and the
    // event_types table is created in a later migration). ON DELETE SET NULL is
    // enforced in app code (see stores/eventTypes.ts deleteAsync).
    eventTypeId: text("event_type_id"),
    // RFC 5545 RRULE string, e.g. "FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15".
    rrule: text(),
    // Event's rrule overrides the type's default (even when rrule is null).
    rruleOverride: integer("rrule_override", { mode: "boolean" }).notNull().default(false),
    // Event's color was set explicitly (overrides the type's color).
    colorOverride: integer("color_override", { mode: "boolean" }).notNull().default(false),
    // Tasks only: set = done.
    completedAt: integer("completed_at", { mode: "timestamp" }),

    ...timestamps,
  }
);
export type InsertEvent = typeof events.$inferInsert;
export type SelectEvent = typeof events.$inferSelect;

/**
 * Event-Types ("Termin-Arten") — user-defined categories that carry default
 * reminders and recurrence. Local only (not synced); see migration 0006.
 */
export const eventTypes = sqliteTable(
  tableName("event_types"),
  {
    id: text().primaryKey(),
    name: text().notNull().unique(),     // "Geburtstag", "Urlaub"
    color: text().notNull(),             // hex
    defaultRrule: text("default_rrule"), // optional default recurrence
    ...timestamps,
  }
);
export type InsertEventType = typeof eventTypes.$inferInsert;
export type SelectEventType = typeof eventTypes.$inferSelect;

/**
 * Per-event reminders. If an event has ≥1 row here, these win (no merge with
 * the type defaults). Empty → the type's defaults fire. See migration 0007.
 */
export const eventReminders = sqliteTable(
  tableName("event_reminders"),
  {
    id: text().primaryKey(),
    eventId: text("event_id")
      .references((): AnySQLiteColumn => events.id, { onDelete: "cascade" })
      .notNull(),
    offsetMinutes: integer("offset_minutes").notNull(), // 10080 = 1 week
  }
);
export type InsertEventReminder = typeof eventReminders.$inferInsert;
export type SelectEventReminder = typeof eventReminders.$inferSelect;

/**
 * Default reminders for an event-type. See migration 0008.
 */
export const eventTypeReminders = sqliteTable(
  tableName("event_type_reminders"),
  {
    id: text().primaryKey(),
    eventTypeId: text("event_type_id")
      .references((): AnySQLiteColumn => eventTypes.id, { onDelete: "cascade" })
      .notNull(),
    offsetMinutes: integer("offset_minutes").notNull(),
  }
);
export type InsertEventTypeReminder = typeof eventTypeReminders.$inferInsert;
export type SelectEventTypeReminder = typeof eventTypeReminders.$inferSelect;

/**
 * Settings — single-row table for user preferences (synced across devices).
 * Uses a fixed id="default" for the single settings row.
 */
export const settings = sqliteTable(
  tableName("settings"),
  {
    id: text().primaryKey().default("default"),

    // Display
    defaultView: text("default_view").notNull().default("month"),
    weekStart: text("week_start").notNull().default("monday"),
    defaultEventDuration: integer("default_event_duration").notNull().default(60),

    // Regional
    locale: text().notNull().default("de"),
    timeFormat: text("time_format").notNull().default("24h"),
    dateFormat: text("date_format").notNull().default("dd.MM.yyyy"),
    timezone: text().notNull().default("Europe/Berlin"),

    // View options
    showWeekends: integer("show_weekends", { mode: "boolean" }).notNull().default(true),
    showDeclinedEvents: integer("show_declined_events", { mode: "boolean" }).notNull().default(true),
    showCompletedTasks: integer("show_completed_tasks", { mode: "boolean" }).notNull().default(true),
    showWeekNumbers: integer("show_week_numbers", { mode: "boolean" }).notNull().default(false),
    shorterEvents: integer("shorter_events", { mode: "boolean" }).notNull().default(false),
    dimPastEvents: integer("dim_past_events", { mode: "boolean" }).notNull().default(false),
    sideBySideDayView: integer("side_by_side_day_view", { mode: "boolean" }).notNull().default(true),

    ...timestamps,
  }
);
export type InsertSettings = typeof settings.$inferInsert;
export type SelectSettings = typeof settings.$inferSelect;

/**
 * CalDAV Accounts — connection info for external CalDAV servers.
 */
export const caldavAccounts = sqliteTable(
  tableName("caldav_accounts"),
  {
    id: text().primaryKey(),
    name: text().notNull(),
    serverUrl: text("server_url").notNull(),
    username: text().notNull(),
    // Reference to an item in the core HaexVault password manager
    // (tag-scoped to "haex-calendar"). Credentials always live there, never
    // in the extension's own DB.
    passwordItemId: text("password_item_id"),
    principalUrl: text("principal_url"),
    calendarHomeUrl: text("calendar_home_url"),
    lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
    ...timestamps,
  }
);
export type InsertCaldavAccount = typeof caldavAccounts.$inferInsert;
export type SelectCaldavAccount = typeof caldavAccounts.$inferSelect;
