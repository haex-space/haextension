import { and, eq, inArray } from "drizzle-orm";
import { toast } from "vue-sonner";
import * as schema from "~/database/schemas";
import { getErrorMessage } from "~/lib/utils";
import type { ComputedRef, Ref } from "vue";
import type { MailSync } from "./sync";

interface BulkMessageState {
  selectedAccountId: Ref<string | null>;
  selectedMailboxName: Ref<string | null>;
  selectedRole: Ref<schema.MailboxRole | null>;
  selectedMessageId: Ref<string | null>;
  isUnifiedView: ComputedRef<boolean>;
  messageList: Ref<schema.SelectMessage[]>;
}

/**
 * All bulk actions group the selected rows by (accountId, mailboxName),
 * so they work identically in per-account and unified view.
 */
export const useBulkMessageOps = (
  state: BulkMessageState,
  sync: Pick<
    MailSync,
    "refreshMailboxStatusAsync" | "loadMessagesAsync" | "loadUnifiedMessagesAsync"
  >,
  updateLocalFlagsAsync: (ids: string[], flag: string, add: boolean) => Promise<void>,
  selectMessage: (id: string | null) => void,
) => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const { $i18n } = useNuxtApp();
  const {
    selectedAccountId,
    selectedMailboxName,
    selectedRole,
    selectedMessageId,
    isUnifiedView,
    messageList,
  } = state;
  const { refreshMailboxStatusAsync, loadMessagesAsync, loadUnifiedMessagesAsync } = sync;

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

  const reloadCurrentListAsync = async () => {
    if (isUnifiedView.value && selectedRole.value) {
      await loadUnifiedMessagesAsync(selectedRole.value);
    } else if (selectedAccountId.value && selectedMailboxName.value) {
      await loadMessagesAsync(selectedAccountId.value, selectedMailboxName.value);
    }
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
      groups.map(async (g) => {
        const account = await accountsStore.getCredentialsCachedAsync(g.accountId);
        if (!account) throw new Error($i18n.t("mail.errors.credentials"));
        await haexVault.client.mail.setFlagsAsync(
          account.imap,
          g.mailboxName,
          g.rows.map((r) => r.uid),
          [flag],
          add,
        );
        await updateLocalFlagsAsync(g.rows.map((r) => r.id), flag, add);
        await refreshMailboxStatusAsync(g.accountId, [g.mailboxName]);
      }),
    );
    reportBulkFailures(results);
    await reloadCurrentListAsync();
  };

  /** Move messages of one group to a destination mailbox and drop the cache rows. */
  const moveGroupAsync = async (g: MessageGroup, destinationName: string) => {
    if (!haexVault.orm) return;
    if (destinationName === g.mailboxName) return;
    const account = await accountsStore.getCredentialsCachedAsync(g.accountId);
    if (!account) throw new Error($i18n.t("mail.errors.credentials"));
    await haexVault.client.mail.moveMessagesAsync(
      account.imap,
      g.mailboxName,
      destinationName,
      g.rows.map((r) => r.uid),
    );
    // Messages first — an interrupted run then leaves at worst orphaned
    // body rows, never ghost list entries whose UIDs are already moved.
    const ids = g.rows.map((r) => r.id);
    await haexVault.orm
      .delete(schema.messages)
      .where(inArray(schema.messages.id, ids));
    await haexVault.orm
      .delete(schema.messageBodies)
      .where(inArray(schema.messageBodies.messageId, ids));
    await refreshMailboxStatusAsync(g.accountId, [g.mailboxName, destinationName]);
  };

  /** Delete (role "trash") or archive (role "archive") messages. */
  const bulkMoveToRoleAsync = async (ids: string[], role: "trash" | "archive") => {
    if (!haexVault.orm) return;
    if (selectedMessageId.value && ids.includes(selectedMessageId.value)) {
      selectMessage(null);
    }
    const groups = groupSelectedRows(ids);
    const results = await Promise.allSettled(
      groups.map(async (g) => {
        const dest = (
          await haexVault.orm!
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
        await moveGroupAsync(g, dest.name);
      }),
    );
    reportBulkFailures(results);
    await reloadCurrentListAsync();
  };

  /** Move messages to a specific mailbox — caller ensures a single account. */
  const bulkMoveToMailboxAsync = async (ids: string[], mailboxName: string) => {
    if (selectedMessageId.value && ids.includes(selectedMessageId.value)) {
      selectMessage(null);
    }
    const groups = groupSelectedRows(ids);
    const results = await Promise.allSettled(
      groups.map((g) => moveGroupAsync(g, mailboxName)),
    );
    reportBulkFailures(results);
    await reloadCurrentListAsync();
  };

  return {
    bulkSetFlagAsync,
    bulkMoveToRoleAsync,
    bulkMoveToMailboxAsync,
  };
};
