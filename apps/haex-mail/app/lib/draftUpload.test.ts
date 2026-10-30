import { describe, expect, it } from "vitest";
import {
  draftMessageId,
  dueDrafts,
  messageIdOf,
  nextDueAt,
  sameMessageId,
  withMessageId,
  type DraftDueRow,
} from "./draftUpload";
import { MAX_MOVE_ATTEMPTS } from "./pendingMoves";

const row = (id: string, over: Partial<DraftDueRow> = {}): DraftDueRow => ({
  id,
  uploadDueAt: null,
  removedAt: null,
  previousMessageIds: [],
  attempts: 0,
  nextAttemptAt: 0,
  ...over,
});

describe("dueDrafts", () => {
  it("picks drafts whose pause is over, longest overdue first", () => {
    const rows = [
      row("late", { uploadDueAt: 900 }),
      row("early", { uploadDueAt: 100 }),
      row("later", { uploadDueAt: 5_000 }),
      row("done"),
    ];
    expect(dueDrafts(rows, 1_000, false)).toEqual(["early", "late"]);
  });

  it("waits for the retry time after a failure", () => {
    const rows = [row("a", { uploadDueAt: 0, attempts: 1, nextAttemptAt: 2_000 })];
    expect(dueDrafts(rows, 1_000, false)).toEqual([]);
    expect(dueDrafts(rows, 2_000, false)).toEqual(["a"]);
  });

  it("does not wait for the pause when the draft was removed", () => {
    expect(dueDrafts([row("a", { uploadDueAt: 9_000, removedAt: 10 })], 20, false)).toEqual(["a"]);
  });

  it("takes a draft with only an old copy left", () => {
    expect(dueDrafts([row("a", { previousMessageIds: ["old@x"] })], 0, false)).toEqual(["a"]);
  });

  it("force skips the times but not the limit of failed tries", () => {
    const rows = [
      row("fresh", { uploadDueAt: 99_999 }),
      row("gaveUp", { uploadDueAt: 0, attempts: MAX_MOVE_ATTEMPTS }),
    ];
    expect(dueDrafts(rows, 0, true)).toEqual(["fresh"]);
    expect(dueDrafts(rows, 1e9, false)).toEqual(["fresh"]);
  });
});

describe("nextDueAt", () => {
  it("is the earliest time of a waiting draft", () => {
    expect(nextDueAt([row("a", { uploadDueAt: 500 }), row("b", { uploadDueAt: 300, nextAttemptAt: 400 })])).toBe(400);
  });

  it("is null without work and for a draft that gave up", () => {
    expect(nextDueAt([row("a")])).toBeNull();
    expect(nextDueAt([row("a", { uploadDueAt: 1, attempts: MAX_MOVE_ATTEMPTS })])).toBeNull();
  });
});

const b64 = (s: string) => btoa(s);
const unb64 = (s: string) => atob(s);
const message = (headers: string[], body = "Hello\r\nWorld", eol = "\r\n") => b64(headers.join(eol) + eol + eol + body);

describe("withMessageId", () => {
  it("puts the id first and replaces an existing one", () => {
    const out = unb64(withMessageId(message(["From: a@x.org", "Message-ID: <host-1@x>", "Subject: Hi"]), "draft-1@haex-mail.invalid"));
    expect(out).toBe("Message-ID: <draft-1@haex-mail.invalid>\r\nFrom: a@x.org\r\nSubject: Hi\r\n\r\nHello\r\nWorld");
  });

  it("removes a folded Message-ID with its continuation lines", () => {
    const input = message(["From: a@x.org", "Message-ID:", " <folded@x>", "Subject: Hi"]);
    const out = unb64(withMessageId(input, "n@x"));
    expect(out).not.toContain("folded@x");
    expect(out.startsWith("Message-ID: <n@x>\r\nFrom: a@x.org\r\nSubject: Hi\r\n\r\n")).toBe(true);
  });

  it("adds the id when there was none and keeps other folded headers", () => {
    const out = unb64(withMessageId(message(["To: a@x.org,", " b@x.org", "Subject: Hi"]), "n@x"));
    expect(out).toBe("Message-ID: <n@x>\r\nTo: a@x.org,\r\n b@x.org\r\nSubject: Hi\r\n\r\nHello\r\nWorld");
  });

  it("leaves the body bytes untouched, binary ones included", () => {
    const body = String.fromCharCode(0, 1, 200, 255, 13, 10, 77);
    const out = unb64(withMessageId(message(["Subject: Hi"], body), "n@x"));
    expect(out.endsWith("\r\n\r\n" + body)).toBe(true);
  });

  it("handles bare line feeds", () => {
    const out = unb64(withMessageId(message(["Subject: Hi", "Message-ID: <a@x>"], "Body", "\n"), "n@x"));
    expect(out).toBe("Message-ID: <n@x>\nSubject: Hi\n\nBody");
  });

  it("only touches the header block: a Message-ID line in the body stays", () => {
    const out = unb64(withMessageId(message(["Subject: Hi"], "Message-ID: <in-body@x>"), "n@x"));
    expect(out).toContain("\r\n\r\nMessage-ID: <in-body@x>");
  });

  it("round-trips through messageIdOf and returns valid base64", () => {
    const out = withMessageId(message(["Subject: Hi"]), draftMessageId("abc"));
    expect(messageIdOf(out)).toBe("draft-abc@haex-mail.invalid");
    expect(out).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("messageIdOf", () => {
  it("reads the id without angle brackets, also when folded", () => {
    expect(messageIdOf(message(["Message-ID: <a@x>"]))).toBe("a@x");
    expect(messageIdOf(message(["Message-Id:", " <b@x>"]))).toBe("b@x");
  });

  it("is null without a Message-ID", () => {
    expect(messageIdOf(message(["Subject: Hi"]))).toBeNull();
  });
});

describe("sameMessageId", () => {
  it("ignores angle brackets and surrounding blanks", () => {
    expect(sameMessageId("<a@x>", "a@x")).toBe(true);
    expect(sameMessageId(" a@x ", "<a@x>")).toBe(true);
  });

  it("is false for different, empty or missing ids", () => {
    expect(sameMessageId("a@x", "b@x")).toBe(false);
    expect(sameMessageId("", "")).toBe(false);
    expect(sameMessageId(null, "a@x")).toBe(false);
    expect(sameMessageId(undefined, undefined)).toBe(false);
  });
});
