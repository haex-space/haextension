// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { DraftFields } from "../lib/drafts";
import { useDraftAutosave } from "./useDraftAutosave";

/** A dialog's fields and a store that keeps drafts in memory, as the composable sees them. */
const setup = () => {
  const to = ref("");
  const subject = ref("");
  const body = ref("");
  const rows = new Map<string, DraftFields>();
  let ids = 0;
  const snapshot = (): DraftFields => ({
    accountId: "acc",
    to: to.value,
    cc: "",
    bcc: "",
    subject: subject.value,
    bodyHtml: body.value,
    references: [],
    attachments: [],
  });
  const drafts = {
    saveAsync: vi.fn(async (id: string | null, fields: DraftFields, baseline: DraftFields | null = null) => {
      const empty = !fields.to.trim() && !fields.subject.trim() && !fields.bodyHtml.replace(/<[^>]*>/g, "").trim();
      const untouched = baseline && baseline.to === fields.to && baseline.subject === fields.subject && baseline.bodyHtml === fields.bodyHtml;
      if (empty || untouched) {
        if (id) rows.delete(id);
        return null;
      }
      const key = id ?? `d${++ids}`;
      rows.set(key, fields);
      return key;
    }),
    removeAsync: vi.fn(async (id: string) => void rows.delete(id)),
  };
  const autosave = useDraftAutosave({ snapshot, sources: [to, subject, body], drafts, delayMs: 300 });
  const type = (field: "to" | "subject" | "body", text: string) => ({ to, subject, body })[field].value = text;
  const settle = () => vi.advanceTimersByTimeAsync(400);
  return { to, subject, body, rows, drafts, autosave, type, settle };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDraftAutosave", () => {
  it("creates the draft on the first content and follows later changes", async () => {
    const t = setup();
    await t.autosave.switchTo(() => {});
    t.type("to", "a@x.org");
    await t.settle();
    expect([...t.rows.values()]).toEqual([expect.objectContaining({ to: "a@x.org" })]);
    t.type("subject", "Hi");
    await t.settle();
    expect(t.rows.size).toBe(1);
    expect([...t.rows.values()][0]).toMatchObject({ to: "a@x.org", subject: "Hi" });
  });

  it("removes the draft when the content is gone again", async () => {
    const t = setup();
    await t.autosave.switchTo(() => {});
    t.type("to", "a@x.org");
    await t.settle();
    t.type("to", "");
    await t.settle();
    expect(t.rows.size).toBe(0);
    expect(t.autosave.draftId.value).toBeNull();
  });

  it("creates no draft for an empty mail", async () => {
    const t = setup();
    await t.autosave.switchTo(() => {});
    await t.settle();
    expect(t.rows.size).toBe(0);
  });

  it("creates no draft for an untouched reply and one for a touched reply", async () => {
    const t = setup();
    await t.autosave.switchTo(
      () => {
        t.to.value = "anna@x.org";
        t.subject.value = "Re: Hi";
        t.body.value = "<p>quote</p>";
      },
      { baselineIsApplied: true },
    );
    await t.settle();
    expect(t.rows.size).toBe(0);
    t.type("body", "<p>yes</p><p>quote</p>");
    await t.settle();
    expect(t.rows.size).toBe(1);
  });

  it("flushAsync writes pending text at once", async () => {
    const t = setup();
    await t.autosave.switchTo(() => {});
    t.type("subject", "typed a moment ago");
    await t.autosave.flushAsync();
    expect([...t.rows.values()][0]).toMatchObject({ subject: "typed a moment ago" });
  });

  it("writes a draft when the page is hidden", async () => {
    const t = setup();
    await t.autosave.switchTo(() => {});
    t.type("subject", "before the window went away");
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.rows.size).toBe(1);
  });

  it("a link while a mail is written keeps that mail as a draft and starts a second one", async () => {
    const t = setup();
    await t.autosave.switchTo(() => {});
    t.type("to", "anna@x.org");
    t.type("body", "<p>two paragraphs</p><p>of text</p>");
    // No pause yet: the first draft is still only pending when the link arrives.
    await t.autosave.switchTo(
      () => {
        t.to.value = "ben@x.org";
        t.subject.value = "Hallo";
        t.body.value = "";
      },
      { saveNow: true },
    );
    const all = [...t.rows.values()];
    expect(all).toHaveLength(2);
    expect(all.find((f) => f.to === "anna@x.org")).toMatchObject({ bodyHtml: "<p>two paragraphs</p><p>of text</p>" });
    expect(all.find((f) => f.to === "ben@x.org")).toMatchObject({ subject: "Hallo" });
  });

  it("a second link starts a third draft", async () => {
    const t = setup();
    await t.autosave.switchTo(() => { t.to.value = "1@x.org"; }, { saveNow: true });
    await t.autosave.switchTo(() => { t.to.value = "2@x.org"; }, { saveNow: true });
    await t.autosave.switchTo(() => { t.to.value = "3@x.org"; }, { saveNow: true });
    expect(t.rows.size).toBe(3);
  });

  it("a link while the dialog is closed starts one draft and touches no other", async () => {
    const t = setup();
    await t.autosave.switchTo(() => { t.to.value = "ben@x.org"; }, { saveNow: true });
    expect(t.rows.size).toBe(1);
    expect(t.drafts.removeAsync).not.toHaveBeenCalled();
  });

  it("never lets the old draft see the fields of the new mail", async () => {
    const t = setup();
    await t.autosave.switchTo(() => {});
    t.type("to", "anna@x.org");
    await t.autosave.switchTo(
      () => {
        t.to.value = "";
        t.subject.value = "";
        t.body.value = "";
      },
      {},
    );
    await t.settle();
    expect([...t.rows.values()].map((f) => f.to)).toEqual(["anna@x.org"]);
  });

  it("continues a stored draft: later changes go to the same draft", async () => {
    const t = setup();
    t.rows.set("d9", { accountId: "acc", to: "old@x.org", cc: "", bcc: "", subject: "", bodyHtml: "", references: [], attachments: [] });
    await t.autosave.switchTo(() => { t.to.value = "old@x.org"; }, { id: "d9" });
    t.type("subject", "edited");
    await t.settle();
    expect(t.rows.size).toBe(1);
    expect(t.rows.get("d9")).toMatchObject({ subject: "edited" });
  });

  it("discardAsync deletes the draft and keeps later typing out of it", async () => {
    const t = setup();
    await t.autosave.switchTo(() => {});
    t.type("to", "a@x.org");
    await t.settle();
    await t.autosave.discardAsync();
    expect(t.rows.size).toBe(0);
    t.type("subject", "after discard");
    await t.settle();
    expect(t.rows.size).toBe(0);
  });

  it("does not switch when the old draft cannot be written", async () => {
    const t = setup();
    await t.autosave.switchTo(() => {});
    t.drafts.saveAsync.mockRejectedValueOnce(new Error("disk full"));
    t.type("to", "a@x.org");
    const apply = vi.fn();
    await expect(t.autosave.switchTo(apply)).rejects.toThrow("disk full");
    expect(apply).not.toHaveBeenCalled();
  });

  it("endAsync writes what is pending and lets go of the draft", async () => {
    const t = setup();
    await t.autosave.switchTo(() => {});
    t.type("subject", "last words");
    await t.autosave.endAsync();
    expect([...t.rows.values()][0]).toMatchObject({ subject: "last words" });
    expect(t.autosave.draftId.value).toBeNull();
  });
});
