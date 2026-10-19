import { describe, expect, it } from "vitest";
import { normalizeOffsetlessDateTime, zonedWallClockCandidates, zonedWallClockToDate } from "./dates";

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
