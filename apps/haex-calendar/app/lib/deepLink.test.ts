import { describe, expect, it } from "vitest";
import { eventDeepLink, parseEventDeepLink } from "./deepLink";

describe("event deep links", () => {
  it("round-trips event id and occurrence", () => {
    const path = eventDeepLink("abc-1", "2026-10-19T12:00:00.000Z");
    expect(parseEventDeepLink(path)).toEqual({ eventId: "abc-1", occurrence: "2026-10-19T12:00:00.000Z" });
  });

  it("accepts links without occurrence and rejects other paths", () => {
    expect(parseEventDeepLink("/event/abc")).toEqual({ eventId: "abc", occurrence: null });
    expect(parseEventDeepLink("/settings")).toBeNull();
    expect(parseEventDeepLink(undefined)).toBeNull();
  });
});
