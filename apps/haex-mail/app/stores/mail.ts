import { and, desc, eq } from "drizzle-orm";
import * as schema from "~/database/schemas";
import type {
  ImapConfig,
  MailMessage,
  MailboxInfo,
  MessageEnvelope,
} from "@haex-space/vault-sdk";
import type { AccountWithCredentials } from "./accounts";

/**
 * Currently-selected account + mailbox + message. The mail UI is
 * driven by these three IDs — switching any of them triggers fetches.
 */
export const useMailStore = defineStore("mail", () => {
  const haexVault = useHaexVaultStore();
  const accountsStore = useAccountsStore();

  const selectedAccountId = ref<string | null>(null);
  const selectedMailboxName = ref<string | null>(null);
  const selectedMessageUid = ref<number | null>(null);

  const mailboxes = ref<schema.SelectMailbox[]>([]);
  const messageList = ref<schema.SelectMessage[]>([]);
  const messageBody = ref<MailMessage | null>(null);

  const isLoadingMailboxes = ref(false);
  const isLoadingMessages = ref(false);
  const isLoadingMessage = ref(false);

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

  const loadMailboxesAsync = async (accountId: string) => {
    if (!haexVault.orm) return;
    const rows = await haexVault.orm
      .select()
      .from(schema.mailboxes)
      .where(eq(schema.mailboxes.accountId, accountId));
    mailboxes.value = rows;
  };

  const syncMailboxesAsync = async (accountId: string, remote: MailboxInfo[]) => {
    if (!haexVault.orm) return;
    for (const m of remote) {
      const id = `${accountId}::${m.name}`;
      const role = inferRole(m.name, m.flags);
      const existing = await haexVault.orm
        .select()
        .from(schema.mailboxes)
        .where(eq(schema.mailboxes.id, id))
        .limit(1);

      if (existing.length === 0) {
        await haexVault.orm.insert(schema.mailboxes).values({
          id,
          accountId,
          name: m.name,
          delimiter: m.delimiter ?? null,
          role,
          unseen: m.unseen ?? 0,
          exists: m.exists ?? 0,
          uidValidity: m.uidValidity ?? null,
          uidNext: m.uidNext ?? null,
        });
      } else {
        await haexVault.orm
          .update(schema.mailboxes)
          .set({
            delimiter: m.delimiter ?? null,
            role,
            unseen: m.unseen ?? 0,
            exists: m.exists ?? 0,
            uidValidity: m.uidValidity ?? null,
            uidNext: m.uidNext ?? null,
          })
          .where(eq(schema.mailboxes.id, id));
      }
    }
  };

  const refreshMessagesAsync = async (
    account: AccountWithCredentials,
    mailboxName: string,
    count: number = 50,
  ) => {
    if (!haexVault.orm) return;
    isLoadingMessages.value = true;
    try {
      const envelopes = await haexVault.client.mail.fetchEnvelopesAsync(
        account.imap,
        mailboxName,
        { type: "latest", count },
      );

      // Reverse so newest is first in the list.
      envelopes.sort((a, b) => (b.internalDate ?? 0) - (a.internalDate ?? 0));

      await persistEnvelopesAsync(account.account.id, mailboxName, envelopes);
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

      const existing = await haexVault.orm
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.id, id))
        .limit(1);

      const row = {
        id,
        accountId,
        mailboxName,
        uid: env.uid,
        threadKey,
        flags: env.flags,
        internalDate: env.internalDate ?? null,
        subject: env.subject ?? null,
        fromJson: env.from,
        toJson: env.to,
        ccJson: env.cc,
        messageId: env.messageId ?? null,
        inReplyTo: env.inReplyTo ?? null,
        references: env.references,
        size: env.size ?? null,
      };

      if (existing.length === 0) {
        await haexVault.orm.insert(schema.messages).values(row);
      } else {
        // Flags can change between fetches (e.g. \Seen); update them.
        await haexVault.orm
          .update(schema.messages)
          .set({ flags: env.flags })
          .where(eq(schema.messages.id, id));
      }
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

  const loadMessageBodyAsync = async (
    account: AccountWithCredentials,
    mailboxName: string,
    uid: number,
  ) => {
    isLoadingMessage.value = true;
    messageBody.value = null;
    try {
      const msg = await haexVault.client.mail.fetchMessageAsync(
        account.imap,
        mailboxName,
        uid,
      );
      messageBody.value = msg;
      // Mark as \Seen if not already. Best-effort.
      if (!msg.envelope.flags.includes("Seen")) {
        try {
          await haexVault.client.mail.setFlagsAsync(
            account.imap,
            mailboxName,
            [uid],
            ["\\Seen"],
            true,
          );
        } catch (err) {
          console.warn("[haex-mail] failed to set \\Seen flag", err);
        }
      }
    } finally {
      isLoadingMessage.value = false;
    }
  };

  const selectMailbox = (mailboxName: string | null) => {
    selectedMailboxName.value = mailboxName;
    selectedMessageUid.value = null;
    messageBody.value = null;
  };

  const selectMessage = (uid: number | null) => {
    selectedMessageUid.value = uid;
  };

  const selectAccount = (accountId: string | null) => {
    selectedAccountId.value = accountId;
    selectedMailboxName.value = null;
    selectedMessageUid.value = null;
    mailboxes.value = [];
    messageList.value = [];
    messageBody.value = null;
  };

  // Auto-select the first account when the list loads.
  watch(
    () => accountsStore.accounts,
    (list) => {
      if (!selectedAccountId.value && list.length > 0) {
        selectedAccountId.value = list[0]!.id;
      }
    },
    { immediate: true },
  );

  return {
    selectedAccountId,
    selectedMailboxName,
    selectedMessageUid,
    mailboxes,
    messageList,
    messageBody,
    isLoadingMailboxes,
    isLoadingMessages,
    isLoadingMessage,
    refreshMailboxesAsync,
    loadMailboxesAsync,
    refreshMessagesAsync,
    loadMessagesAsync,
    loadMessageBodyAsync,
    selectAccount,
    selectMailbox,
    selectMessage,
  };
});

/**
 * Map an IMAP mailbox name + LIST flags to a standardized role used in
 * the sidebar. The IMAP RFC 6154 SPECIAL-USE flags (\Sent, \Drafts,
 * \Trash, \Junk, \Archive) are most reliable; fall back to common
 * folder names when the server doesn't advertise them.
 */
function inferRole(name: string, flags: string[]): string | null {
  const flagSet = new Set(flags.map((f) => f.toLowerCase()));
  if (flagSet.has("\\inbox") || name.toUpperCase() === "INBOX") return "inbox";
  if (flagSet.has("\\sent")) return "sent";
  if (flagSet.has("\\drafts")) return "drafts";
  if (flagSet.has("\\trash")) return "trash";
  if (flagSet.has("\\junk")) return "junk";
  if (flagSet.has("\\archive")) return "archive";

  const lower = name.toLowerCase();
  if (lower.includes("sent") || lower.includes("gesend")) return "sent";
  if (lower.includes("draft") || lower.includes("entwurf")) return "drafts";
  if (lower.includes("trash") || lower.includes("papierkorb") || lower.includes("deleted"))
    return "trash";
  if (lower.includes("spam") || lower.includes("junk")) return "junk";
  if (lower.includes("archiv")) return "archive";
  return null;
}
