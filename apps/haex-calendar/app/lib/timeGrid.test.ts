import { describe, expect, it } from "vitest";
import type { SelectEvent } from "~/database/schemas";
import { eventSpansDate, groupEventsByDay, packBars, positionEventsInDay } from "./timeGrid";

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

describe("packBars", () => {
  const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]; // Mon-Fri, weekend hidden

  it("clips bars to the visible days and stacks overlaps", () => {
    const { bars, rowCount } = packBars(
      [
        event("a", "2026-10-17", "2026-10-21", true), // Sat 17 - Tue 20
        event("b", "2026-10-20", "2026-10-23", true),
      ],
      week,
    );
    expect(bars.map((b) => [b.event.id, b.startCol, b.span, b.row])).toEqual([
      ["a", 0, 2, 0],
      ["b", 1, 3, 1],
    ]);
    expect(rowCount).toBe(2);
  });

  it("skips events that only touch hidden days", () => {
    expect(packBars([event("w", "2026-10-24", "2026-10-26", true)], week).bars).toEqual([]);
  });

  it("packs two occurrences of the same recurring event independently", () => {
    const { bars } = packBars(
      [event("r", "2026-10-19", "2026-10-20", true), event("r", "2026-10-21", "2026-10-22", true)],
      week,
    );
    expect(bars.map((b) => b.row)).toEqual([0, 0]);
  });
});
