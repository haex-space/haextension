import { describe, expect, it } from "vitest";
import { parseICS } from "./ical";

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
