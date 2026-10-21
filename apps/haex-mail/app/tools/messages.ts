import type {
  ImapConfig,
  MailFetchRange,
  MailSearchCriteria,
  MailSearchResult,
  MessageEnvelope,
} from "@haex-space/vault-sdk";
import { formatAddressList } from "../lib/address";
import { decodeMailboxName } from "../lib/imap";
import {
  hasNonAscii,
  matchesLocally,
  mergePage,
  parseFindQuery,
  planSearch,
  uidsToFetch,
  type Candidate,
  type FindQuery,
} from "../lib/messageQuery";
import {
  connectionOf,
  errorText,
  findAccount,
  formatMessageId,
  resolveMailbox,
  toolError,
  type AccountsPort,
  type ToolHandlers,
} from "./context";
import type { CachedMailbox } from "./mailboxes";

/** The newest mails looked at when the server refused a search and the envelopes are filtered here. */
const LOCAL_FALLBACK_MAILS = 1000;

export interface FindMessagesDeps {
  accounts: AccountsPort;
  mailClient: {
    searchMessagesAsync(
      imap: ImapConfig,
      mailbox: string,
      criteria: MailSearchCriteria,
      limit?: number,
    ): Promise<MailSearchResult>;
    fetchEnvelopesAsync(
      imap: ImapConfig,
      mailbox: string,
      range: MailFetchRange,
    ): Promise<MessageEnvelope[]>;
  };
  cachedMailboxes(accountId: string): Promise<CachedMailbox[]>;
}

/** What one mailbox of one account contributes to a page. */
interface Found {
  candidates: Candidate[];
  /** The hits that count towards `total`. */
  total: number;
  /** More hits exist than the search looked at. */
  limited: boolean;
  fallback: boolean;
}

const sourceOf = async (
  deps: FindMessagesDeps,
  query: FindQuery,
  account: { id: string },
  imap: ImapConfig,
  mailboxName: string,
): Promise<Found> => {
  const { mailClient } = deps;
  const plan = planSearch(query);
  const keep = (e: MessageEnvelope) =>
    query.hasAttachment === undefined || e.hasAttachments === query.hasAttachment;
  const asCandidates = (envelopes: MessageEnvelope[]): Candidate[] =>
    envelopes.map((envelope) => ({ accountId: account.id, mailboxName, envelope }));
  const fetchEnvelopes = async (uids: number[]) =>
    uids.length === 0
      ? []
      : mailClient.fetchEnvelopesAsync(imap, mailboxName, { type: "uidList", uids });

  try {
    const found = await mailClient.searchMessagesAsync(imap, mailboxName, query.criteria, plan.hostLimit);
    const envelopes = (await fetchEnvelopes(uidsToFetch(plan, found.uids, query))).filter(keep);
    return {
      candidates: asCandidates(envelopes),
      total: plan.mode === "window" ? envelopes.length : found.total,
      limited: plan.mode !== "page" && found.total > plan.hostLimit,
      fallback: false,
    };
  } catch (err) {
    // A server that does not take UTF-8 search text answers with an error; the newest envelopes
    // are filtered here instead, and the answer says so.
    if (!hasNonAscii(query.criteria)) throw err;
    const latest = await mailClient.fetchEnvelopesAsync(imap, mailboxName, {
      type: "latest",
      count: LOCAL_FALLBACK_MAILS,
    });
    const matches = latest.filter((e) => matchesLocally(e, query.criteria) && keep(e));
    return { candidates: asCandidates(matches), total: matches.length, limited: false, fallback: true };
  }
};

const summary = ({ accountId, mailboxName, envelope }: Candidate) => {
  const flags = envelope.flags.map((f) => f.toLowerCase());
  return {
    id: formatMessageId(accountId, mailboxName, envelope.uid),
    account: accountId,
    mailbox: decodeMailboxName(mailboxName),
    from: formatAddressList(envelope.from),
    to: formatAddressList(envelope.to),
    subject: envelope.subject ?? "",
    date: envelope.internalDate ? new Date(envelope.internalDate * 1000).toISOString() : null,
    unread: !flags.some((f) => f.includes("seen")),
    flagged: flags.some((f) => f.includes("flagged")),
    hasAttachment: envelope.hasAttachments,
  };
};

/**
 * `find_messages`: the mails of one or every account that meet the filters, searched on the server
 * (so mails outside the loaded list are found), one page at a time. Reads only: no flag changes.
 */
export const createMessageTools = (deps: () => Promise<FindMessagesDeps>): ToolHandlers => ({
  find_messages: async (input) => {
    const all = await deps();
    const query = parseFindQuery(input);
    const plan = planSearch(query);
    const accountRows = query.account ? [findAccount(all.accounts.accounts, query.account)] : all.accounts.accounts;

    // A mailbox name an account lacks skips that account, unless the caller named the account.
    const sources: { account: { id: string }; mailboxName: string }[] = [];
    for (const account of accountRows) {
      const mailboxName = resolveMailbox(await all.cachedMailboxes(account.id), query.mailbox);
      if (mailboxName) sources.push({ account, mailboxName });
      else if (query.account) throw toolError(`this account has no mailbox or role "${query.mailbox}"`);
    }
    if (sources.length === 0) throw toolError(`no account has a mailbox or role "${query.mailbox}"`);

    const errors: { account: string; error: string }[] = [];
    const founds = (
      await Promise.all(
        sources.map(async ({ account, mailboxName }) => {
          try {
            const { imap } = await connectionOf(all.accounts, account.id);
            return await sourceOf(all, query, account, imap, mailboxName);
          } catch (err) {
            errors.push({ account: account.id, error: errorText(err) });
            return null;
          }
        }),
      )
    ).filter((f): f is Found => f !== null);
    if (founds.length === 0) throw toolError(errors[0]!.error);

    const total = founds.reduce((sum, f) => sum + f.total, 0);
    const page = mergePage(
      founds.flatMap((f) => f.candidates),
      query,
    );
    return {
      messages: page.map(summary),
      total,
      hasMore: total > query.offset + query.limit,
      ...(founds.some((f) => f.limited) ? { window: plan.hostLimit } : {}),
      ...(founds.some((f) => f.fallback)
        ? {
            fallback: "local",
            note: "the server refused this search text; only sender, recipients and subject of the newest 1000 mails were checked",
          }
        : {}),
      ...(errors.length > 0 ? { errors } : {}),
    };
  },
});
