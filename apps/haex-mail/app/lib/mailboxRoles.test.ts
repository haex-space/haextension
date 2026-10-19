import { describe, expect, it } from "vitest";
import { assignRoles } from "./mailboxRoles";

const box = (name: string, flags: string[] = [], delimiter = "/") => ({ name, flags, delimiter });

describe("assignRoles", () => {
  it("prefers SPECIAL-USE flags over folder names", () => {
    expect(
      assignRoles([box("INBOX"), box("Deleted Projects"), box("Papierkorb", ["\\Trash"]), box("Trash")]),
    ).toEqual(["inbox", null, "trash", null]);
  });

  it("does not match names that merely contain a role word", () => {
    expect(
      assignRoles([box("Presentations"), box("Consent"), box("Archive 2019"), box("Spam filter rules")]),
    ).toEqual([null, null, null, null]);
  });

  it("matches known names on the last hierarchy level, preferring the shallowest", () => {
    expect(assignRoles([box("INBOX.Sent", [], "."), box("Sent", [], ".")])).toEqual([null, "sent"]);
    expect(assignRoles([box("INBOX.Gesendete Objekte", [], ".")])).toEqual(["sent"]);
  });

  it("matches German names sent in modified UTF-7", () => {
    expect(assignRoles([box("Entw&APw-rfe"), box("Gel&APY-scht")])).toEqual(["drafts", "trash"]);
  });

  it("gives every role to at most one mailbox", () => {
    expect(
      assignRoles([box("Archive", ["\\Archive"]), box("Archives", ["\\Archive"]), box("Junk"), box("Spam")]),
    ).toEqual(["archive", null, "junk", null]);
  });

  it("recognises the inbox case-insensitively", () => {
    expect(assignRoles([box("Inbox")])).toEqual(["inbox"]);
  });
});
