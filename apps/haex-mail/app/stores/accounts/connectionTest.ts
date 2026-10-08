import { inferRole } from "~/lib/mail";
import type * as schema from "~/database/schemas";
import type { ConnectionSecurity, ImapConfig, SmtpConfig } from "@haex-space/vault-sdk";
import type { Ref } from "vue";

/**
 * Connection tests for the account form — nothing is persisted.
 */
export const useAccountConnectionTest = (accounts: Ref<schema.SelectAccount[]>) => {
  const haexVault = useHaexVaultStore();
  const { $i18n } = useNuxtApp();

  /**
   * Resolve the password for a connection test: prefer the form value;
   * in edit mode with an empty field fall back to the stored vault item
   * (same behavior as saving without a new password).
   */
  const resolveTestPasswordAsync = async (
    password: string,
    accountId?: string,
  ): Promise<string> => {
    if (password) return password;
    if (accountId) {
      const account = accounts.value.find((a) => a.id === accountId);
      if (!account) throw new Error($i18n.t("accounts.errors.accountNotFound"));
      const item = await haexVault.client.passwords.readAsync(
        account.passwordItemId,
      );
      if (item.password) return item.password;
    }
    throw new Error($i18n.t("accounts.errors.passwordMissing"));
  };

  /**
   * Verify the IMAP settings by logging in and listing mailboxes —
   * nothing is persisted. Returns the mailbox count plus the inbox/trash
   * names (by role) so a subsequent SMTP round-trip test can clean up
   * after itself. Throws with the server error on failure.
   */
  const testImapConnectionAsync = async (input: {
    email: string;
    password: string;
    imapHost: string;
    imapPort: number;
    imapSecurity: ConnectionSecurity;
    accountId?: string;
  }) => {
    const password = await resolveTestPasswordAsync(
      input.password,
      input.accountId,
    );
    const imap: ImapConfig = {
      host: input.imapHost,
      port: input.imapPort,
      security: input.imapSecurity,
      username: input.email,
      password,
    };
    const boxes = await haexVault.client.mail.listMailboxesAsync(imap);
    const nameForRole = (role: string) =>
      boxes.find((b) => inferRole(b.name, b.flags) === role)?.name ?? null;
    return {
      mailboxCount: boxes.length,
      inboxName: nameForRole("inbox"),
      trashName: nameForRole("trash"),
    };
  };

  /**
   * Verify the SMTP settings the way Outlook's "Test Account Settings"
   * does: send a test mail to the own address (the SDK offers no
   * AUTH-only SMTP check). A successful send proves SMTP; afterwards we
   * poll the inbox and move the test mail to trash (the SDK has no
   * expunge, so "delete" means trash). Cleanup failures never fail the
   * test — the send already succeeded.
   */
  const testSmtpRoundtripAsync = async (input: {
    email: string;
    password: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecurity: ConnectionSecurity;
    imapHost: string;
    imapPort: number;
    imapSecurity: ConnectionSecurity;
    inboxName: string | null;
    trashName: string | null;
    accountId?: string;
  }): Promise<{ cleanedUp: boolean }> => {
    const password = await resolveTestPasswordAsync(
      input.password,
      input.accountId,
    );
    const smtp: SmtpConfig = {
      host: input.smtpHost,
      port: input.smtpPort,
      security: input.smtpSecurity,
      username: input.email,
      password,
    };

    const token = crypto.randomUUID();
    const sentMessageId = await haexVault.client.mail.sendMessageAsync(smtp, {
      from: { email: input.email },
      to: [{ email: input.email }],
      subject: $i18n.t("accounts.testMail.subject", { token }),
      bodyText: $i18n.t("accounts.testMail.body", { token }),
    });

    if (!input.inboxName) return { cleanedUp: false };

    const imap: ImapConfig = {
      host: input.imapHost,
      port: input.imapPort,
      security: input.imapSecurity,
      username: input.email,
      password,
    };
    // Message-IDs from the envelope carry angle brackets, the send
    // result doesn't — normalize before comparing.
    const bareId = (id?: string) => id?.replace(/^<|>$/g, "") ?? "";

    try {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        const envelopes = await haexVault.client.mail.fetchEnvelopesAsync(
          imap,
          input.inboxName,
          { type: "latest", count: 20 },
        );
        const match = envelopes.find(
          (e) =>
            bareId(e.messageId) === sentMessageId ||
            (e.subject?.includes(token) ?? false),
        );
        if (!match) continue;
        if (input.trashName && input.trashName !== input.inboxName) {
          await haexVault.client.mail.moveMessagesAsync(
            imap,
            input.inboxName,
            input.trashName,
            [match.uid],
          );
        } else {
          await haexVault.client.mail.setFlagsAsync(
            imap,
            input.inboxName,
            [match.uid],
            ["\\Deleted"],
            true,
          );
        }
        return { cleanedUp: true };
      }
    } catch (err) {
      console.warn("[haex-mail] test mail cleanup failed", err);
    }
    return { cleanedUp: false };
  };

  return {
    testImapConnectionAsync,
    testSmtpRoundtripAsync,
  };
};
