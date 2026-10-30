import { asc, desc, eq, inArray, isNull, and, sql } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "../../database/schemas";
import type { DraftRowValues } from "../../lib/drafts";
import { chunk } from "../../lib/utils";
import type { DraftAttachmentMeta, DraftAttachmentValues, DraftBackend } from "./drafts";

type Orm = SqliteRemoteDatabase<typeof schema>;

/** One SQL statement as the SDK's `database.transaction` takes it. */
export interface Statement {
  sql: string;
  params: unknown[];
}

export type RunTransaction = (statements: Statement[]) => Promise<void>;

const excluded = (column: { name: string }) => sql`excluded.${sql.identifier(column.name)}`;

/**
 * The statements of one save: the draft row, and when the attachments changed, their rows replaced.
 * The upsert leaves the server bookkeeping (`server_message_id`, `previous_message_ids_json`,
 * `removed_at`) alone, because a save is not an upload.
 */
export const saveStatements = (
  orm: Orm,
  row: DraftRowValues,
  attachments: DraftAttachmentValues[] | null,
): Statement[] => {
  const d = schema.drafts;
  const statements: Statement[] = [
    orm
      .insert(d)
      .values(row)
      .onConflictDoUpdate({
        // The vault's SQL check accepts only plain column names as conflict target.
        target: sql`${sql.identifier(d.id.name)}`,
        set: {
          accountId: excluded(d.accountId),
          toText: excluded(d.toText),
          ccText: excluded(d.ccText),
          bccText: excluded(d.bccText),
          subject: excluded(d.subject),
          bodyHtml: excluded(d.bodyHtml),
          inReplyTo: excluded(d.inReplyTo),
          referencesJson: excluded(d.referencesJson),
          editedAt: excluded(d.editedAt),
          uploadDueAt: excluded(d.uploadDueAt),
          attempts: excluded(d.attempts),
          nextAttemptAt: excluded(d.nextAttemptAt),
          updatedAt: sql`(unixepoch())`,
        },
      })
      .toSQL(),
  ];
  if (attachments) {
    statements.push(
      orm.delete(schema.draftAttachments).where(eq(schema.draftAttachments.draftId, row.id)).toSQL(),
    );
    // 8 values per row stay below SQLite's bind-parameter limit with 50 rows.
    for (const batch of chunk(attachments, 50)) {
      statements.push(orm.insert(schema.draftAttachments).values(batch).toSQL());
    }
  }
  return statements;
};

export const deleteStatements = (orm: Orm, id: string): Statement[] => [
  orm.delete(schema.draftAttachments).where(eq(schema.draftAttachments.draftId, id)).toSQL(),
  orm.delete(schema.drafts).where(eq(schema.drafts.id, id)).toSQL(),
];

/** The drafts in the vault database. Every write that touches more than one row is one transaction. */
export const createVaultDraftBackend = (getOrm: () => Orm, transaction: RunTransaction): DraftBackend => {
  const a = schema.draftAttachments;
  return {
    async getDraft(id) {
      return (await getOrm().select().from(schema.drafts).where(eq(schema.drafts.id, id)).limit(1))[0] ?? null;
    },
    async listDrafts(accountIds) {
      return getOrm()
        .select()
        .from(schema.drafts)
        .where(and(inArray(schema.drafts.accountId, accountIds), isNull(schema.drafts.removedAt)))
        .orderBy(desc(schema.drafts.editedAt));
    },
    async getAttachments(draftId) {
      return getOrm().select().from(a).where(eq(a.draftId, draftId)).orderBy(asc(a.position));
    },
    async getAttachmentMeta(draftId): Promise<DraftAttachmentMeta[]> {
      return getOrm()
        .select({
          id: a.id,
          draftId: a.draftId,
          position: a.position,
          filename: a.filename,
          contentType: a.contentType,
          contentId: a.contentId,
          size: a.size,
        })
        .from(a)
        .where(eq(a.draftId, draftId))
        .orderBy(asc(a.position));
    },
    async attachmentCounts(draftIds) {
      const counts = new Map<string, number>();
      if (draftIds.length === 0) return counts;
      const rows = await getOrm()
        .select({ draftId: a.draftId, count: sql<number>`count(*)` })
        .from(a)
        .where(inArray(a.draftId, draftIds))
        .groupBy(a.draftId);
      for (const row of rows) counts.set(row.draftId, Number(row.count));
      return counts;
    },
    async saveDraft(row, attachments) {
      await transaction(saveStatements(getOrm(), row, attachments));
    },
    async deleteDraft(id) {
      await transaction(deleteStatements(getOrm(), id));
    },
    async markRemoved(id, now) {
      await getOrm().update(schema.drafts).set({ removedAt: now }).where(eq(schema.drafts.id, id));
    },
  };
};
