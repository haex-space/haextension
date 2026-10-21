import type { ToolHandlers } from "./context";
import { createAccountTools, type AccountToolDeps } from "./accounts";
import { createDeleteMessagesTools, type DeleteMessagesDeps } from "./deleteMessages";
import { createDraftTools, type DraftToolDeps } from "./drafts";
import { createMailboxTools, type MailboxToolDeps } from "./mailboxes";
import { createMessageTools, type FindMessagesDeps } from "./messages";
import { createMessageChangeTools, type MessageChangeDeps } from "./messageChanges";
import { createReadMessageTools, type ReadMessageDeps } from "./readMessage";
import { createRuleTools, type RuleToolDeps } from "./rules";
import { createSendMailTools, type SendMailDeps } from "./sendMail";

/** Everything the tools need from the stores; each tool file names the part it uses. */
export type ToolDeps = RuleToolDeps &
  AccountToolDeps &
  MailboxToolDeps &
  ReadMessageDeps &
  MessageChangeDeps &
  DraftToolDeps &
  FindMessagesDeps &
  SendMailDeps &
  DeleteMessagesDeps;

/**
 * The handlers of every tool haex-mail offers the agent, by the name the manifest declares them
 * under (`haextension/manifest.json`, `tools`). `manifest.test.ts` keeps both lists equal.
 */
export const createTools = (deps: () => Promise<ToolDeps>): ToolHandlers => ({
  ...createAccountTools(deps),
  ...createDeleteMessagesTools(deps),
  ...createDraftTools(deps),
  ...createMailboxTools(deps),
  ...createMessageChangeTools(deps),
  ...createMessageTools(deps),
  ...createReadMessageTools(deps),
  ...createRuleTools(deps),
  ...createSendMailTools(deps),
});
