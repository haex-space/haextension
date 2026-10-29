/**
 * Pure parts of the queue of pending moves (stores/mail/outbox.ts): grouping what is due into
 * server calls and deciding when a failed move is tried again or given up.
 */

/** Failed tries after which a move is dropped and the message shows in its folder again. */
export const MAX_MOVE_ATTEMPTS = 5;

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 15 * 60_000;

/** Wait before the next try after the `attempts`-th failure: 30 s, 1 min, 2 min … at most 15 min. */
export const retryDelayMs = (attempts: number): number =>
  Math.min(RETRY_BASE_MS * 2 ** Math.max(attempts - 1, 0), RETRY_MAX_MS);

export interface PendingMoveRow {
  messageId: string;
  accountId: string;
  mailboxName: string;
  uid: number;
  destinationName: string;
  nextAttemptAt: number;
}

export interface PendingMoveGroup {
  accountId: string;
  mailboxName: string;
  destinationName: string;
  uids: number[];
  messageIds: string[];
}

/**
 * The moves that are due at `now`, one group per (account, source, destination) — the unit of one
 * server call. With `force` (user asked for it: refresh, start, connection back) the retry wait is
 * ignored.
 */
export const groupDueMoves = (
  rows: PendingMoveRow[],
  now: number,
  force: boolean,
): PendingMoveGroup[] => {
  const groups = new Map<string, PendingMoveGroup>();
  for (const row of rows) {
    if (!force && row.nextAttemptAt > now) continue;
    const key = JSON.stringify([row.accountId, row.mailboxName, row.destinationName]);
    let group = groups.get(key);
    if (!group) {
      group = {
        accountId: row.accountId,
        mailboxName: row.mailboxName,
        destinationName: row.destinationName,
        uids: [],
        messageIds: [],
      };
      groups.set(key, group);
    }
    group.uids.push(row.uid);
    group.messageIds.push(row.messageId);
  }
  return [...groups.values()];
};

/** When the queue should run again on its own: the earliest retry time of the waiting moves. */
export const nextRetryAt = (rows: Pick<PendingMoveRow, "nextAttemptAt">[]): number | null =>
  rows.length === 0 ? null : Math.min(...rows.map((r) => r.nextAttemptAt));
