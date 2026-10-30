import { describe, expect, it } from "vitest";
import {
  errorText,
  formatMessageId,
  optionalString,
  parseMessageId,
  resolveMailbox,
  toolError,
} from "./context";

describe("message ids", () => {
  it("are the cache id and read back to their parts", () => {
    const id = formatMessageId("acc-1", "INBOX", 42);
    expect(id).toBe("acc-1::INBOX::42");
    expect(parseMessageId(id)).toEqual({ accountId: "acc-1", mailboxName: "INBOX", uid: 42 });
  });

  it("keep a mailbox name that contains the separator", () => {
    expect(parseMessageId("a::Work::Projects::7")).toEqual({
      accountId: "a",
      mailboxName: "Work::Projects",
      uid: 7,
    });
  });

  it("refuse text that is no id, a row of a local draft included", () => {
    for (const bad of ["", "INBOX", "a::INBOX", "a::INBOX::x", "a::INBOX::0", "a::::5", "a::INBOX::1.5", "draft::0b1c2d3e"]) {
      expect(parseMessageId(bad), bad).toBeNull();
    }
  });
});

describe("resolveMailbox", () => {
  const mailboxes = [
    { name: "INBOX", role: "inbox" },
    { name: "Gesendet", role: "sent" },
    { name: "Steuer", role: null },
  ];

  it("finds a mailbox by role, by name and by name ignoring case", () => {
    expect(resolveMailbox(mailboxes, "sent")).toBe("Gesendet");
    expect(resolveMailbox(mailboxes, "Steuer")).toBe("Steuer");
    expect(resolveMailbox(mailboxes, "steuer")).toBe("Steuer");
    expect(resolveMailbox(mailboxes, " INBOX ")).toBe("INBOX");
  });

  it("prefers an exact name over a role of the same word", () => {
    expect(resolveMailbox([{ name: "trash", role: null }, { name: "Papierkorb", role: "trash" }], "trash")).toBe("trash");
  });

  it("reads a name the way the agent saw it, decoded from IMAP's modified UTF-7", () => {
    const decoded = [{ name: "Entw&APw-rfe", role: "drafts" }];
    expect(resolveMailbox(decoded, "Entwürfe")).toBe("Entw&APw-rfe");
    expect(resolveMailbox(decoded, "Entw&APw-rfe")).toBe("Entw&APw-rfe");
  });

  it("is null for a role or name the account lacks", () => {
    expect(resolveMailbox(mailboxes, "trash")).toBeNull();
    expect(resolveMailbox(mailboxes, "Weg")).toBeNull();
    expect(resolveMailbox(mailboxes, "  ")).toBeNull();
  });
});

describe("error text", () => {
  it("is cut to a length the agent can take", () => {
    expect(toolError("x".repeat(500)).message).toHaveLength(300);
    expect(errorText(new Error("y".repeat(500)))).toHaveLength(300);
    expect(errorText("plain")).toBe("plain");
  });
});

describe("optionalString", () => {
  it("returns a string and nothing else", () => {
    expect(optionalString({ a: "x", b: 1 }, "a")).toBe("x");
    expect(optionalString({ a: "x", b: 1 }, "b")).toBeUndefined();
    expect(optionalString({}, "a")).toBeUndefined();
  });
});
