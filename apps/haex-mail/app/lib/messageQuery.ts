import type { MailSearchCriteria, MessageEnvelope } from "@haex-space/vault-sdk";

/**
 * What `find_messages` asks and how it pages: pure checks and merging, no server. The tool reads
 * the input here, searches per account and mailbox, and hands the envelopes back to `mergePage`.
 * Relative imports only, so the tests need no alias.
 */

/** A problem with the input, worded for the agent. */
const toolError = (message: string): Error => new Error(message);

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 50;
/** The newest hits a sorted (or attachment-filtered) search looks at per mailbox. */
export const SORT_WINDOW = 200;
/** The most hits the host answers with; paging and oldest-first reach no further. */
export const MAX_HITS = 1000;
/** A search needs one criterion; "all mail" is "since the earliest date the host accepts". */
const SINCE_ALWAYS = "1900-01-01";

export type SortKey = "date" | "sender" | "subject";

export interface FindQuery {
  account?: string;
  mailbox: string;
  criteria: MailSearchCriteria;
  hasAttachment?: boolean;
  sort: SortKey;
  descending: boolean;
  limit: number;
  offset: number;
}

const text = (input: Record<string, unknown>, key: string): string | undefined => {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw toolError(`${key} must be text`);
  return value.trim() || undefined;
};

const flag = (input: Record<string, unknown>, key: string): boolean | undefined => {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw toolError(`${key} must be true or false`);
  return value;
};

const whole = (input: Record<string, unknown>, key: string): number | undefined => {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw toolError(`${key} must be a whole number of 0 or more`);
  }
  return value;
};

const date = (input: Record<string, unknown>, key: string): string | undefined => {
  const value = text(input, key);
  if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw toolError(`${key} must be YYYY-MM-DD`);
  }
  return value;
};

/** Reads and checks the input of `find_messages`. */
export const parseFindQuery = (input: Record<string, unknown>): FindQuery => {
  const criteria: MailSearchCriteria = {};
  for (const key of ["text", "from", "to", "subject"] as const) {
    const value = text(input, key);
    if (value !== undefined) criteria[key] = value;
  }
  const since = date(input, "since");
  const before = date(input, "before");
  if (since) criteria.since = since;
  if (before) criteria.before = before;
  const unread = flag(input, "unread");
  if (unread !== undefined) criteria.unseen = unread;
  const flagged = flag(input, "flagged");
  if (flagged !== undefined) criteria.flagged = flagged;
  if (Object.keys(criteria).length === 0) criteria.since = SINCE_ALWAYS;

  const sort = text(input, "sort") ?? "date";
  if (sort !== "date" && sort !== "sender" && sort !== "subject") {
    throw toolError("sort is date, sender or subject");
  }
  const limit = whole(input, "limit") ?? DEFAULT_LIMIT;
  if (limit < 1 || limit > MAX_LIMIT) throw toolError(`limit is 1 to ${MAX_LIMIT}`);
  return {
    account: text(input, "account"),
    mailbox: text(input, "mailbox") ?? "inbox",
    criteria,
    hasAttachment: flag(input, "hasAttachment"),
    sort,
    descending: flag(input, "descending") ?? true,
    limit,
    offset: whole(input, "offset") ?? 0,
  };
};

/**
 * How one mailbox is searched for a query. `page`: the newest `offset + limit` hits are enough.
 * `oldest`: the oldest hits come last on the server, so all (up to `MAX_HITS`) are fetched.
 * `window`: sorting by sender or subject, or keeping only mails with attachments, needs the
 * envelopes themselves, so the newest `SORT_WINDOW` hits are looked at.
 */
export type SearchPlan =
  | { mode: "page"; hostLimit: number }
  | { mode: "oldest"; hostLimit: number }
  | { mode: "window"; hostLimit: number };

export const planSearch = (query: FindQuery): SearchPlan => {
  if (query.sort !== "date" || query.hasAttachment !== undefined) {
    return { mode: "window", hostLimit: SORT_WINDOW };
  }
  if (!query.descending) return { mode: "oldest", hostLimit: MAX_HITS };
  if (query.offset + query.limit > MAX_HITS) {
    throw toolError(`offset plus limit is at most ${MAX_HITS}; narrow the search instead`);
  }
  return { mode: "page", hostLimit: query.offset + query.limit };
};

/** The UIDs of a search answer (newest first) whose envelopes the plan needs. */
export const uidsToFetch = (plan: SearchPlan, uidsNewestFirst: number[], query: FindQuery): number[] => {
  if (plan.mode !== "oldest") return uidsNewestFirst;
  return [...uidsNewestFirst].reverse().slice(0, query.offset + query.limit);
};

export interface Candidate {
  accountId: string;
  mailboxName: string;
  envelope: MessageEnvelope;
}

const senderKey = (c: Candidate): string => {
  const from = c.envelope.from[0];
  return (from?.name || from?.email || "").toLocaleLowerCase();
};

const sortKey = (sort: SortKey, c: Candidate): string | number => {
  if (sort === "sender") return senderKey(c);
  if (sort === "subject") return (c.envelope.subject ?? "").toLocaleLowerCase();
  return c.envelope.internalDate ?? 0;
};

/** The candidates of every source in the order asked for, cut to the page. */
export const mergePage = (candidates: Candidate[], query: FindQuery): Candidate[] => {
  const direction = query.descending ? -1 : 1;
  const sorted = [...candidates].sort((a, b) => {
    const ka = sortKey(query.sort, a);
    const kb = sortKey(query.sort, b);
    const order = ka < kb ? -1 : ka > kb ? 1 : 0;
    return order * direction || b.envelope.uid - a.envelope.uid;
  });
  return sorted.slice(query.offset, query.offset + query.limit);
};

export const hasNonAscii = (criteria: MailSearchCriteria): boolean =>
  [criteria.text, criteria.from, criteria.to, criteria.subject].some(
    (t) => t !== undefined && /[\u0080-\uffff]/.test(t),
  );

const lower = (value: string) => value.toLocaleLowerCase();

const addressText = (list: { name?: string; email: string }[]) =>
  lower(list.map((a) => `${a.name ?? ""} ${a.email}`).join(" "));

/** The day of a `YYYY-MM-DD` as Unix seconds at 00:00 UTC. */
const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;

/**
 * The local stand-in for a server search that refused non-ASCII text: whether an envelope meets the
 * criteria, looking only at what an envelope has (sender, recipients, subject, date, flags).
 */
export const matchesLocally = (envelope: MessageEnvelope, criteria: MailSearchCriteria): boolean => {
  const subject = lower(envelope.subject ?? "");
  const from = addressText(envelope.from);
  const to = addressText([...envelope.to, ...envelope.cc]);
  if (criteria.subject && !subject.includes(lower(criteria.subject))) return false;
  if (criteria.from && !from.includes(lower(criteria.from))) return false;
  if (criteria.to && !to.includes(lower(criteria.to))) return false;
  if (criteria.text) {
    const wanted = lower(criteria.text);
    if (![subject, from, to].some((part) => part.includes(wanted))) return false;
  }
  const date = envelope.internalDate;
  if (criteria.since && (date === undefined || date < dayStart(criteria.since))) return false;
  if (criteria.before && (date === undefined || date >= dayStart(criteria.before))) return false;
  const flags = envelope.flags.map(lower);
  const seen = flags.some((f) => f.includes("seen"));
  if (criteria.unseen !== undefined && criteria.unseen === seen) return false;
  const flagged = flags.some((f) => f.includes("flagged"));
  if (criteria.flagged !== undefined && criteria.flagged !== flagged) return false;
  return true;
};
