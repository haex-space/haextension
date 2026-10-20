import { eq } from "drizzle-orm";
import * as schema from "~/database/schemas";
import { planActions, planRuleRun, resolveMoveTarget, type RuleDef } from "~/lib/rules";
import type { MessageEnvelope } from "@haex-space/vault-sdk";
import type { MessageChanges } from "./changes";

const INBOX = "INBOX";
/** The newest INBOX messages "apply to existing" looks at (the most one envelope fetch answers). */
const EXISTING_LIMIT = 1000;

/** Runs after the envelopes of a fetch were cached, before the list is shown again. */
export type AfterEnvelopesPersisted = (
  accountId: string,
  mailboxName: string,
  envelopes: MessageEnvelope[],
) => Promise<void>;

const isSeen = (flags: string[]) => flags.some((f) => f.toLowerCase().includes("seen"));
const isFlagged = (flags: string[]) => flags.some((f) => f.toLowerCase().includes("flagged"));

/**
 * Runs mail rules on INBOX messages: on new ones after each fetch (watch event or normal refresh),
 * and once on the existing ones when a rule asks for it. Rules only run while haex-mail runs.
 */
export const useMailRules = (
  changes: Pick<MessageChanges, "setFlagForUidsAsync" | "moveUidsAsync">,
) => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();
  const rulesStore = useRulesStore();

  /** Plans every envelope against `rules` and carries the plans out; returns how many messages a rule touched. */
  const applyToEnvelopesAsync = async (
    rules: RuleDef[],
    accountId: string,
    envelopes: MessageEnvelope[],
  ): Promise<number> => {
    const account = (await rulesStore.loadRuleAccountsAsync()).find((a) => a.id === accountId);
    if (!account) return 0;
    const read: number[] = [];
    const flagged: number[] = [];
    const moves = new Map<string, number[]>();
    let touched = 0;
    for (const envelope of envelopes) {
      const plan = planActions(
        rules,
        {
          accountId,
          mailboxName: INBOX,
          uid: envelope.uid,
          fromJson: envelope.from,
          toJson: envelope.to,
          ccJson: envelope.cc,
          subject: envelope.subject ?? null,
          hasAttachments: envelope.hasAttachments,
        },
        (_accountId, action) => resolveMoveTarget(account, action),
      );
      if (plan.applied.length === 0) continue;
      touched++;
      if (plan.markRead && !isSeen(envelope.flags)) read.push(envelope.uid);
      if (plan.flag && !isFlagged(envelope.flags)) flagged.push(envelope.uid);
      if (plan.moveTo) moves.set(plan.moveTo, [...(moves.get(plan.moveTo) ?? []), envelope.uid]);
    }
    // Flags first, so a message that is also moved carries them to its new folder.
    if (read.length > 0) await changes.setFlagForUidsAsync(accountId, INBOX, read, "\\Seen", true);
    if (flagged.length > 0) {
      await changes.setFlagForUidsAsync(accountId, INBOX, flagged, "\\Flagged", true);
    }
    for (const [destination, uids] of moves) {
      await changes.moveUidsAsync(accountId, INBOX, uids, destination);
    }
    return touched;
  };

  /**
   * Runs the active rules for INBOX messages the rules have not seen. Never throws: a failed run
   * leaves the mark where it was, so the next fetch tries again (the actions are idempotent).
   */
  const applyRulesToNewInboxAsync: AfterEnvelopesPersisted = async (
    accountId,
    mailboxName,
    envelopes,
  ) => {
    if (!haexVault.orm || mailboxName.toUpperCase() !== INBOX) return;
    try {
      const mailboxId = `${accountId}::${mailboxName}`;
      const mailbox = (
        await haexVault.orm
          .select()
          .from(schema.mailboxes)
          .where(eq(schema.mailboxes.id, mailboxId))
          .limit(1)
      )[0];
      if (!mailbox) return;
      const { run, nextThrough } = planRuleRun(
        mailbox.rulesUidThrough,
        envelopes.map((e) => e.uid),
        mailbox.uidNext,
      );
      if (run.length > 0) {
        await rulesStore.loadRulesAsync();
        const active = rulesStore.rules.filter((r) => r.enabled);
        const fresh = new Set(run);
        if (active.length > 0) {
          await applyToEnvelopesAsync(
            active,
            accountId,
            envelopes.filter((e) => fresh.has(e.uid)),
          );
        }
      }
      if (nextThrough !== mailbox.rulesUidThrough) {
        await haexVault.orm
          .update(schema.mailboxes)
          .set({ rulesUidThrough: nextThrough })
          .where(eq(schema.mailboxes.id, mailboxId));
      }
    } catch (err) {
      console.warn("[haex-mail] failed to run the mail rules", err);
    }
  };

  /**
   * Runs one rule once over the newest INBOX messages of the accounts it covers. Returns how many
   * messages it touched and whether an INBOX had more messages than were looked at.
   */
  const applyRuleToExistingAsync = async (
    rule: RuleDef,
  ): Promise<{ applied: number; limited: boolean }> => {
    const accountIds =
      rule.accountId === null ? accountsStore.accounts.map((a) => a.id) : [rule.accountId];
    let applied = 0;
    let limited = false;
    for (const accountId of accountIds) {
      const account = await accountsStore.getCredentialsCachedAsync(accountId);
      if (!account) continue;
      const envelopes = await haexVault.client.mail.fetchEnvelopesAsync(account.imap, INBOX, {
        type: "latest",
        count: EXISTING_LIMIT,
      });
      limited ||= envelopes.length >= EXISTING_LIMIT;
      applied += await applyToEnvelopesAsync([{ ...rule, enabled: true }], accountId, envelopes);
    }
    return { applied, limited };
  };

  return { applyRulesToNewInboxAsync, applyRuleToExistingAsync };
};
