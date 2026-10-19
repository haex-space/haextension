import { describe, expect, it } from "vitest";
import type { SelectEvent } from "~/database/schemas";
import { eventSpansDate, groupEventsByDay, positionEventsInDay } from "./timeGrid";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

const event = (id: string, dtstart: string, dtend: string, allDay = false) =>
  ({ id, dtstart, dtend, allDay }) as SelectEvent;

const hours = (percent: number) => Math.round((percent / 100) * 24 * 10) / 10;

describe("positionEventsInDay", () => {
  const overnight = event("n", at(2026, 10, 19, 22), at(2026, 10, 20, 2));

  it("cuts an overnight event at midnight on its first day", () => {
    const [p] = positionEventsInDay([overnight], "2026-10-19");
    expect([hours(p!.top), hours(p!.height)]).toEqual([22, 2]);
  });

  it("starts the continuation at midnight on the next day", () => {
    const [p] = positionEventsInDay([overnight], "2026-10-20");
    expect([hours(p!.top), hours(p!.height)]).toEqual([0, 2]);
  });

  it("fills the whole day in the middle of a multi-day event", () => {
    const long = event("l", at(2026, 10, 19, 9), at(2026, 10, 21, 17));
    const [p] = positionEventsInDay([long], "2026-10-20");
    expect([hours(p!.top), hours(p!.height)]).toEqual([0, 24]);
  });
});

describe("day membership", () => {
  it("does not put an event ending at midnight on the next day", () => {
    const evening = event("e", at(2026, 10, 19, 20), at(2026, 10, 20, 0));
    expect([...groupEventsByDay([evening]).keys()]).toEqual(["2026-10-19"]);
    expect(eventSpansDate(evening, "2026-10-20")).toBe(false);
  });

  it("lists an overnight event on both days", () => {
    const overnight = event("n", at(2026, 10, 19, 22), at(2026, 10, 20, 2));
    expect([...groupEventsByDay([overnight]).keys()]).toEqual(["2026-10-19", "2026-10-20"]);
  });

  it("shows zero-length legacy all-day rows on their day", () => {
    expect(eventSpansDate(event("a", "2026-10-19", "2026-10-19", true), "2026-10-19")).toBe(true);
  });
});
