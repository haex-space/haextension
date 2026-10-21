import { describe, expect, it } from "vitest";
import { createStatusOrdering, decodeMailboxName, encodeMailboxName, quoteImapString } from "./imap";

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

// RFC 3501 §5.1.3 modified UTF-7.
describe("decodeMailboxName", () => {
  it("decodes non-ASCII runs", () => {
    expect(decodeMailboxName("Entw&APw-rfe")).toBe("Entwürfe");
    expect(decodeMailboxName("Gel&APY-scht")).toBe("Gelöscht");
    expect(decodeMailboxName("~peter/mail/&U,BTFw-/&ZeVnLIqe-")).toBe("~peter/mail/台北/日本語");
  });

  it("decodes surrogate pairs", () => {
    expect(decodeMailboxName("&2D3eAA-")).toBe("😀");
  });

  it("turns &- into a literal ampersand", () => {
    expect(decodeMailboxName("Tom &- Jerry")).toBe("Tom & Jerry");
  });

  it("keeps plain ASCII names unchanged", () => {
    expect(decodeMailboxName("INBOX.Sent Messages")).toBe("INBOX.Sent Messages");
  });

  it("keeps a malformed run as it is", () => {
    expect(decodeMailboxName("a&A-b")).toBe("a&A-b");
  });
});

describe("encodeMailboxName", () => {
  it("leaves plain ASCII alone and doubles an ampersand", () => {
    expect(encodeMailboxName("Steuer/2026")).toBe("Steuer/2026");
    expect(encodeMailboxName("Q&A")).toBe("Q&-A");
  });

  it("writes non-ASCII runs as modified UTF-7", () => {
    expect(encodeMailboxName("Entwürfe")).toBe("Entw&APw-rfe");
    expect(encodeMailboxName("日本語")).toBe("&ZeVnLIqe-");
    expect(encodeMailboxName("a€b ü")).toBe("a&IKw-b &APw-");
  });

  it("is the inverse of decodeMailboxName", () => {
    for (const name of ["Überweisungen", "Rechnungen & Belege", "Ünï/cödé 日本", "😀 Spaß"]) {
      expect(decodeMailboxName(encodeMailboxName(name))).toBe(name);
    }
  });
});
