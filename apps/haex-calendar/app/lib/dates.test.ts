import { describe, expect, it } from "vitest";
import {
  eventSpan,
  exclusiveEndKey,
  inclusiveEndKey,
  normalizeOffsetlessDateTime,
  zonedWallClockCandidates,
  zonedWallClockToDate,
} from "./dates";

const wall = (iso: string) => {
  const [date, time] = iso.split("T") as [string, string];
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return { year, month, day, hour, minute, second: 0 };
};

describe("zonedWallClockToDate", () => {
  it("converts a New York wall clock to the UTC instant", () => {
    expect(zonedWallClockToDate(wall("2026-03-09T14:00"), "America/New_York")?.toISOString()).toBe(
      "2026-03-09T18:00:00.000Z",
    );
  });

  it("picks the first of the repeated hour when clocks go back", () => {
    expect(zonedWallClockToDate(wall("2026-10-25T02:30"), "Europe/Berlin")?.toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("uses the offset from before a skipped hour", () => {
    expect(zonedWallClockToDate(wall("2026-03-29T02:30"), "Europe/Berlin")?.toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
  });

  it("returns null for unknown zones", () => {
    expect(zonedWallClockToDate(wall("2026-03-09T14:00"), "Not/AZone")).toBeNull();
  });
});

describe("zonedWallClockCandidates", () => {
  it("reports both instants of the repeated hour and none in the gap", () => {
    expect(zonedWallClockCandidates(wall("2026-10-25T02:30"), "Europe/Berlin")).toHaveLength(2);
    expect(zonedWallClockCandidates(wall("2026-03-29T02:30"), "Europe/Berlin")).toHaveLength(0);
  });
});

describe("normalizeOffsetlessDateTime", () => {
  it("rewrites legacy wall-clock values of a known zone", () => {
    expect(normalizeOffsetlessDateTime("2026-03-09T14:00:00", "America/New_York")).toBe(
      "2026-03-09T18:00:00.000Z",
    );
  });

  it("leaves ambiguous, floating and already normalized values alone", () => {
    expect(normalizeOffsetlessDateTime("2026-10-25T02:30:00", "Europe/Berlin")).toBeNull();
    expect(normalizeOffsetlessDateTime("2026-03-09T14:00:00", "floating")).toBeNull();
    expect(normalizeOffsetlessDateTime("2026-03-09T14:00:00.000Z", "Europe/Berlin")).toBeNull();
    expect(normalizeOffsetlessDateTime("2026-03-09", "Europe/Berlin")).toBeNull();
  });
});

describe("all-day end conversion", () => {
  it("shows the exclusive stored end as the last day of the event", () => {
    expect(inclusiveEndKey("2026-03-09", "2026-03-10")).toBe("2026-03-09");
    expect(inclusiveEndKey("2026-03-09", "2026-03-12")).toBe("2026-03-11");
  });

  it("treats zero-length legacy rows as one day", () => {
    expect(inclusiveEndKey("2026-03-09", "2026-03-09")).toBe("2026-03-09");
  });

  it("stores the day after the chosen last day, never before the start", () => {
    expect(exclusiveEndKey("2026-03-09", "2026-03-09")).toBe("2026-03-10");
    expect(exclusiveEndKey("2026-03-09", "2026-03-11")).toBe("2026-03-12");
    expect(exclusiveEndKey("2026-03-09", "2026-03-01")).toBe("2026-03-10");
  });

  it("crosses the DST change by calendar days", () => {
    expect(exclusiveEndKey("2026-10-24", "2026-10-25")).toBe("2026-10-26");
  });
});

describe("eventSpan", () => {
  it("covers whole local days for all-day events", () => {
    const span = eventSpan({ dtstart: "2026-03-09", dtend: "2026-03-10", allDay: true });
    expect([span.start.getHours(), span.start.getDate(), span.end.getDate()]).toEqual([0, 9, 10]);
  });

  it("gives zero-length legacy all-day rows one day", () => {
    const span = eventSpan({ dtstart: "2026-03-09", dtend: "2026-03-09", allDay: true });
    expect(span.end.getDate()).toBe(10);
  });
});
