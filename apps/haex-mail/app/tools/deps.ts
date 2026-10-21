import { eq } from "drizzle-orm";
import * as schema from "~/database/schemas";
import { htmlToText } from "~/lib/mailHtml";
import { parseMessageId, toolError } from "./context";
import type { ReplyMode } from "./drafts";
import type { ToolDeps } from "./index";

/**
 * The stores and the vault client as the tools see them. Waits until haex-mail has started
 * (database, migrations, accounts), because a tool can be called before any page was opened.
 */
type App = Pick<ReturnType<typeof useNuxtApp>, "runWithContext">;

export const buildToolDeps = async (nuxtApp: App): Promise<ToolDeps> => {
  const { haexVault, accountsStore, mailStore, rulesStore, uiStore } = await nuxtApp.runWithContext(
    () => ({
      haexVault: useHaexVaultStore(),
      accountsStore: useAccountsStore(),
      mailStore: useMailStore(),
      rulesStore: useRulesStore(),
      uiStore: useUiStore(),
    }),
  );
  await haexVault.initializeAsync();
  await accountsStore.loadAccountsAsync();

  const cachedMailboxes = async (accountId: string) => {
    if (!haexVault.orm) return [];
    const rows = await haexVault.orm
      .select()
      .from(schema.mailboxes)
      .where(eq(schema.mailboxes.accountId, accountId));
    return rows.map((m) => ({ name: m.name, role: m.role, unseen: m.unseen, exists: m.exists }));
  };

  /** The cached row of a message; a message found on the server and never opened is cached first. */
  const cachedMessage = async (messageId: string) => {
    const parsed = parseMessageId(messageId);
    if (!parsed || !haexVault.orm) throw toolError("replyTo is not a message id");
    const read = async () =>
      (
        await haexVault.orm!
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.id, messageId))
          .limit(1)
      )[0];
    const cached = await read();
    if (cached) return cached;
    const account = await accountsStore.getCredentialsCachedAsync(parsed.accountId);
    if (!account) throw toolError("haex-mail has no credentials for this account");
    const envelopes = await haexVault.client.mail.fetchEnvelopesAsync(account.imap, parsed.mailboxName, {
      type: "uidList",
      uids: [parsed.uid],
    });
    await mailStore.persistEnvelopesAsync(parsed.accountId, parsed.mailboxName, envelopes);
    const row = await read();
    if (!row) throw toolError("that message does not exist");
    return row;
  };

  return {
    accounts: accountsStore,
    rules: rulesStore,
    applyRuleToExistingAsync: mailStore.applyRuleToExistingAsync,
    openAccountSetup: async (prefill) => {
      uiStore.accountPrefill = prefill;
      uiStore.accountSetupRequested = true;
      await nuxtApp.runWithContext(() => navigateTo("/settings"));
    },
    mailClient: haexVault.client.mail,
    cachedMailboxes,
    htmlToText,
    changes: {
      setFlagForUidsAsync: mailStore.setFlagForUidsAsync,
      moveUidsAsync: mailStore.moveUidsAsync,
      deleteUidsAsync: mailStore.deleteUidsAsync,
    },
    refreshMailboxes: async (accountId: string) => {
      const account = await accountsStore.getCredentialsCachedAsync(accountId);
      if (account) await mailStore.refreshMailboxesAsync(account);
    },
    replyPrefill: async (messageId: string, mode: ReplyMode) =>
      mailStore.buildReplyContextAsync(await cachedMessage(messageId), mode),
  };
};
