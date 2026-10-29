import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import * as schema from "~/database/schemas";
import { createStatusOrdering, MAX_UIDS_PER_FETCH, quoteImapString } from "~/lib/imap";
import { assignRoles } from "~/lib/mailboxRoles";
import { chunk, getErrorMessage } from "~/lib/utils";
import type { MailboxInfo, MessageEnvelope } from "@haex-space/vault-sdk";
import type { ComputedRef, Ref } from "vue";
import type { AccountWithCredentials } from "../accounts";
import type { AfterEnvelopesPersisted } from "./rules";

interface MailSyncState {
  selectedAccountId: Ref<string | null>;
  selectedMailboxName: Ref<string | null>;
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
export const useMailSync = (
  state: MailSyncState,
  afterEnvelopesPersisted: AfterEnvelopesPersisted,
) => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const {
    selectedAccountId,
    selectedMailboxName,
    selectedRole,
    isUnifiedView,
    mailboxes,
    messageList,
    isLoadingMailboxes,
    isLoadingMessages,
  } = state;

  const statusOrdering = createStatusOrdering();

  /** Messages the user already moved away whose server move is still to be done stay out of every list. */
  const notPendingMove = () =>
    notInArray(
      schema.messages.id,
      haexVault.orm!.select({ id: schema.pendingMoves.messageId }).from(schema.pendingMoves),
    );
  // Only the latest refresh may clear its loading flag — an older one can
  // still be running after the user switched folder or account.
  let mailboxRefreshSeq = 0;
  let listRefreshSeq = 0;

  const refreshMailboxesAsync = async (account: AccountWithCredentials): Promise<MailboxInfo[]> => {
    if (!haexVault.orm) return [];
    const seq = ++mailboxRefreshSeq;
    isLoadingMailboxes.value = true;
    try {
      const seq = statusOrdering.issue();
      const remote = await haexVault.client.mail.listMailboxesAsync(account.imap, {
        includeStatus: true,
      });
      await syncMailboxesAsync(account.account.id, remote, seq, { complete: true });
      await loadMailboxesAsync(account.account.id);
      return remote;
    } finally {
      if (seq === mailboxRefreshSeq) isLoadingMailboxes.value = false;
    }
  };

  // The loaders below run at the end of IMAP round-trips; they only publish
  // rows that still match the selection, so a slow refresh of a previous
  // folder or account can't overwrite the current one.

  /** One account's mailboxes, or every account's (unified view) without `accountId`. */
  const loadMailboxesAsync = async (accountId?: string) => {
    if (!haexVault.orm) return;
    const rows = accountId
      ? await haexVault.orm
          .select()
          .from(schema.mailboxes)
          .where(eq(schema.mailboxes.accountId, accountId))
      : await haexVault.orm.select().from(schema.mailboxes);
    const isSelected = accountId
      ? !isUnifiedView.value && selectedAccountId.value === accountId
      : isUnifiedView.value;
    if (isSelected) mailboxes.value = rows;
  };

  /**
   * `seq` comes from `statusOrdering.issue()`, taken before the LIST request.
   * `complete` marks an unfiltered LIST: only then are roles (re)assigned,
   * since a role is unique among all of the account's mailboxes.
   */
  const syncMailboxesAsync = async (
    accountId: string,
    remote: MailboxInfo[],
    seq: number,
    { complete }: { complete: boolean },
  ) => {
    if (!haexVault.orm) return;
    const existing = await haexVault.orm
      .select()
      .from(schema.mailboxes)
      .where(eq(schema.mailboxes.accountId, accountId));
    const existingById = new Map(existing.map((m) => [m.id, m]));
    const roles = complete ? assignRoles(remote) : null;

    for (const [i, m] of remote.entries()) {
      const id = `${accountId}::${m.name}`;
      const prev = existingById.get(id);
      const structure = {
        delimiter: m.delimiter ?? null,
        role: roles ? roles[i]! : (prev?.role ?? null),
      };
      if (!statusOrdering.claim(id, seq)) {
        // A later STATUS already wrote the counters; the LIST structure still applies.
        if (prev && complete) {
          await haexVault.orm
            .update(schema.mailboxes)
            .set(structure)
            .where(eq(schema.mailboxes.id, id));
        }
        continue;
      }
      // A failed STATUS leaves these unset — keep the last known values,
      // above all uidValidity, whose loss would disable the reset check below.
      const values = {
        ...structure,
        unseen: m.unseen ?? prev?.unseen ?? 0,
        exists: m.exists ?? prev?.exists ?? 0,
        uidValidity: m.uidValidity ?? prev?.uidValidity ?? null,
        uidNext: m.uidNext ?? prev?.uidNext ?? null,
      };

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

    // A complete LIST names every mailbox: the rest were deleted or renamed
    // on the server. (An empty LIST is a server hiccup — INBOX always exists.)
    if (complete && remote.length > 0) {
      const listed = new Set(remote.map((m) => m.name));
      for (const gone of existing.filter((m) => !listed.has(m.name))) {
        await invalidateMailboxCacheAsync(accountId, gone.name);
        await haexVault.orm
          .delete(schema.mailboxes)
          .where(eq(schema.mailboxes.id, gone.id));
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
      const seq = statusOrdering.issue();
      const remote: MailboxInfo[] = [];
      for (const name of mailboxNames) {
        remote.push(
          ...(await haexVault.client.mail.listMailboxesAsync(account.imap, {
            pattern: quoteImapString(name),
            includeStatus: true,
          })),
        );
      }
      await syncMailboxesAsync(accountId, remote, seq, { complete: false });
      if (isUnifiedView.value) {
        await loadMailboxesAsync();
      } else if (selectedAccountId.value === accountId) {
        await loadMailboxesAsync(accountId);
      }
    } catch (err) {
      console.warn("[haex-mail] failed to refresh mailbox status", err);
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
    // Queued moves name UIDs of the old generation — they would hit other messages now.
    await haexVault.orm
      .delete(schema.pendingMoves)
      .where(
        and(
          eq(schema.pendingMoves.accountId, accountId),
          eq(schema.pendingMoves.mailboxName, mailboxName),
        ),
      );
    // The rules' mark counts UIDs of the old generation; the next fetch sets it anew.
    await haexVault.orm
      .update(schema.mailboxes)
      .set({ rulesUidThrough: null })
      .where(eq(schema.mailboxes.id, `${accountId}::${mailboxName}`));
  };

  const refreshMessagesAsync = async (
    account: AccountWithCredentials,
    mailboxName: string,
    count: number = 50,
  ) => {
    if (!haexVault.orm) return;
    const seq = ++listRefreshSeq;
    isLoadingMessages.value = true;
    try {
      await loadMessagesAsync(account.account.id, mailboxName);
      // Detects a UIDVALIDITY reset (and drops the stale cache) before new
      // envelopes are merged into rows keyed by UID.
      await refreshMailboxStatusAsync(account.account.id, [mailboxName]);
      const envelopes = await haexVault.client.mail.fetchEnvelopesAsync(
        account.imap,
        mailboxName,
        { type: "latest", count },
      );
      await persistEnvelopesAsync(account.account.id, mailboxName, envelopes);
      // Before the list is read again, so a message a rule moves away never shows up first.
      await afterEnvelopesPersisted(account.account.id, mailboxName, envelopes);
      await purgeDeletedMessagesAsync(account, mailboxName, new Set(envelopes.map((e) => e.uid)));
      await loadMessagesAsync(account.account.id, mailboxName);
    } finally {
      if (seq === listRefreshSeq) isLoadingMessages.value = false;
    }
  };

  const persistEnvelopesAsync = async (
    accountId: string,
    mailboxName: string,
    envelopes: MessageEnvelope[],
  ) => {
    if (!haexVault.orm) return;
    // Envelope fields are immutable per UID — only flags change between
    // fetches (e.g. \Seen added by another client), so an existing row only
    // takes the new flags. hasAttachments rides along: rows cached before
    // this field existed default to false and would otherwise never
    // self-correct on a later refresh of the same UID.
    // 50 rows of at most 17 values stay below SQLite's bind-parameter limit.
    for (const batch of chunk(envelopes, 50)) {
      await haexVault.orm
        .insert(schema.messages)
        .values(
          batch.map((env) => {
            const id = `${accountId}::${mailboxName}::${env.uid}`;
            return {
              id,
              accountId,
              mailboxName,
              uid: env.uid,
              threadKey: env.references[0] ?? env.inReplyTo ?? env.messageId ?? id,
              flags: env.flags.map((f) => f.replace(/^\\/, "")),
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
            };
          }),
        )
        .onConflictDoUpdate({
          // The vault's SQL check accepts only plain column names as conflict
          // target; a column object renders table-qualified.
          target: sql`${sql.identifier(schema.messages.id.name)}`,
          set: {
            flags: sql`excluded.${sql.identifier(schema.messages.flags.name)}`,
            hasAttachments: sql`excluded.${sql.identifier(schema.messages.hasAttachments.name)}`,
          },
        });
    }
  };

  /**
   * Remove cached messages that no longer exist on the server.
   * After a "latest" fetch we know which UIDs exist in that window, but older
   * cached UIDs could have been expunged from another client. We verify them
   * via uidList fetches (at most MAX_UIDS_PER_FETCH each) and delete any the
   * server doesn't return.
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

    const presentUids = new Set<number>();
    for (const uids of chunk(unverified.map((r) => r.uid), MAX_UIDS_PER_FETCH)) {
      const stillPresent = await haexVault.client.mail.fetchEnvelopesAsync(
        account.imap,
        mailboxName,
        { type: "uidList", uids },
      );
      await persistEnvelopesAsync(account.account.id, mailboxName, stillPresent);
      for (const e of stillPresent) presentUids.add(e.uid);
    }

    const toDelete = unverified.filter((r) => !presentUids.has(r.uid)).map((r) => r.id);
    if (!toDelete.length) return;

    // Batch deletes to stay within SQLite's bind-parameter limit (same
    // rationale as the subquery approach in invalidateMailboxCacheAsync).
    for (const batch of chunk(toDelete, 500)) {
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
          notPendingMove(),
        ),
      )
      .orderBy(desc(schema.messages.internalDate));
    if (
      !isUnifiedView.value &&
      selectedAccountId.value === accountId &&
      selectedMailboxName.value === mailboxName
    ) {
      messageList.value = rows;
    }
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
      .where(and(eq(schema.mailboxes.role, role), notPendingMove()))
      .orderBy(desc(schema.messages.internalDate));
    if (isUnifiedView.value && selectedRole.value === role) {
      messageList.value = rows.map((r) => r.message);
    }
  };

  /** Re-read whatever list is on screen from the cache. */
  const reloadCurrentListAsync = async () => {
    if (isUnifiedView.value && selectedRole.value) {
      await loadUnifiedMessagesAsync(selectedRole.value);
    } else if (selectedAccountId.value && selectedMailboxName.value) {
      await loadMessagesAsync(selectedAccountId.value, selectedMailboxName.value);
    }
  };

  /**
   * Unified refresh: for every account, sync mailboxes and fetch the
   * latest envelopes of its role mailbox. Per-account failures don't
   * abort the others; they are thrown together (AggregateError) at the end.
   */
  const refreshUnifiedAsync = async (
    role: schema.MailboxRole,
    accounts: AccountWithCredentials[],
    count: number = 50,
  ) => {
    if (!haexVault.orm) return;
    const mailboxSeq = ++mailboxRefreshSeq;
    const listSeq = ++listRefreshSeq;
    isLoadingMailboxes.value = true;
    isLoadingMessages.value = true;
    try {
      await loadMailboxesAsync();
      await loadUnifiedMessagesAsync(role);
      const results = await Promise.allSettled(
        accounts.map(async (acc) => {
          const seq = statusOrdering.issue();
          const remote = await haexVault.client.mail.listMailboxesAsync(
            acc.imap,
            { includeStatus: true },
          );
          await syncMailboxesAsync(acc.account.id, remote, seq, { complete: true });
          const roles = assignRoles(remote);
          const roleName = remote.find((_, i) => roles[i] === role)?.name;
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
      await loadMailboxesAsync();
      await loadUnifiedMessagesAsync(role);
      // Reported after the reload, so the accounts that worked still show.
      const failed = results.flatMap((r, i) =>
        r.status === "rejected" ? [{ email: accounts[i]!.account.email, reason: r.reason }] : [],
      );
      if (failed.length > 0) {
        throw new AggregateError(
          failed.map((f) => f.reason),
          failed.map((f) => `${f.email}: ${getErrorMessage(f.reason)}`).join("\n"),
        );
      }
    } finally {
      if (mailboxSeq === mailboxRefreshSeq) isLoadingMailboxes.value = false;
      if (listSeq === listRefreshSeq) isLoadingMessages.value = false;
    }
  };

  return {
    statusOrdering,
    refreshMailboxesAsync,
    loadMailboxesAsync,
    syncMailboxesAsync,
    refreshMailboxStatusAsync,
    refreshMessagesAsync,
    persistEnvelopesAsync,
    loadMessagesAsync,
    loadUnifiedMessagesAsync,
    reloadCurrentListAsync,
    refreshUnifiedAsync,
  };
};

export type MailSync = ReturnType<typeof useMailSync>;
