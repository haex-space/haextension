import { describe, expect, it } from "vitest";
import { checkMailboxName, isInMailbox, renamedMailboxName } from "./mailboxName";

describe("checkMailboxName", () => {
  const taken = ["INBOX", "Steuer", "Steuer/2025"];

  it("accepts a new name, umlauts and spaces included", () => {
    expect(checkMailboxName("Rechnungen für 2026", taken)).toBeNull();
  });

  it("refuses an empty or blank name", () => {
    expect(checkMailboxName("", taken)).toBe("empty");
    expect(checkMailboxName("   ", taken)).toBe("empty");
  });

  it("refuses the IMAP wildcards and control characters", () => {
    expect(checkMailboxName("a*", taken)).toBe("invalidChars");
    expect(checkMailboxName("100%", taken)).toBe("invalidChars");
    expect(checkMailboxName("a\r\nb", taken)).toBe("invalidChars");
  });

  it("refuses a name that exists, ignoring the spaces around it", () => {
    expect(checkMailboxName(" Steuer ", taken)).toBe("exists");
    expect(checkMailboxName("Steuer/2025", taken)).toBe("exists");
  });

  it("matches INBOX in any case but no other name", () => {
    expect(checkMailboxName("inbox", taken)).toBe("exists");
    expect(checkMailboxName("steuer", taken)).toBeNull();
  });
});

describe("isInMailbox", () => {
  it("is true for the folder itself and for what lies below it", () => {
    expect(isInMailbox("Steuer", "Steuer", "/")).toBe(true);
    expect(isInMailbox("Steuer/2025", "Steuer", "/")).toBe(true);
  });

  it("is false for a folder that only starts with the same letters", () => {
    expect(isInMailbox("Steuern", "Steuer", "/")).toBe(false);
    expect(isInMailbox("Steuer.2025", "Steuer", "/")).toBe(false);
  });

  it("knows no children when the server has no delimiter", () => {
    expect(isInMailbox("Steuer/2025", "Steuer", null)).toBe(false);
  });
});

describe("renamedMailboxName", () => {
  it("names the renamed folder and moves its children along", () => {
    expect(renamedMailboxName("Steuer", "Steuer", "Finanzen", "/")).toBe("Finanzen");
    expect(renamedMailboxName("Steuer/2025", "Steuer", "Finanzen", "/")).toBe("Finanzen/2025");
  });

  it("leaves other folders alone", () => {
    expect(renamedMailboxName("Steuern", "Steuer", "Finanzen", "/")).toBeNull();
    expect(renamedMailboxName("INBOX", "Steuer", "Finanzen", "/")).toBeNull();
  });
});
