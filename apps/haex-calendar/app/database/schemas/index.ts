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

// Helper function to create prefixed table names
const extensionName = (manifest as { name?: string }).name || packageJson.name;
const tableName = (name: string) => getTableName(manifest.publicKey, extensionName, name);

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
    dtend: text().notNull(),                 // DTEND — "2026-03-09T15:00:00"
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    timezone: text().notNull().default("Europe/Berlin"), // TZID

    // CalDAV metadata
    status: text().notNull().default("CONFIRMED"), // STATUS: CONFIRMED, TENTATIVE, CANCELLED
    sequence: integer().notNull().default(0),       // SEQUENCE — change counter for sync conflicts
    url: text(),                              // URL
    categories: text(),                       // CATEGORIES — comma-separated tags
    color: text(),                            // COLOR — overrides calendar color

    ...timestamps,
  }
);
export type InsertEvent = typeof events.$inferInsert;
export type SelectEvent = typeof events.$inferSelect;
