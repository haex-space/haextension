import { and, eq } from "drizzle-orm";
import { toast } from "vue-sonner";
import * as schema from "~/database/schemas";
import { mailboxDisplayName } from "~/lib/mail";
import { getErrorMessage } from "~/lib/utils";
import type { Ref } from "vue";
import type { MessageChanges } from "./changes";
import type { MoveOutbox } from "./outbox";
import type { MailSync } from "./sync";

interface BulkMessageState {
  selectedMessageId: Ref<string | null>;
  messageList: Ref<schema.SelectMessage[]>;
}

/**
 * All bulk actions group the selected rows by (accountId, mailboxName),
 * so they work identically in per-account and unified view.
 *
 * Moves are optimistic: the rows leave the list at once and the move itself is left to the
 * outbox, which repeats it until the server has done it (see outbox.ts).
 */
export const useBulkMessageOps = (
  state: BulkMessageState,
  sync: Pick<MailSync, "reloadCurrentListAsync">,
  changes: Pick<MessageChanges, "setFlagForUidsAsync">,
  outbox: Pick<MoveOutbox, "enqueueMovesAsync" | "flushPendingMovesAsync">,
  selectMessage: (id: string | null) => void,
) => {
  const haexVault = useHaexVaultStore();
  const { $i18n } = useNuxtApp();
  const {
    selectedMessageId,
    messageList,
  } = state;
  const { reloadCurrentListAsync } = sync;

  interface MessageGroup {
    accountId: string;
    mailboxName: string;
    rows: schema.SelectMessage[];
  }

  const groupSelectedRows = (ids: string[]): MessageGroup[] => {
    const groups = new Map<string, MessageGroup>();
    for (const id of ids) {
      const row = messageList.value.find((m) => m.id === id);
      if (!row) continue;
      const key = `${row.accountId}::${row.mailboxName}`;
      let group = groups.get(key);
      if (!group) {
        group = { accountId: row.accountId, mailboxName: row.mailboxName, rows: [] };
        groups.set(key, group);
      }
      group.rows.push(row);
    }
    return [...groups.values()];
  };

  const reportBulkFailures = (results: PromiseSettledResult<unknown>[]) => {
    const failed = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (failed) {
      console.warn("[haex-mail] bulk action failed", failed.reason);
      toast.error(getErrorMessage(failed.reason));
    }
  };

  /** Mark messages read/unread (\Seen) or set any other flag. */
  const bulkSetFlagAsync = async (ids: string[], flag: string, add: boolean) => {
    const groups = groupSelectedRows(ids);
    const results = await Promise.allSettled(
      groups.map((g) =>
        changes.setFlagForUidsAsync(
          g.accountId,
          g.mailboxName,
          g.rows.map((r) => r.uid),
          flag,
          add,
        ),
      ),
    );
    reportBulkFailures(results);
    await reloadCurrentListAsync();
  };

  /**
   * Take the messages out of the list and queue their moves for the server. Returns how many were
   * queued; none when the queue could not be written (the list is read again, so they show).
   */
  const queueMovesAsync = async (
    moves: { g: MessageGroup; dest: string }[],
    destinationLabel: string,
  ): Promise<number> => {
    if (moves.length === 0) return 0;
    const gone = new Set(moves.flatMap((m) => m.g.rows.map((r) => r.id)));
    const removeFromList = () => {
      messageList.value = messageList.value.filter((m) => !gone.has(m.id));
    };
    // Before anything is awaited, so the list reacts to the click and not to the database.
    removeFromList();
    try {
      await outbox.enqueueMovesAsync(
        moves.map((m) => ({
          accountId: m.g.accountId,
          mailboxName: m.g.mailboxName,
          destinationName: m.dest,
          uids: m.g.rows.map((r) => r.uid),
        })),
      );
    } catch (err) {
      console.warn("[haex-mail] could not queue move", err);
      toast.error(getErrorMessage(err));
      await reloadCurrentListAsync();
      return 0;
    }
    // A list load that ran meanwhile read the rows before they were marked.
    removeFromList();
    toast.success(
      $i18n.t("mail.pendingMoves.moved", { count: gone.size, folder: destinationLabel }),
    );
    void outbox.flushPendingMovesAsync(true);
    return gone.size;
  };

  /**
   * Delete (role "trash") or archive (role "archive") messages. Returns how
   * many were moved: messages already in that folder stay (the SDK has no
   * expunge, so there is no permanent delete) and the user is told so.
   */
  const bulkMoveToRoleAsync = async (
    ids: string[],
    role: "trash" | "archive",
  ): Promise<number> => {
    const orm = haexVault.orm;
    if (!orm) return 0;
    const destinationOf = async (g: MessageGroup) => {
      const dest = (
        await orm
          .select()
          .from(schema.mailboxes)
          .where(
            and(
              eq(schema.mailboxes.accountId, g.accountId),
              eq(schema.mailboxes.role, role),
            ),
          )
          .limit(1)
      )[0];
      if (!dest) {
        throw new Error(
          $i18n.t("mail.errors.noFolderForRole", {
            folder: $i18n.t(`mail.roles.${role}`),
          }),
        );
      }
      return dest.name;
    };
    const planned = await Promise.allSettled(
      groupSelectedRows(ids).map(async (g) => ({ g, dest: await destinationOf(g) })),
    );
    const moves = planned.flatMap((p) =>
      p.status === "fulfilled" && p.value.dest !== p.value.g.mailboxName ? [p.value] : [],
    );
    const alreadyThere = planned.some(
      (p) => p.status === "fulfilled" && p.value.dest === p.value.g.mailboxName,
    );

    const movingIds = new Set(moves.flatMap((m) => m.g.rows.map((r) => r.id)));
    if (selectedMessageId.value && movingIds.has(selectedMessageId.value)) {
      selectMessage(null);
    }
    reportBulkFailures(planned);
    if (alreadyThere) {
      toast.info(
        $i18n.t(role === "trash" ? "mail.errors.alreadyInTrash" : "mail.errors.alreadyArchived"),
      );
    }
    return queueMovesAsync(moves, $i18n.t(`mail.roles.${role}`));
  };

  /** Move messages to a specific mailbox — caller ensures a single account. */
  const bulkMoveToMailboxAsync = async (ids: string[], mailboxName: string) => {
    if (selectedMessageId.value && ids.includes(selectedMessageId.value)) {
      selectMessage(null);
    }
    await queueMovesAsync(
      groupSelectedRows(ids)
        .filter((g) => g.mailboxName !== mailboxName)
        .map((g) => ({ g, dest: mailboxName })),
      mailboxDisplayName(mailboxName, $i18n.t("mail.roles.inbox")),
    );
  };

  return {
    bulkSetFlagAsync,
    bulkMoveToRoleAsync,
    bulkMoveToMailboxAsync,
  };
};
