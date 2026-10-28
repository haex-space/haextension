import { describe, expect, it } from "vitest";
import { groupDueMoves, nextRetryAt, retryDelayMs, type PendingMoveRow } from "./pendingMoves";

const row = (uid: number, over: Partial<PendingMoveRow> = {}): PendingMoveRow => ({
  messageId: `a::INBOX::${uid}`,
  accountId: "a",
  mailboxName: "INBOX",
  uid,
  destinationName: "Trash",
  nextAttemptAt: 0,
  ...over,
});

describe("groupDueMoves", () => {
  it("makes one group per account, source and destination", () => {
    const groups = groupDueMoves(
      [
        row(1),
        row(2),
        row(3, { destinationName: "Archive" }),
        row(4, { mailboxName: "Work" }),
        row(5, { accountId: "b" }),
      ],
      100,
      false,
    );
    expect(groups.map((g) => [g.accountId, g.mailboxName, g.destinationName, g.uids])).toEqual([
      ["a", "INBOX", "Trash", [1, 2]],
      ["a", "INBOX", "Archive", [3]],
      ["a", "Work", "Trash", [4]],
      ["b", "INBOX", "Trash", [5]],
    ]);
    expect(groups[0]!.messageIds).toEqual(["a::INBOX::1", "a::INBOX::2"]);
  });

  it("skips moves that wait for their retry, unless forced", () => {
    const rows = [row(1), row(2, { nextAttemptAt: 500 })];
    expect(groupDueMoves(rows, 100, false).flatMap((g) => g.uids)).toEqual([1]);
    expect(groupDueMoves(rows, 500, false).flatMap((g) => g.uids)).toEqual([1, 2]);
    expect(groupDueMoves(rows, 100, true).flatMap((g) => g.uids)).toEqual([1, 2]);
  });

  it("does not mix mailbox names that only look alike when joined", () => {
    const groups = groupDueMoves(
      [
        row(1, { mailboxName: "a::b", destinationName: "c" }),
        row(2, { mailboxName: "a", destinationName: "b::c" }),
      ],
      0,
      false,
    );
    expect(groups).toHaveLength(2);
  });
});

describe("retryDelayMs", () => {
  it("doubles from 30 seconds up to 15 minutes", () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(retryDelayMs(10)).toBe(15 * 60_000);
  });
});

describe("nextRetryAt", () => {
  it("is the earliest retry time, or null for an empty queue", () => {
    expect(nextRetryAt([])).toBeNull();
    expect(nextRetryAt([{ nextAttemptAt: 900 }, { nextAttemptAt: 300 }])).toBe(300);
  });
});
