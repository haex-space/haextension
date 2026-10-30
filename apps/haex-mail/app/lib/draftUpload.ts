import { MAX_MOVE_ATTEMPTS } from "./pendingMoves";

/** The columns of a draft row the upload planning looks at. */
export interface DraftDueRow {
  id: string;
  uploadDueAt: number | null;
  removedAt: number | null;
  previousMessageIds: string[];
  attempts: number;
  nextAttemptAt: number;
}

/** A draft has server work when its text is not up to date there, it was removed, or an old copy is left. */
const hasWork = (row: DraftDueRow) =>
  row.uploadDueAt !== null || row.removedAt !== null || row.previousMessageIds.length > 0;

/** A removal does not wait for the pause in typing; an upload does. */
const dueAt = (row: DraftDueRow) =>
  row.removedAt !== null ? row.nextAttemptAt : Math.max(row.uploadDueAt ?? 0, row.nextAttemptAt);

const waiting = (row: DraftDueRow) => hasWork(row) && row.attempts < MAX_MOVE_ATTEMPTS;

/**
 * Ids of the drafts to bring to the server now, longest overdue first. `force` skips the waiting
 * times (closing the dialog, the connection coming back) but not the limit of failed tries: a draft
 * that gave up waits for its next change.
 */
export const dueDrafts = (rows: DraftDueRow[], now: number, force: boolean): string[] =>
  rows
    .filter((row) => waiting(row) && (force || now >= dueAt(row)))
    .sort((a, b) => dueAt(a) - dueAt(b) || a.id.localeCompare(b.id))
    .map((row) => row.id);

/** When the flush should run next, or `null` when no draft is waiting. */
export const nextDueAt = (rows: DraftDueRow[]): number | null => {
  const times = rows.filter(waiting).map(dueAt);
  return times.length ? Math.min(...times) : null;
};

/** The Message-ID of a draft's copy; `.invalid` never resolves, so it cannot clash with a real one. */
export const draftMessageId = (uuid: string): string => `draft-${uuid}@haex-mail.invalid`;

export const normalizeMessageId = (id: string | null | undefined): string => (id ?? "").trim().replace(/^<|>$/g, "");

export const sameMessageId = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const left = normalizeMessageId(a);
  return left !== "" && left === normalizeMessageId(b);
};

// Bytes travel as a binary string (one char per byte), so everything but the header stays as it was.
const decode = (base64: string): string => atob(base64);
const encode = (binary: string): string => btoa(binary);

const splitHeaders = (message: string): { head: string; rest: string; eol: string } => {
  const crlf = message.indexOf("\r\n\r\n");
  const lf = message.indexOf("\n\n");
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { head: message.slice(0, crlf), rest: message.slice(crlf), eol: "\r\n" };
  if (lf !== -1) return { head: message.slice(0, lf), rest: message.slice(lf), eol: "\n" };
  return { head: message, rest: "", eol: message.includes("\r\n") ? "\r\n" : "\n" };
};

/** The header lines of a block, each with its folded continuation lines. */
const headerFields = (head: string, eol: string): string[] => {
  const fields: string[] = [];
  for (const line of head.split(eol)) {
    if (/^[ \t]/.test(line) && fields.length) fields[fields.length - 1] += eol + line;
    else if (line !== "") fields.push(line);
  }
  return fields;
};

/**
 * The same message with `Message-ID: <id>` as its first header. Any other Message-ID header, folded
 * lines included, is removed. The host chooses its own Message-ID, and the SDK offers no way to set one.
 */
export const withMessageId = (rfc822Base64: string, id: string): string => {
  const { head, rest, eol } = splitHeaders(decode(rfc822Base64));
  const kept = headerFields(head, eol).filter((field) => !/^message-id[ \t]*:/i.test(field));
  return encode([`Message-ID: <${normalizeMessageId(id)}>`, ...kept].join(eol) + rest);
};

/** The Message-ID header of a message, without angle brackets, or `null` when it has none. */
export const messageIdOf = (rfc822Base64: string): string | null => {
  const { head, eol } = splitHeaders(decode(rfc822Base64));
  const field = headerFields(head, eol).find((f) => /^message-id[ \t]*:/i.test(f));
  if (!field) return null;
  const value = normalizeMessageId(field.slice(field.indexOf(":") + 1).replace(/\s+/g, ""));
  return value || null;
};
