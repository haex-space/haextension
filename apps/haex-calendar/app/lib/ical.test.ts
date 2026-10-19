import { describe, expect, it } from "vitest";
import type { SelectEvent } from "~/database/schemas";
import { generateICS, parseICS } from "./ical";

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}END:VCALENDAR\r\n`;

const vevent = (lines: string[]) => `BEGIN:VEVENT\r\nDTSTAMP:20260101T000000Z\r\n${lines.join("\r\n")}\r\nEND:VEVENT\r\n`;

describe("parseICS recurrence overrides", () => {
  const master = vevent([
    "UID:series@x",
    "SEQUENCE:0",
    "DTSTART:20261005T120000Z",
    "DTEND:20261005T130000Z",
    "RRULE:FREQ=WEEKLY",
    "SUMMARY:Weekly",
  ]);
  const override = vevent([
    "UID:series@x",
    "SEQUENCE:2",
    "RECURRENCE-ID:20261012T120000Z",
    "DTSTART:20261013T120000Z",
    "DTEND:20261013T130000Z",
    "SUMMARY:Moved once",
  ]);

  it("returns the master even when an override comes first", () => {
    const parsed = parseICS(wrap(override + master));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ uid: "series@x", summary: "Weekly", rrule: "FREQ=WEEKLY" });
  });

  it("keeps an override without master as a standalone event", () => {
    const parsed = parseICS(wrap(override));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ uid: "series@x", summary: "Moved once", rrule: null });
  });

  it("returns one entry per UID", () => {
    const other = vevent(["UID:other@x", "DTSTART:20261005T090000Z", "DTEND:20261005T100000Z", "SUMMARY:Other"]);
    const parsed = parseICS(wrap(master + override + other));
    expect(parsed.map((e) => e.uid).sort()).toEqual(["other@x", "series@x"]);
  });
});

const NY_TIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/New_York",
  "BEGIN:STANDARD",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
  "",
].join("\r\n");

describe("parseICS date-times", () => {
  it("stores zoned times as UTC instants via the VTIMEZONE", () => {
    const [event] = parseICS(
      wrap(NY_TIMEZONE + vevent([
        "UID:ny@x",
        "DTSTART;TZID=America/New_York:20260309T140000",
        "DTEND;TZID=America/New_York:20260309T150000",
        "SUMMARY:NY",
      ])),
    );
    expect(event).toMatchObject({
      dtstart: "2026-03-09T18:00:00.000Z",
      dtend: "2026-03-09T19:00:00.000Z",
      timezone: "America/New_York",
      allDay: false,
    });
  });

  it("resolves a TZID without VTIMEZONE by its IANA name", () => {
    const [event] = parseICS(
      wrap(vevent([
        "UID:ny2@x",
        "DTSTART;TZID=America/New_York:20260309T140000",
        "DTEND;TZID=America/New_York:20260309T150000",
        "SUMMARY:NY",
      ])),
    );
    expect(event).toMatchObject({ dtstart: "2026-03-09T18:00:00.000Z", timezone: "America/New_York" });
  });

  it("keeps all-day values as dates", () => {
    const [event] = parseICS(
      wrap(vevent(["UID:d@x", "DTSTART;VALUE=DATE:20260309", "DTEND;VALUE=DATE:20260310", "SUMMARY:Day"])),
    );
    expect(event).toMatchObject({ dtstart: "2026-03-09", dtend: "2026-03-10", allDay: true });
  });

  it("stores task due times as UTC instants", () => {
    const [task] = parseICS(
      wrap(NY_TIMEZONE + "BEGIN:VTODO\r\nDTSTAMP:20260101T000000Z\r\nUID:t@x\r\nDUE;TZID=America/New_York:20260309T140000\r\nSUMMARY:Task\r\nEND:VTODO\r\n"),
    );
    expect(task).toMatchObject({ kind: "task", dtstart: "2026-03-09T18:00:00.000Z" });
  });
});

describe("generateICS date-times", () => {
  const baseEvent: SelectEvent = {
    id: "1",
    calendarId: "c",
    uid: "1@haex-calendar",
    summary: "Test",
    description: null,
    location: null,
    dtstart: "2026-03-09T18:00:00.000Z",
    dtend: "2026-03-09T19:00:00.000Z",
    allDay: false,
    timezone: "America/New_York",
    status: "CONFIRMED",
    sequence: 0,
    url: null,
    categories: null,
    color: null,
    etag: null,
    href: null,
    kind: "event",
    eventTypeId: null,
    rrule: null,
    rruleOverride: false,
    colorOverride: false,
    completedAt: null,
    createdAt: null,
    updatedAt: null,
  };
  const item = (event: SelectEvent) => ({ event, rrule: null, reminderOffsets: [], categories: null, color: null });

  it("writes timed values as UTC", () => {
    const ics = generateICS([item(baseEvent)], "Cal");
    expect(ics).toContain("DTSTART:20260309T180000Z");
    expect(ics).toContain("DTEND:20260309T190000Z");
  });

  it("exports values stored without offset by older imports", () => {
    const legacy = { ...baseEvent, dtstart: "2026-03-09T14:00:00", dtend: "2026-03-09T15:00:00" };
    expect(() => generateICS([item(legacy)], "Cal")).not.toThrow();
  });
});
