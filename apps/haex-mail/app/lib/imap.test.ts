import { describe, expect, it } from "vitest";
import { quoteImapString } from "./imap";

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
