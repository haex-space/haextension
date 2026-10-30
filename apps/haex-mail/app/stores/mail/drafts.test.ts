// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectDraft, SelectDraftAttachment } from "~/database/schemas";
import type { DraftFields } from "../../lib/drafts";
import {
  MAX_DRAFT_ATTACHMENT_BYTES,
  createDraftStore,
  type DraftAttachmentMeta,
  type DraftBackend,
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

const memoryBackend = () => {
  const drafts = new Map<string, SelectDraft>();
  const attachments = new Map<string, SelectDraftAttachment[]>();
  const calls = { saveDraft: [] as { attachments: unknown }[] };
  const backend: DraftBackend = {
    async getDraft(id) {
      return drafts.get(id) ?? null;
    },
    async listDrafts(accountIds) {
      return [...drafts.values()]
        .filter((d) => accountIds.includes(d.accountId) && d.removedAt === null)
        .sort((a, b) => b.editedAt - a.editedAt);
    },
    async getAttachments(id) {
      return attachments.get(id) ?? [];
    },
    async getAttachmentMeta(id) {
      return (attachments.get(id) ?? []).map(({ data: _data, ...meta }) => meta) as DraftAttachmentMeta[];
    },
    async attachmentCounts(ids) {
      return new Map(ids.map((id) => [id, (attachments.get(id) ?? []).length]));
    },
    async saveDraft(row, rows) {
      calls.saveDraft.push({ attachments: rows });
      const old = drafts.get(row.id);
      drafts.set(row.id, {
        serverMessageId: null,
        previousMessageIdsJson: [],
        removedAt: null,
        createdAt: null,
        updatedAt: null,
        ...old,
        ...row,
        inReplyTo: row.inReplyTo ?? null,
        referencesJson: row.referencesJson ?? [],
        uploadDueAt: row.uploadDueAt ?? null,
      } as SelectDraft);
      if (rows) attachments.set(row.id, rows);
    },
    async deleteDraft(id) {
      drafts.delete(id);
      attachments.delete(id);
    },
    async markRemoved(id, now) {
      drafts.set(id, { ...drafts.get(id)!, removedAt: now });
    },
  };
  return { backend, drafts, attachments, calls };
};

const setup = () => {
  const mem = memoryBackend();
  let ids = 0;
  let clock = 1_000_000;
  const dropped = vi.fn();
  const store = createDraftStore(mem.backend, {
    now: () => clock,
    newId: () => `d${++ids}`,
    attachmentsDropped: dropped,
  });
  return { ...mem, store, dropped, tick: (ms: number) => (clock += ms) };
};

const att = (name: string, bytes = 3) => ({
  filename: name,
  contentType: "text/plain",
  data: Buffer.alloc(bytes).toString("base64"),
});

describe("saveAsync", () => {
  it("writes a row with content, sets the upload due time and returns a new id", async () => {
    const { store, drafts } = setup();
    const id = await store.saveAsync(null, fields({ to: "a@x.org", subject: "Hi" }));
    expect(id).toBe("d1");
    expect(drafts.get("d1")).toMatchObject({ toText: "a@x.org", subject: "Hi", editedAt: 1_000_000, uploadDueAt: 1_030_000 });
  });

  it("keeps the id and the server bookkeeping on a later save", async () => {
    const { store, drafts } = setup();
    const id = await store.saveAsync(null, fields({ to: "a@x.org" }));
    drafts.set(id!, { ...drafts.get(id!)!, serverMessageId: "copy@x" });
    expect(await store.saveAsync(id, fields({ to: "a@x.org", subject: "more" }))).toBe(id);
    expect(drafts.get(id!)).toMatchObject({ subject: "more", serverMessageId: "copy@x" });
  });

  it("removes the row of a mail whose content is gone and returns null", async () => {
    const { store, drafts } = setup();
    const id = await store.saveAsync(null, fields({ to: "a@x.org" }));
    expect(await store.saveAsync(id, fields())).toBeNull();
    expect(drafts.size).toBe(0);
  });

  it("creates nothing for an empty mail or an untouched reply", async () => {
    const { store, drafts } = setup();
    expect(await store.saveAsync(null, fields())).toBeNull();
    const reply = fields({ to: "a@x.org", subject: "Re: x", bodyHtml: "<p>quote</p>" });
    expect(await store.saveAsync(null, reply, reply)).toBeNull();
    expect(drafts.size).toBe(0);
  });

  it("keeps a touched reply with its threading", async () => {
    const { store, drafts } = setup();
    const reply = fields({ to: "a@x.org", subject: "Re: x", bodyHtml: "<p>quote</p>", inReplyTo: "o@x", references: ["o@x"] });
    const id = await store.saveAsync(null, { ...reply, bodyHtml: "<p>yes</p><p>quote</p>" }, reply);
    expect(drafts.get(id!)).toMatchObject({ inReplyTo: "o@x", referencesJson: ["o@x"] });
  });

  it("rewrites the attachment rows only when the set changed", async () => {
    const { store, calls } = setup();
    const one = [att("a.txt")];
    const id = await store.saveAsync(null, fields({ attachments: one }));
    expect(calls.saveDraft.at(-1)!.attachments).toHaveLength(1);
    await store.saveAsync(id, fields({ to: "typed@x.org", attachments: one }));
    expect(calls.saveDraft.at(-1)!.attachments).toBeNull();
    await store.saveAsync(id, fields({ attachments: [...one, att("b.txt")] }));
    expect(calls.saveDraft.at(-1)!.attachments).toHaveLength(2);
    await store.saveAsync(id, fields({ attachments: [] , to: "x@x.org" }));
    expect(calls.saveDraft.at(-1)!.attachments).toEqual([]);
  });

  it("keeps the attachments within the local bound and says so once", async () => {
    const { store, attachments, dropped } = setup();
    const big = att("big.bin", MAX_DRAFT_ATTACHMENT_BYTES - 2);
    const id = await store.saveAsync(null, fields({ attachments: [att("a"), big, att("late")] }));
    expect(attachments.get(id!)!.map((r) => r.filename)).toEqual(["a"]);
    await store.saveAsync(id, fields({ subject: "again", attachments: [att("a"), big, att("late")] }));
    expect(dropped).toHaveBeenCalledOnce();
    expect(dropped).toHaveBeenCalledWith(2);
  });
});

describe("removeAsync", () => {
  it("deletes a draft without a server copy at once, attachments included", async () => {
    const { store, drafts, attachments } = setup();
    const id = await store.saveAsync(null, fields({ to: "a@x.org", attachments: [att("a")] }));
    await store.removeAsync(id!);
    expect(drafts.size).toBe(0);
    expect(attachments.size).toBe(0);
  });

  it("marks a draft with a server copy, which then leaves every list", async () => {
    const { store, drafts } = setup();
    const id = await store.saveAsync(null, fields({ to: "a@x.org" }));
    drafts.set(id!, { ...drafts.get(id!)!, serverMessageId: "copy@x" });
    await store.removeAsync(id!);
    expect(drafts.get(id!)!.removedAt).toBe(1_000_000);
    expect(await store.loadAsync(id!)).toBeNull();
    expect(await store.listRowsAsync(["acc"], () => "Drafts")).toEqual([]);
  });

  it("marks a draft that only has an unconfirmed earlier copy", async () => {
    const { store, drafts } = setup();
    const id = await store.saveAsync(null, fields({ to: "a@x.org" }));
    drafts.set(id!, { ...drafts.get(id!)!, previousMessageIdsJson: ["old@x"] });
    await store.removeAsync(id!);
    expect(drafts.get(id!)!.removedAt).not.toBeNull();
  });

  it("ignores an unknown id", async () => {
    await expect(setup().store.removeAsync("nope")).resolves.toBeUndefined();
  });
});

describe("loadAsync and listRowsAsync", () => {
  it("loads what was saved, attachments included", async () => {
    const { store } = setup();
    const f = fields({ to: "a@x.org", subject: "S", bodyHtml: "<p>b</p>", attachments: [att("a.txt")] });
    const id = await store.saveAsync(null, f);
    expect(await store.loadAsync(id!)).toEqual(f);
  });

  it("lists only the drafts of the asked accounts, newest first, in the account's drafts folder", async () => {
    const { store, tick } = setup();
    await store.saveAsync(null, fields({ accountId: "a", subject: "first" }));
    tick(1000);
    await store.saveAsync(null, fields({ accountId: "b", subject: "other account" }));
    tick(1000);
    await store.saveAsync(null, fields({ accountId: "a", subject: "second" }));
    const rows = await store.listRowsAsync(["a"], (id) => (id === "a" ? "Entwürfe" : undefined));
    expect(rows.map((r) => r.subject)).toEqual(["second", "first"]);
    expect(rows.every((r) => r.mailboxName === "Entwürfe" && r.id.startsWith("draft::"))).toBe(true);
    expect(await store.listRowsAsync([], () => "x")).toEqual([]);
  });
});

beforeEach(() => vi.restoreAllMocks());

describe("adoptAsync", () => {
  it("makes a server draft a local one that waits for a change before it is uploaded", async () => {
    const { store, drafts, attachments } = setup();
    const id = await store.adoptAsync(fields({ to: "a@x.org", attachments: [att("a.txt")] }), "orig@x");
    expect(drafts.get(id)).toMatchObject({ toText: "a@x.org", serverMessageId: "orig@x", uploadDueAt: null });
    expect(attachments.get(id)).toHaveLength(1);
    expect(await store.saveAsync(id, fields({ to: "a@x.org", subject: "edited", attachments: [att("a.txt")] }))).toBe(id);
    expect(drafts.get(id)).toMatchObject({ subject: "edited", serverMessageId: "orig@x", uploadDueAt: 1_030_000 });
  });

  it("accepts a draft without a Message-ID", async () => {
    const { store, drafts } = setup();
    const id = await store.adoptAsync(fields({ to: "a@x.org" }), null);
    expect(drafts.get(id)!.serverMessageId).toBeNull();
  });
});

describe("onChange", () => {
  it("is called after a save, a removal and an adoption", async () => {
    const mem = memoryBackend();
    const onChange = vi.fn();
    const store = createDraftStore(mem.backend, { now: () => 1, newId: () => "d1", attachmentsDropped: vi.fn(), onChange });
    await store.saveAsync(null, fields({ to: "a@x.org" }));
    await store.removeAsync("d1");
    await store.adoptAsync(fields({ to: "b@x.org" }), null);
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
