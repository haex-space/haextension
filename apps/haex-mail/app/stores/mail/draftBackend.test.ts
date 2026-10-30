import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it, vi } from "vitest";
import * as schema from "../../database/schemas";
import { toDraftRow, type DraftFields } from "../../lib/drafts";
import { createVaultDraftBackend, deleteStatements, saveStatements, type Statement } from "./draftBackend";

const orm = drizzle(async () => ({ rows: [] }), { schema });

const fields: DraftFields = {
  accountId: "acc",
  to: "a@x.org",
  cc: "",
  bcc: "",
  subject: "S",
  bodyHtml: "<p>b</p>",
  references: [],
  attachments: [],
};
const row = toDraftRow("d1", fields, 1000);
const attachmentRow = (position: number) => ({
  id: `d1::${position}`,
  draftId: "d1",
  position,
  filename: `f${position}`,
  contentType: "text/plain",
  contentId: null,
  size: 3,
  data: "YWJj",
});

describe("saveStatements", () => {
  it("is one upsert when the attachments did not change", () => {
    const statements = saveStatements(orm, row, null);
    expect(statements).toHaveLength(1);
    expect(statements[0]!.sql).toMatch(/^insert into "[^"]*drafts_no_sync"/);
    expect(statements[0]!.sql).toMatch(/on conflict \("id"\) do update set/);
  });

  it("leaves the server bookkeeping out of the update", () => {
    const { sql } = saveStatements(orm, row, null)[0]!;
    const update = sql.slice(sql.indexOf("do update set"));
    for (const column of ["server_message_id", "previous_message_ids_json", "removed_at", "created_at"]) {
      expect(update).not.toContain(column);
    }
    expect(update).toContain('"edited_at" = excluded."edited_at"');
  });

  it("replaces the attachment rows after the upsert, 50 rows to a statement", () => {
    const rows = Array.from({ length: 51 }, (_, i) => attachmentRow(i));
    const statements = saveStatements(orm, row, rows);
    expect(statements.map((s) => s.sql.split(" ")[0])).toEqual(["insert", "delete", "insert", "insert"]);
    expect(statements[1]!.params).toEqual(["d1"]);
  });

  it("writes an empty attachment list as a delete only", () => {
    expect(saveStatements(orm, row, []).map((s) => s.sql.split(" ")[0])).toEqual(["insert", "delete"]);
  });
});

describe("deleteStatements", () => {
  it("deletes the attachments, then the draft", () => {
    const statements = deleteStatements(orm, "d1");
    expect(statements.map((s) => s.sql)).toEqual([
      expect.stringMatching(/^delete from "[^"]*draft_attachments_no_sync"/),
      expect.stringMatching(/^delete from "[^"]*drafts_no_sync"/),
    ]);
  });
});

describe("createVaultDraftBackend", () => {
  it("sends a save as one transaction", async () => {
    const transaction = vi.fn(async (_: Statement[]) => {});
    const backend = createVaultDraftBackend(() => orm, transaction);
    await backend.saveDraft(row, [attachmentRow(0)]);
    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction.mock.calls[0]![0]).toHaveLength(3);
  });

  it("sends a delete as one transaction and lets a failing transaction reject", async () => {
    const transaction = vi.fn(async (_: Statement[]) => {
      throw new Error("rolled back");
    });
    const backend = createVaultDraftBackend(() => orm, transaction);
    await expect(backend.deleteDraft("d1")).rejects.toThrow("rolled back");
    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction.mock.calls[0]![0]).toHaveLength(2);
  });
});
