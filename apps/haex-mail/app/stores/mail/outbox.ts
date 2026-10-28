import { inArray, sql } from "drizzle-orm";
import { toast } from "vue-sonner";
import * as schema from "~/database/schemas";
import {
  groupDueMoves,
  MAX_MOVE_ATTEMPTS,
  nextRetryAt,
  retryDelayMs,
} from "~/lib/pendingMoves";
import { chunk, getErrorMessage } from "~/lib/utils";
import type { MessageChanges } from "./changes";
import type { MailSync } from "./sync";

export interface QueuedMove {
  accountId: string;
  mailboxName: string;
  destinationName: string;
  uids: number[];
}

/**
 * Moves from the list (delete, archive, move to folder) happen optimistically: `enqueueMovesAsync`
 * only writes them to `pending_moves`, which hides the messages from every list at once. The
 * server moves are carried out in the background by `flushPendingMovesAsync` and repeated — with
 * growing pauses, when the connection returns, on refresh and after a restart — until they went
 * through or `MAX_MOVE_ATTEMPTS` real failures gave them up.
 */
export const useMoveOutbox = (
  sync: Pick<MailSync, "reloadCurrentListAsync">,
  changes: Pick<MessageChanges, "moveUidsAsync">,
) => {
  const haexVault = useHaexVaultStore();
  const { $i18n } = useNuxtApp();

  /** Write the moves down; the caller removes the rows from the visible list. */
  const enqueueMovesAsync = async (moves: QueuedMove[]) => {
    const orm = haexVault.orm;
    if (!orm) return;
    const rows = moves.flatMap((m) =>
      m.uids.map((uid) => ({
        messageId: `${m.accountId}::${m.mailboxName}::${uid}`,
        accountId: m.accountId,
        mailboxName: m.mailboxName,
        uid,
        destinationName: m.destinationName,
      })),
    );
    // 50 rows of 5 values stay below SQLite's bind-parameter limit.
    for (const batch of chunk(rows, 50)) {
      await orm
        .insert(schema.pendingMoves)
        .values(batch)
        .onConflictDoUpdate({
          // The vault's SQL check accepts only plain column names as conflict target.
          target: sql`${sql.identifier(schema.pendingMoves.messageId.name)}`,
          set: {
            destinationName: sql`excluded.${sql.identifier(schema.pendingMoves.destinationName.name)}`,
            attempts: 0,
            nextAttemptAt: 0,
          },
        });
    }
  };

  let flushing: Promise<void> | null = null;
  /** A flush asked for while one runs: whether any of the askers wanted to skip the retry pauses. */
  let queuedForce: boolean | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  // One hint per stretch of waiting, not one per retry.
  let toldAboutWaiting = false;

  const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

  const flushOnceAsync = async (force: boolean) => {
    const orm = haexVault.orm;
    if (!orm) return;
    // Nothing to try without a connection, and nothing to count against the moves either.
    if (isOffline()) return;

    const rows = await orm.select().from(schema.pendingMoves);
    const groups = groupDueMoves(rows, Date.now(), force);

    let gaveUp = 0;
    let lastError: unknown;
    await Promise.all(
      groups.map(async (g) => {
        try {
          await changes.moveUidsAsync(g.accountId, g.mailboxName, g.uids, g.destinationName);
          await orm
            .delete(schema.pendingMoves)
            .where(inArray(schema.pendingMoves.messageId, g.messageIds));
        } catch (err) {
          console.warn("[haex-mail] queued move failed", err);
          // The connection dropped meanwhile: not the move's fault.
          if (isOffline()) return;
          lastError = err;
          const attempts = new Map(rows.map((r) => [r.messageId, r.attempts]));
          // Rows tried the same number of times fail together: one write per count.
          const byAttempt = new Map<number, string[]>();
          for (const id of g.messageIds) {
            const next = (attempts.get(id) ?? 0) + 1;
            byAttempt.set(next, [...(byAttempt.get(next) ?? []), id]);
          }
          for (const [next, ids] of byAttempt) {
            if (next >= MAX_MOVE_ATTEMPTS) {
              gaveUp += ids.length;
              await orm.delete(schema.pendingMoves).where(inArray(schema.pendingMoves.messageId, ids));
            } else {
              await orm
                .update(schema.pendingMoves)
                .set({ attempts: next, nextAttemptAt: Date.now() + retryDelayMs(next) })
                .where(inArray(schema.pendingMoves.messageId, ids));
            }
          }
        }
      }),
    );

    if (gaveUp > 0) {
      // The messages are back in the cache's list; show them again.
      await sync.reloadCurrentListAsync();
      toast.error(
        $i18n.t("mail.errors.moveFailed", { count: gaveUp, reason: getErrorMessage(lastError) }),
      );
    }

    const left = await orm.select().from(schema.pendingMoves);
    if (left.length === 0) {
      toldAboutWaiting = false;
      return;
    }
    if (!toldAboutWaiting && left.some((r) => r.attempts > 0)) {
      toldAboutWaiting = true;
      toast.info($i18n.t("mail.pendingMoves.waiting", { count: left.length }));
    }
    scheduleRetry(nextRetryAt(left));
  };

  const scheduleRetry = (at: number | null) => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    if (at === null) return;
    retryTimer = setTimeout(() => void flushPendingMovesAsync(), Math.max(at - Date.now(), 1000));
  };

  /**
   * Carry out the queued moves that are due, or all of them with `force`. Never throws: a move
   * that did not work stays queued. Calls while one flush runs fold into one more run after it.
   */
  const flushPendingMovesAsync = (force = false): Promise<void> => {
    if (flushing) {
      queuedForce = (queuedForce ?? false) || force;
      return flushing;
    }
    flushing = (async () => {
      try {
        await flushOnceAsync(force);
      } catch (err) {
        console.warn("[haex-mail] flushing queued moves failed", err);
      } finally {
        flushing = null;
      }
      if (queuedForce !== null) {
        const again = queuedForce;
        queuedForce = null;
        await flushPendingMovesAsync(again);
      }
    })();
    return flushing;
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void flushPendingMovesAsync(true));
  }

  return { enqueueMovesAsync, flushPendingMovesAsync };
};

export type MoveOutbox = ReturnType<typeof useMoveOutbox>;
