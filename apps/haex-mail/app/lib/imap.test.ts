import { describe, expect, it } from "vitest";
import { createStatusOrdering, quoteImapString } from "./imap";

describe("quoteImapString", () => {
  it("wraps a plain name in double quotes", () => {
    expect(quoteImapString("INBOX")).toBe('"INBOX"');
  });

  it("keeps spaces inside the quotes", () => {
    expect(quoteImapString("Sent Messages")).toBe('"Sent Messages"');
  });

  it("escapes double quotes and backslashes", () => {
    expect(quoteImapString('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe("createStatusOrdering", () => {
  it("drops a result that resolves after a later-issued one was applied", () => {
    const ordering = createStatusOrdering();
    const older = ordering.issue();
    const newer = ordering.issue();
    expect(ordering.claim("acc::INBOX", newer)).toBe(true);
    expect(ordering.claim("acc::INBOX", older)).toBe(false);
  });

  it("applies an older result when the newer one never arrived", () => {
    const ordering = createStatusOrdering();
    const older = ordering.issue();
    ordering.issue();
    expect(ordering.claim("acc::INBOX", older)).toBe(true);
  });

  it("tracks mailboxes independently", () => {
    const ordering = createStatusOrdering();
    const older = ordering.issue();
    const newer = ordering.issue();
    expect(ordering.claim("acc::INBOX", newer)).toBe(true);
    expect(ordering.claim("acc::Archive", older)).toBe(true);
  });
});
