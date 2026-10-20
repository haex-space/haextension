import {
  errorText,
  formatMessageId,
  parseMessageId,
  resolveMailbox,
  toolError,
  type AccountRow,
  type ToolHandlers,
} from "./context";
import type { CachedMailbox } from "./mailboxes";

/** The most messages one `mark_messages` or `move_messages` call changes. */
export const MAX_IDS = 100;

export interface MessageChangeDeps {
  accounts: { accounts: AccountRow[] };
  cachedMailboxes(accountId: string): Promise<CachedMailbox[]>;
  changes: {
    setFlagForUidsAsync(
      accountId: string,
      mailboxName: string,
      uids: number[],
      flag: string,
      add: boolean,
    ): Promise<void>;
    moveUidsAsync(
      accountId: string,
      mailboxName: string,
      uids: number[],
      destinationName: string,
    ): Promise<void>;
  };
}

interface Group {
  accountId: string;
  mailboxName: string;
  uids: number[];
}

interface Outcome {
  done: string[];
  failed: { id: string; reason: string }[];
}

/** The ids of an input, grouped by (account, mailbox); ids that are none are failed at once. */
const groupIds = (input: Record<string, unknown>): { groups: Group[]; outcome: Outcome } => {
  const ids = Array.isArray(input.ids) ? input.ids.filter((i): i is string => typeof i === "string") : [];
  if (ids.length === 0) throw toolError("ids names no message");
  if (ids.length > MAX_IDS) throw toolError(`at most ${MAX_IDS} messages per call`);
  const outcome: Outcome = { done: [], failed: [] };
  const groups = new Map<string, Group>();
  for (const id of ids) {
    const parsed = parseMessageId(id);
    if (!parsed) {
      outcome.failed.push({ id, reason: "not a message id" });
      continue;
    }
    const key = `${parsed.accountId}::${parsed.mailboxName}`;
    const group = groups.get(key) ?? { accountId: parsed.accountId, mailboxName: parsed.mailboxName, uids: [] };
    group.uids.push(parsed.uid);
    groups.set(key, group);
  }
  return { groups: [...groups.values()], outcome };
};

const idsOf = (group: Group) => group.uids.map((uid) => formatMessageId(group.accountId, group.mailboxName, uid));

/**
 * `mark_messages` and `move_messages`. Both answer per message: what was done and what failed with
 * a reason, and one failing group never stops the others.
 */
export const createMessageChangeTools = (deps: () => Promise<MessageChangeDeps>): ToolHandlers => {
  /** Runs `work` for every group of the input; a group that throws fails all its messages. */
  const forEachGroup = async (
    input: Record<string, unknown>,
    known: (accountId: string) => boolean,
    work: (group: Group) => Promise<"done" | string>,
  ): Promise<Outcome> => {
    const { groups, outcome } = groupIds(input);
    for (const group of groups) {
      let result: string;
      if (!known(group.accountId)) result = "no such account";
      else {
        try {
          result = await work(group);
        } catch (err) {
          result = errorText(err);
        }
      }
      for (const id of idsOf(group)) {
        if (result === "done") outcome.done.push(id);
        else outcome.failed.push({ id, reason: result });
      }
    }
    return outcome;
  };

  return {
    mark_messages: async (input) => {
      const { accounts, changes } = await deps();
      const read = typeof input.read === "boolean" ? input.read : undefined;
      const flagged = typeof input.flagged === "boolean" ? input.flagged : undefined;
      if (read === undefined && flagged === undefined) throw toolError("say read or flagged");
      return forEachGroup(input, (id) => accounts.accounts.some((a) => a.id === id), async (g) => {
        if (read !== undefined) {
          await changes.setFlagForUidsAsync(g.accountId, g.mailboxName, g.uids, "\\Seen", read);
        }
        if (flagged !== undefined) {
          await changes.setFlagForUidsAsync(g.accountId, g.mailboxName, g.uids, "\\Flagged", flagged);
        }
        return "done";
      });
    },

    move_messages: async (input) => {
      const { accounts, cachedMailboxes, changes } = await deps();
      const to = typeof input.to === "string" ? input.to.trim() : "";
      if (!to) throw toolError("to names the mailbox or role to move to");
      return forEachGroup(input, (id) => accounts.accounts.some((a) => a.id === id), async (g) => {
        const destination = resolveMailbox(await cachedMailboxes(g.accountId), to);
        if (!destination) return `this account has no mailbox or role "${to}"`;
        // Already there counts as done; nothing needs to move.
        if (destination !== g.mailboxName) {
          await changes.moveUidsAsync(g.accountId, g.mailboxName, g.uids, destination);
        }
        return "done";
      });
    },
  };
};
