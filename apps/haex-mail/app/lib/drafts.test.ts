// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { SelectDraft, SelectDraftAttachment, SelectMessage } from "~/database/schemas";
import {
  UPLOAD_PAUSE_MS,
  draftHasContent,
  draftIdOfRow,
  draftListRow,
  fromDraftRow,
  isDraftRowId,
  mergeDraftRows,
  toDraftRow,
  adoptedDraftFields,
  type DraftFields,
} from "./drafts";

const fields = (over: Partial<DraftFields> = {}): DraftFields => ({
  accountId: "acc",
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  bodyHtml: "",
  references: [],
  attachments: [],
  ...over,
});

const asRow = (f: DraftFields, extra: Partial<SelectDraft> = {}): SelectDraft => {
  const v = toDraftRow("d1", f, 1_700_000_000_000);
  return {
    ...v,
    inReplyTo: v.inReplyTo ?? null,
    referencesJson: v.referencesJson ?? [],
    uploadDueAt: v.uploadDueAt ?? null,
    serverMessageId: null,
    previousMessageIdsJson: [],
    removedAt: null,
    createdAt: null,
    updatedAt: null,
    ...extra,
  } as SelectDraft;
};

const attRow = (position: number, over: Partial<SelectDraftAttachment> = {}): SelectDraftAttachment => ({
  id: `a${position}`,
  draftId: "d1",
  position,
  filename: `f${position}.txt`,
  contentType: "text/plain",
  contentId: null,
  size: 3,
  data: "YWJj",
  ...over,
});

describe("draftHasContent", () => {
  it("is false for blank fields", () => {
    expect(draftHasContent(fields({ to: "  ", subject: " ", bodyHtml: "<p></p>" }), null)).toBe(false);
  });

  it("counts each field and an attachment as content", () => {
    expect(draftHasContent(fields({ to: "a@x.org" }), null)).toBe(true);
    expect(draftHasContent(fields({ cc: "a@x.org" }), null)).toBe(true);
    expect(draftHasContent(fields({ bcc: "a@x.org" }), null)).toBe(true);
    expect(draftHasContent(fields({ subject: "Hi" }), null)).toBe(true);
    expect(draftHasContent(fields({ bodyHtml: "<p>text</p>" }), null)).toBe(true);
    expect(
      draftHasContent(fields({ attachments: [{ filename: "a", contentType: "x/y", data: "QQ==" }] }), null),
    ).toBe(true);
  });

  it("is false for a reply that is still what it was opened with", () => {
    const reply = fields({ to: "anna@x.org", subject: "Re: Hi", bodyHtml: "<p>Anna wrote:</p><p>&gt; Hi</p>" });
    const reopened = { ...reply, bodyHtml: "<p>Anna wrote:</p><p>&gt; Hi</p><p></p>" };
    expect(draftHasContent(reopened, reply)).toBe(false);
  });

  it("is true once a reply was touched", () => {
    const reply = fields({ to: "anna@x.org", subject: "Re: Hi", bodyHtml: "<p>quote</p>" });
    expect(draftHasContent({ ...reply, bodyHtml: "<p>yes</p><p>quote</p>" }, reply)).toBe(true);
  });

  it("is true for the fields of a mail link, which pass no baseline", () => {
    expect(draftHasContent(fields({ to: "ben@x.org", subject: "Hallo" }), null)).toBe(true);
  });
});

describe("rows", () => {
  it("round-trips every field, an empty body and attachment-only mails included", () => {
    const full = fields({
      to: "a@x.org, B <b@x.org>",
      cc: "c@x.org",
      bcc: "d@x.org",
      subject: "Betreff",
      bodyHtml: "<p>Zeile</p>",
      inReplyTo: "orig@x.org",
      references: ["r1@x.org", "r2@x.org"],
      attachments: [
        { filename: "a.txt", contentType: "text/plain", data: "YWJj" },
        { filename: "i.png", contentType: "image/png", data: "QQ==", contentId: "cid1" },
      ],
    });
    const back = fromDraftRow(asRow(full), [
      attRow(1, { filename: "i.png", contentType: "image/png", data: "QQ==", contentId: "cid1" }),
      attRow(0, { filename: "a.txt" }),
    ]);
    expect(back).toEqual(full);
    const attachmentOnly = fields({ attachments: [{ filename: "a", contentType: "x/y", data: "QQ==" }] });
    expect(fromDraftRow(asRow(attachmentOnly), [attRow(0, { filename: "a", contentType: "x/y", data: "QQ==" })])).toEqual(
      attachmentOnly,
    );
  });

  it("starts the upload state over on every save", () => {
    const row = toDraftRow("d1", fields({ to: "a@x.org" }), 1000);
    expect(row).toMatchObject({ editedAt: 1000, uploadDueAt: 1000 + UPLOAD_PAUSE_MS, attempts: 0, nextAttemptAt: 0 });
  });
});

describe("list rows", () => {
  it("shapes a draft as a message row with a prefixed id", () => {
    const row = draftListRow(
      asRow(fields({ to: "Ben <ben@x.org>", cc: "c@x.org", subject: "Hi" }), { serverMessageId: "m1@x" }),
      2,
      "Drafts",
    );
    expect(row).toMatchObject({
      id: "draft::d1",
      mailboxName: "Drafts",
      uid: 0,
      flags: ["\\Draft", "\\Seen"],
      subject: "Hi",
      messageId: "m1@x",
      hasAttachments: true,
      internalDate: 1_700_000_000,
      fromJson: [{ name: "Ben", email: "ben@x.org" }],
      toJson: [{ name: "Ben", email: "ben@x.org" }],
      ccJson: [{ email: "c@x.org" }],
    });
    expect(isDraftRowId(row.id)).toBe(true);
    expect(draftIdOfRow(row.id)).toBe("d1");
    expect(isDraftRowId("acc::Drafts::4")).toBe(false);
  });
});

describe("mergeDraftRows", () => {
  const server = (id: string, messageId: string | null, internalDate: number): SelectMessage =>
    ({ id, messageId, internalDate }) as SelectMessage;
  const local = (id: string, messageId: string | null, internalDate: number): SelectMessage =>
    ({ id, messageId, internalDate }) as SelectMessage;

  it("lists a draft once, whether or not its server copy is cached", () => {
    const merged = mergeDraftRows(
      [server("s1", "copy@x", 100), server("s2", "other@x", 300)],
      [local("draft::1", "copy@x", 200), local("draft::2", null, 50)],
    );
    expect(merged.map((m) => m.id)).toEqual(["s2", "draft::1", "draft::2"]);
  });

  it("keeps server rows without a Message-ID", () => {
    expect(mergeDraftRows([server("s1", null, 1)], [local("draft::1", null, 2)]).map((m) => m.id)).toEqual([
      "draft::1",
      "s1",
    ]);
  });

  it("orders newest first", () => {
    const merged = mergeDraftRows([server("a", "a@x", 10)], [local("draft::b", null, 20), local("draft::c", null, 5)]);
    expect(merged.map((m) => m.id)).toEqual(["draft::b", "a", "draft::c"]);
  });
});

describe("adoptedDraftFields", () => {
  const serverRow = (over: Partial<SelectMessage> = {}) =>
    ({
      accountId: "acc",
      toJson: [{ name: "Ben", email: "ben@x.org" }],
      ccJson: [{ email: "c@x.org" }],
      subject: "Rechnung",
      inReplyTo: "o@x",
      references: ["o@x"],
      ...over,
    }) as SelectMessage;

  it("reads a server draft into the fields of the dialog", () => {
    const fieldsOf = adoptedDraftFields(serverRow(), "Zeile 1\nZeile 2", [
      { filename: "a.txt", contentType: "text/plain", data: "YWJj" },
    ]);
    expect(fieldsOf).toEqual({
      accountId: "acc",
      to: "Ben <ben@x.org>",
      cc: "c@x.org",
      bcc: "",
      subject: "Rechnung",
      bodyHtml: "<p>Zeile 1</p><p>Zeile 2</p>",
      inReplyTo: "o@x",
      references: ["o@x"],
      attachments: [{ filename: "a.txt", contentType: "text/plain", data: "YWJj" }],
    });
  });

  it("copes with a draft without subject, body or threading", () => {
    const fieldsOf = adoptedDraftFields(serverRow({ subject: null, inReplyTo: null, references: [] }), undefined, []);
    expect(fieldsOf).toMatchObject({ subject: "", bodyHtml: "", inReplyTo: undefined, references: [] });
  });
});
