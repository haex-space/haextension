import { and, desc, eq, inArray } from "drizzle-orm";
import * as schema from "~/database/schemas";
import { quoteImapString } from "~/lib/imap";
import { inferRole } from "~/lib/mail";
import type { MailboxInfo, MessageEnvelope } from "@haex-space/vault-sdk";
import type { ComputedRef, Ref } from "vue";
import type { AccountWithCredentials } from "../accounts";

interface MailSyncState {
  selectedAccountId: Ref<string | null>;
  selectedRole: Ref<schema.MailboxRole | null>;
  isUnifiedView: ComputedRef<boolean>;
  mailboxes: Ref<schema.SelectMailbox[]>;
  messageList: Ref<schema.SelectMessage[]>;
  isLoadingMailboxes: Ref<boolean>;
  isLoadingMessages: Ref<boolean>;
}

/**
 * Keeps the local mailbox + envelope cache in sync with the IMAP server
 * and loads the cached rows into the mail store's list state.
 */
export const useMailSync = (state: MailSyncState) => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const {
    selectedAccountId,
    selectedRole,
    isUnifiedView,
    mailboxes,
    messageList,
    isLoadingMailboxes,
    isLoadingMessages,
  } = state;

  const refreshMailboxesAsync = async (account: AccountWithCredentials) => {
    if (!haexVault.orm) return;
    isLoadingMailboxes.value = true;
    try {
      const remote = await haexVault.client.mail.listMailboxesAsync(account.imap, {
        includeStatus: true,
      });
      await syncMailboxesAsync(account.account.id, remote);
      await loadMailboxesAsync(account.account.id);
    } finally {
      isLoadingMailboxes.value = false;
    }
  };

  const loadMailboxesAsync = async (accountId?: string) => {
    if (!haexVault.orm) return;
    const rows = accountId
      ? await haexVault.orm
          .select()
          .from(schema.mailboxes)
          .where(eq(schema.mailboxes.accountId, accountId))
      : await haexVault.orm.select().from(schema.mailboxes);
    mailboxes.value = rows;
  };

  const syncMailboxesAsync = async (accountId: string, remote: MailboxInfo[]) => {
    if (!haexVault.orm) return;
    const existing = await haexVault.orm
      .select()
      .from(schema.mailboxes)
      .where(eq(schema.mailboxes.accountId, accountId));
    const existingById = new Map(existing.map((m) => [m.id, m]));

    for (const m of remote) {
      const id = `${accountId}::${m.name}`;
      const values = {
        delimiter: m.delimiter ?? null,
        role: inferRole(m.name, m.flags),
        unseen: m.unseen ?? 0,
        exists: m.exists ?? 0,
        uidValidity: m.uidValidity ?? null,
        uidNext: m.uidNext ?? null,
      };

      const prev = existingById.get(id);
      if (!prev) {
        await haexVault.orm
          .insert(schema.mailboxes)
          .values({ id, accountId, name: m.name, ...values });
      } else {
        // UIDs are only unique per uidValidity generation — when the
        // server resets it, cached messages and bodies are stale and a
        // recycled UID would otherwise serve the wrong cached body.
        if (
          prev.uidValidity != null &&
          m.uidValidity != null &&
          prev.uidValidity !== m.uidValidity
        ) {
          await invalidateMailboxCacheAsync(accountId, m.name);
        }
        await haexVault.orm
          .update(schema.mailboxes)
          .set(values)
          .where(eq(schema.mailboxes.id, id));
      }
    }
  };

  /**
   * Re-read the server status (UNSEEN/EXISTS) of the given mailboxes after
   * a local change (read, move, delete) so the sidebar counters stay
   * current. The exact, quoted name as LIST pattern limits STATUS to
   * those boxes.
   * Best-effort: the action itself already succeeded.
   */
  const refreshMailboxStatusAsync = async (
    accountId: string,
    mailboxNames: string[],
  ) => {
    try {
      const account = await accountsStore.getCredentialsCachedAsync(accountId);
      if (!account) return;
      const remote: MailboxInfo[] = [];
      for (const name of mailboxNames) {
        remote.push(
          ...(await haexVault.client.mail.listMailboxesAsync(account.imap, {
            pattern: quoteImapString(name),
            includeStatus: true,
          })),
        );
      }
      await syncMailboxesAsync(accountId, remote);
    } catch (err) {
      console.warn("[haex-mail] failed to refresh mailbox status", err);
      return;
    }
    if (isUnifiedView.value) {
      await loadMailboxesAsync();
    } else if (selectedAccountId.value === accountId) {
      await loadMailboxesAsync(accountId);
    }
  };

  /** Drop cached messages + bodies of one mailbox (uidValidity reset). */
  const invalidateMailboxCacheAsync = async (
    accountId: string,
    mailboxName: string,
  ) => {
    if (!haexVault.orm) return;
    const scope = and(
      eq(schema.messages.accountId, accountId),
      eq(schema.messages.mailboxName, mailboxName),
    );
    // Bodies first, scoped via subquery (an id list could exceed
    // SQLite's bind-parameter limit) — it needs the message rows still
    // present. An interrupted run leaves messages without bodies,
    // which simply re-fetch on demand.
    await haexVault.orm.delete(schema.messageBodies).where(
      inArray(
        schema.messageBodies.messageId,
        haexVault.orm
          .select({ id: schema.messages.id })
          .from(schema.messages)
          .where(scope),
      ),
    );
    await haexVault.orm.delete(schema.messages).where(scope);
  };

  const refreshMessagesAsync = async (
    account: AccountWithCredentials,
    mailboxName: string,
    count: number = 50,
  ) => {
    if (!haexVault.orm) return;
    isLoadingMessages.value = true;
    try {
      await loadMessagesAsync(account.account.id, mailboxName);
      const envelopes = await haexVault.client.mail.fetchEnvelopesAsync(
        account.imap,
        mailboxName,
        { type: "latest", count },
      );
      await persistEnvelopesAsync(account.account.id, mailboxName, envelopes);
      await purgeDeletedMessagesAsync(account, mailboxName, new Set(envelopes.map((e) => e.uid)));
      await loadMessagesAsync(account.account.id, mailboxName);
    } finally {
      isLoadingMessages.value = false;
    }
  };

  const persistEnvelopesAsync = async (
    accountId: string,
    mailboxName: string,
    envelopes: MessageEnvelope[],
  ) => {
    if (!haexVault.orm) return;
    for (const env of envelopes) {
      const id = `${accountId}::${mailboxName}::${env.uid}`;
      const threadKey = env.references[0] ?? env.inReplyTo ?? env.messageId ?? id;
      const flags = env.flags.map((f) => f.replace(/^\\/, ""));

      // Envelope fields are immutable per UID — only flags change between
      // fetches (e.g. \Seen added by another client). Insert the row if it
      // is new, then always update flags so they stay in sync regardless.
      // hasAttachments rides along on that same update: rows cached before
      // this field existed default to false and would otherwise never
      // self-correct on a later refresh of the same UID.
      await haexVault.orm
        .insert(schema.messages)
        .values({
          id,
          accountId,
          mailboxName,
          uid: env.uid,
          threadKey,
          flags,
          internalDate: env.internalDate ?? null,
          subject: env.subject ?? null,
          fromJson: env.from,
          toJson: env.to,
          ccJson: env.cc,
          messageId: env.messageId ?? null,
          inReplyTo: env.inReplyTo ?? null,
          references: env.references,
          size: env.size ?? null,
          hasAttachments: env.hasAttachments,
        })
        .onConflictDoNothing();
      await haexVault.orm
        .update(schema.messages)
        .set({ flags, hasAttachments: env.hasAttachments })
        .where(eq(schema.messages.id, id));
    }
  };

  /**
   * Remove cached messages that no longer exist on the server.
   * After a "latest" fetch we know which UIDs exist in that window, but older
   * cached UIDs could have been expunged from another client. We verify them
   * via a single uidList round-trip and delete any the server doesn't return.
   */
  const purgeDeletedMessagesAsync = async (
    account: AccountWithCredentials,
    mailboxName: string,
    confirmedUids: Set<number>,
  ) => {
    if (!haexVault.orm) return;
    const cached = await haexVault.orm
      .select({ uid: schema.messages.uid, id: schema.messages.id })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.accountId, account.account.id),
          eq(schema.messages.mailboxName, mailboxName),
        ),
      );

    const unverified = cached.filter((r) => !confirmedUids.has(r.uid));
    if (!unverified.length) return;

    const stillPresent = await haexVault.client.mail.fetchEnvelopesAsync(
      account.imap,
      mailboxName,
      { type: "uidList", uids: unverified.map((r) => r.uid) },
    );
    await persistEnvelopesAsync(account.account.id, mailboxName, stillPresent);

    const presentUids = new Set(stillPresent.map((e) => e.uid));
    const toDelete = unverified.filter((r) => !presentUids.has(r.uid)).map((r) => r.id);
    if (!toDelete.length) return;

    // Batch deletes to stay within SQLite's bind-parameter limit (same
    // rationale as the subquery approach in invalidateMailboxCacheAsync).
    const BATCH_SIZE = 500;
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = toDelete.slice(i, i + BATCH_SIZE);
      await haexVault.orm
        .delete(schema.messageBodies)
        .where(inArray(schema.messageBodies.messageId, batch));
      await haexVault.orm
        .delete(schema.messages)
        .where(inArray(schema.messages.id, batch));
    }
  };

  const loadMessagesAsync = async (accountId: string, mailboxName: string) => {
    if (!haexVault.orm) return;
    const rows = await haexVault.orm
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.accountId, accountId),
          eq(schema.messages.mailboxName, mailboxName),
        ),
      )
      .orderBy(desc(schema.messages.internalDate));
    messageList.value = rows;
  };

  /**
   * Unified view: cached messages of every account's mailbox with the
   * given role, merged and sorted by date.
   */
  const loadUnifiedMessagesAsync = async (role: schema.MailboxRole) => {
    if (!haexVault.orm) return;
    const rows = await haexVault.orm
      .select({ message: schema.messages })
      .from(schema.messages)
      .innerJoin(
        schema.mailboxes,
        and(
          eq(schema.mailboxes.accountId, schema.messages.accountId),
          eq(schema.mailboxes.name, schema.messages.mailboxName),
        ),
      )
      .where(eq(schema.mailboxes.role, role))
      .orderBy(desc(schema.messages.internalDate));
    messageList.value = rows.map((r) => r.message);
  };

  /**
   * Unified refresh: for every account, sync mailboxes and fetch the
   * latest envelopes of its role mailbox. Per-account failures don't
   * abort the others.
   */
  const refreshUnifiedAsync = async (
    role: schema.MailboxRole,
    accounts: AccountWithCredentials[],
    count: number = 50,
  ) => {
    if (!haexVault.orm) return;
    isLoadingMailboxes.value = true;
    isLoadingMessages.value = true;
    try {
      await loadMailboxesAsync();
      await loadUnifiedMessagesAsync(role);
      const results = await Promise.allSettled(
        accounts.map(async (acc) => {
          const remote = await haexVault.client.mail.listMailboxesAsync(
            acc.imap,
            { includeStatus: true },
          );
          await syncMailboxesAsync(acc.account.id, remote);
          const roleName = remote.find(
            (m) => inferRole(m.name, m.flags) === role,
          )?.name;
          if (!roleName) return;
          const envelopes = await haexVault.client.mail.fetchEnvelopesAsync(
            acc.imap,
            roleName,
            { type: "latest", count },
          );
          await persistEnvelopesAsync(acc.account.id, roleName, envelopes);
          await purgeDeletedMessagesAsync(acc, roleName, new Set(envelopes.map((e) => e.uid)));
        }),
      );
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.warn(
            "[haex-mail] unified refresh failed for account",
            accounts[i]?.account.id,
            r.reason,
          );
        }
      });
      // The user may have switched views while fetches were in flight.
      if (isUnifiedView.value) {
        await loadMailboxesAsync();
        if (selectedRole.value === role) {
          await loadUnifiedMessagesAsync(role);
        }
      }
    } finally {
      isLoadingMailboxes.value = false;
      isLoadingMessages.value = false;
    }
  };

  return {
    refreshMailboxesAsync,
    loadMailboxesAsync,
    syncMailboxesAsync,
    refreshMailboxStatusAsync,
    refreshMessagesAsync,
    persistEnvelopesAsync,
    loadMessagesAsync,
    loadUnifiedMessagesAsync,
    refreshUnifiedAsync,
  };
};

export type MailSync = ReturnType<typeof useMailSync>;
