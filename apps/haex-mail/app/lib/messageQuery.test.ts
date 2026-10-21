import { describe, expect, it } from "vitest";
import type { MessageEnvelope } from "@haex-space/vault-sdk";
import {
  hasNonAscii,
  matchesLocally,
  mergePage,
  parseFindQuery,
  planSearch,
  uidsToFetch,
  type Candidate,
  type FindQuery,
} from "./messageQuery";

const query = (input: Record<string, unknown> = {}): FindQuery => parseFindQuery(input);

const envelope = (uid: number, over: Partial<MessageEnvelope> = {}): MessageEnvelope => ({
  uid,
  flags: [],
  internalDate: 1_700_000_000 + uid,
  subject: `mail ${uid}`,
  from: [{ name: "Anna", email: "anna@example.org" }],
  to: [{ email: "me@example.org" }],
  cc: [],
  references: [],
  hasAttachments: false,
  ...over,
});

const candidate = (accountId: string, uid: number, over: Partial<MessageEnvelope> = {}): Candidate => ({
  accountId,
  mailboxName: "INBOX",
  envelope: envelope(uid, over),
});

describe("parseFindQuery", () => {
  it("maps the filters to search criteria and defaults to the inbox, newest first, 25 a page", () => {
    expect(query({ unread: true, from: " anna ", since: "2026-01-02", flagged: false })).toEqual({
      account: undefined,
      mailbox: "inbox",
      criteria: { unseen: true, from: "anna", since: "2026-01-02", flagged: false },
      hasAttachment: undefined,
      sort: "date",
      descending: true,
      limit: 25,
      offset: 0,
    });
  });

  it("searches everything since the earliest date when no filter is given", () => {
    expect(query().criteria).toEqual({ since: "1900-01-01" });
    expect(query({ text: "   " }).criteria, "blank text names nothing").toEqual({ since: "1900-01-01" });
  });

  it("refuses what the host would refuse, with a short reason", () => {
    expect(() => query({ since: "yesterday" })).toThrow("since must be YYYY-MM-DD");
    expect(() => query({ limit: 51 })).toThrow("limit is 1 to 50");
    expect(() => query({ limit: 0 })).toThrow("limit is 1 to 50");
    expect(() => query({ offset: -1 })).toThrow("offset");
    expect(() => query({ sort: "size" })).toThrow("sort is date, sender or subject");
    expect(() => query({ unread: "yes" })).toThrow("unread must be true or false");
    expect(() => query({ from: 5 })).toThrow("from must be text");
  });
});

describe("planSearch", () => {
  it("asks for just the newest offset+limit hits when sorting by date, newest first", () => {
    expect(planSearch(query({ offset: 20, limit: 10 }))).toEqual({ mode: "page", hostLimit: 30 });
  });

  it("fetches all hits for oldest first and the newest 200 for a sort or attachment filter", () => {
    expect(planSearch(query({ descending: false }))).toEqual({ mode: "oldest", hostLimit: 1000 });
    expect(planSearch(query({ sort: "sender" }))).toEqual({ mode: "window", hostLimit: 200 });
    expect(planSearch(query({ hasAttachment: false }))).toEqual({ mode: "window", hostLimit: 200 });
  });

  it("refuses a page that lies behind the 1000 hits the host answers with", () => {
    expect(() => planSearch(query({ offset: 980, limit: 25 }))).toThrow("at most 1000");
    expect(planSearch(query({ offset: 975, limit: 25 }))).toEqual({ mode: "page", hostLimit: 1000 });
  });
});

describe("uidsToFetch", () => {
  it("takes the oldest uids for oldest first and all others as the server answered", () => {
    const newestFirst = [9, 8, 7, 6, 5];
    const oldest = query({ descending: false, offset: 1, limit: 2 });
    expect(uidsToFetch(planSearch(oldest), newestFirst, oldest)).toEqual([5, 6, 7]);
    const page = query({ limit: 2 });
    expect(uidsToFetch(planSearch(page), newestFirst, page)).toEqual(newestFirst);
  });
});

describe("mergePage", () => {
  it("merges two accounts by date, newest first, and cuts at offset and limit", () => {
    const a = [candidate("a1", 5, { internalDate: 500 }), candidate("a1", 3, { internalDate: 300 })];
    const b = [candidate("a2", 9, { internalDate: 900 }), candidate("a2", 4, { internalDate: 400 })];
    const page = mergePage([...a, ...b], query({ offset: 1, limit: 2 }));
    expect(page.map((c) => c.envelope.internalDate)).toEqual([500, 400]);
  });

  it("puts the oldest first when ascending", () => {
    const all = [candidate("a1", 1, { internalDate: 300 }), candidate("a1", 2, { internalDate: 100 })];
    expect(mergePage(all, query({ descending: false })).map((c) => c.envelope.internalDate)).toEqual([
      100, 300,
    ]);
  });

  it("sorts by sender and by subject ignoring case", () => {
    const all = [
      candidate("a1", 1, { from: [{ email: "zoe@example.org" }], subject: "b" }),
      candidate("a1", 2, { from: [{ name: "anna", email: "x@example.org" }], subject: "C" }),
      candidate("a1", 3, { from: [{ name: "Bob", email: "y@example.org" }], subject: "A" }),
    ];
    expect(
      mergePage(all, query({ sort: "sender", descending: false })).map((c) => c.envelope.uid),
    ).toEqual([2, 3, 1]);
    expect(
      mergePage(all, query({ sort: "subject", descending: false })).map((c) => c.envelope.uid),
    ).toEqual([3, 1, 2]);
  });
});

describe("local stand-in for a refused search", () => {
  it("notices text that is not ASCII", () => {
    expect(hasNonAscii({ subject: "Grüße" })).toBe(true);
    expect(hasNonAscii({ subject: "Gruesse", since: "2026-01-01" })).toBe(false);
  });

  it("meets text criteria on sender, recipients and subject, ignoring case", () => {
    const mail = envelope(1, { subject: "Rechnung Elektriker Grün", cc: [{ email: "carl@example.org" }] });
    expect(matchesLocally(mail, { subject: "grün" })).toBe(true);
    expect(matchesLocally(mail, { from: "ANNA" })).toBe(true);
    expect(matchesLocally(mail, { to: "carl" })).toBe(true);
    expect(matchesLocally(mail, { text: "elektriker" })).toBe(true);
    expect(matchesLocally(mail, { subject: "steuer" })).toBe(false);
  });

  it("meets dates and flags, and all criteria together", () => {
    const day = Date.parse("2026-03-10T12:00:00Z") / 1000;
    const mail = envelope(1, { internalDate: day, flags: ["\\Flagged"] });
    expect(matchesLocally(mail, { since: "2026-03-10" })).toBe(true);
    expect(matchesLocally(mail, { since: "2026-03-11" })).toBe(false);
    expect(matchesLocally(mail, { before: "2026-03-10" })).toBe(false);
    expect(matchesLocally(mail, { before: "2026-03-11" })).toBe(true);
    expect(matchesLocally(mail, { unseen: true })).toBe(true);
    expect(matchesLocally(mail, { unseen: false })).toBe(false);
    expect(matchesLocally(mail, { flagged: true, unseen: true, from: "anna" })).toBe(true);
    expect(matchesLocally(mail, { flagged: false })).toBe(false);
  });
});
