import { describe, expect, it } from "vitest";
import { planWatchChanges } from "./watchPlan";

describe("planWatchChanges", () => {
  const running = new Map([
    ["a", "imap.a:993@1"],
    ["b", "imap.b:993@1"],
  ]);

  it("starts new accounts and stops removed ones", () => {
    expect(
      planWatchChanges(running, [
        { id: "a", key: "imap.a:993@1" },
        { id: "c", key: "imap.c:993@1" },
      ]),
    ).toEqual({ stop: ["b"], start: [{ id: "c", key: "imap.c:993@1" }] });
  });

  it("restarts a watch whose account settings changed", () => {
    expect(
      planWatchChanges(running, [
        { id: "a", key: "imap.a:993@2" },
        { id: "b", key: "imap.b:993@1" },
      ]),
    ).toEqual({ stop: [], start: [{ id: "a", key: "imap.a:993@2" }] });
  });

  it("leaves unchanged watches alone", () => {
    expect(
      planWatchChanges(running, [
        { id: "a", key: "imap.a:993@1" },
        { id: "b", key: "imap.b:993@1" },
      ]),
    ).toEqual({ stop: [], start: [] });
  });
});
