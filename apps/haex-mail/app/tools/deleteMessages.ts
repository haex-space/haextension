import type { ImapConfig, MailFetchRange, MessageEnvelope } from "@haex-space/vault-sdk";
import {
  connectionOf,
  errorText,
  formatMessageId,
  parseMessageId,
  toolError,
  type AccountsPort,
  type ToolHandlers,
} from "./context";
import { MAX_IDS } from "./messageChanges";

export interface DeleteMessagesDeps {
  accounts: AccountsPort;
  mailClient: {
    fetchEnvelopesAsync(
      imap: ImapConfig,
      mailbox: string,
      range: MailFetchRange,
    ): Promise<MessageEnvelope[]>;
  };
  changes: {
    deleteUidsAsync(accountId: string, mailboxName: string, uids: number[]): Promise<void>;
  };
}

/** Whitespace and case do not make two subjects differ. */
const normalize = (subject: string) => subject.replace(/\s+/g, " ").trim().toLocaleLowerCase();

interface Wanted {
  uid: number;
  subject: string;
}

/**
 * `delete_messages`: removes mails for good, with no way back. The consent shows only the input,
 * so every mail comes with its subject, and a mail whose subject differs on the server is not
 * deleted: what the user agreed to is what goes. Answers per message like `mark_messages`.
 */
export const createDeleteMessagesTools = (deps: () => Promise<DeleteMessagesDeps>): ToolHandlers => ({
  delete_messages: async (input) => {
    const { accounts, mailClient, changes } = await deps();
    const entries = Array.isArray(input.messages) ? input.messages : [];
    if (entries.length === 0) throw toolError("messages names no message");
    if (entries.length > MAX_IDS) throw toolError(`at most ${MAX_IDS} messages per call`);

    const done: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    const groups = new Map<string, { accountId: string; mailboxName: string; wanted: Wanted[] }>();
    for (const entry of entries) {
      const { id, subject } = (entry ?? {}) as { id?: unknown; subject?: unknown };
      const parsed = typeof id === "string" ? parseMessageId(id) : null;
      if (!parsed || typeof subject !== "string") {
        failed.push({ id: typeof id === "string" ? id : "?", reason: "needs an id and the subject of the message" });
        continue;
      }
      const key = `${parsed.accountId}::${parsed.mailboxName}`;
      const group = groups.get(key) ?? { accountId: parsed.accountId, mailboxName: parsed.mailboxName, wanted: [] };
      group.wanted.push({ uid: parsed.uid, subject });
      groups.set(key, group);
    }

    for (const { accountId, mailboxName, wanted } of groups.values()) {
      const idOf = (uid: number) => formatMessageId(accountId, mailboxName, uid);
      try {
        if (!accounts.accounts.some((a) => a.id === accountId)) throw toolError("no such account");
        const { imap } = await connectionOf(accounts, accountId);
        const onServer = await mailClient.fetchEnvelopesAsync(imap, mailboxName, {
          type: "uidList",
          uids: wanted.map((w) => w.uid),
        });
        const subjects = new Map(onServer.map((e) => [e.uid, e.subject ?? ""]));
        const confirmed: number[] = [];
        for (const { uid, subject } of wanted) {
          const actual = subjects.get(uid);
          if (actual === undefined) failed.push({ id: idOf(uid), reason: "this message is not on the server (any more)" });
          else if (normalize(actual) !== normalize(subject)) {
            failed.push({ id: idOf(uid), reason: `the subject on the server is "${actual.slice(0, 100)}"; not deleted` });
          } else confirmed.push(uid);
        }
        if (confirmed.length > 0) {
          await changes.deleteUidsAsync(accountId, mailboxName, confirmed);
          done.push(...confirmed.map(idOf));
        }
      } catch (err) {
        // The host refuses (for example a server without UIDPLUS) before anything is marked.
        const reason = errorText(err);
        const already = new Set(failed.map((f) => f.id));
        for (const { uid } of wanted) if (!already.has(idOf(uid)) && !done.includes(idOf(uid))) failed.push({ id: idOf(uid), reason });
      }
    }
    return { done, failed };
  },
});
