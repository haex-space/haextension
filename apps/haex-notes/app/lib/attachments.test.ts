import { describe, expect, it } from "vitest";
import type { PageAttachment } from "~/types/document";
import { addAttachment, isRemovable, originalAttachment, removeAttachment } from "./attachments";
import type { PageDoc } from "./commands";
import { createUndoStack } from "./undoStack";

const original: PageAttachment = {
  id: "a-original", kind: "original", assetId: "photo", name: "seite.jpg", mimeType: "image/jpeg", size: 9, addedAt: "t0",
};
const worksheet: PageAttachment = {
  id: "a-sheet", kind: "file", assetId: "sheet", name: "blatt.pdf", mimeType: "application/pdf", size: 5, addedAt: "t1",
};

const page = (attachments?: PageAttachment[]): PageDoc => ({
  id: "p1",
  layers: [],
  background: { paperColor: "#ffffff", template: "lined" },
  width: 794,
  height: 1123,
  ...(attachments && { attachments }),
});

describe("addAttachment", () => {
  it("hangs a file on a page without attachments, and undo takes it off again", () => {
    const doc = page();
    const stack = createUndoStack();
    stack.push(addAttachment(doc, worksheet, "Anhängen"));
    expect(doc.attachments).toEqual([worksheet]);
    stack.undo();
    expect(doc.attachments).toBeUndefined();
    stack.redo();
    expect(doc.attachments).toEqual([worksheet]);
  });

  it("appends to the attachments of the page and keeps the others on undo", () => {
    const doc = page([original]);
    const command = addAttachment(doc, worksheet, "Anhängen");
    command.apply();
    expect(doc.attachments?.map((a) => a.id)).toEqual(["a-original", "a-sheet"]);
    command.revert();
    expect(doc.attachments).toEqual([original]);
  });

  it("stores a copy, so the caller cannot change the attachment afterwards", () => {
    const doc = page();
    const mine = { ...worksheet };
    addAttachment(doc, mine, "Anhängen").apply();
    mine.name = "geändert.pdf";
    expect(doc.attachments?.[0]?.name).toBe("blatt.pdf");
  });
});

describe("removeAttachment", () => {
  it("takes a file off the page and undo puts it back in its place", () => {
    const doc = page([original, worksheet]);
    const command = removeAttachment(doc, "a-sheet", "Entfernen");
    command?.apply();
    expect(doc.attachments).toEqual([original]);
    command?.revert();
    expect(doc.attachments).toEqual([original, worksheet]);
  });

  it("leaves no empty list behind", () => {
    const doc = page([worksheet]);
    removeAttachment(doc, "a-sheet", "Entfernen")?.apply();
    expect(doc.attachments).toBeUndefined();
  });

  it("refuses the original: it goes only with the page", () => {
    const doc = page([original, worksheet]);
    expect(removeAttachment(doc, "a-original", "Entfernen")).toBeNull();
    expect(doc.attachments).toHaveLength(2);
  });

  it("refuses an attachment the page does not have", () => {
    expect(removeAttachment(page([worksheet]), "nope", "Entfernen")).toBeNull();
    expect(removeAttachment(page(), "a-sheet", "Entfernen")).toBeNull();
  });
});

describe("originalAttachment and isRemovable", () => {
  it("finds the original among the attachments", () => {
    expect(originalAttachment([worksheet, original])).toBe(original);
    expect(originalAttachment([worksheet])).toBeNull();
    expect(originalAttachment(undefined)).toBeNull();
  });

  it("allows removing only files the student attached", () => {
    expect(isRemovable(worksheet)).toBe(true);
    expect(isRemovable(original)).toBe(false);
  });
});
