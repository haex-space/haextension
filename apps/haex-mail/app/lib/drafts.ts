import type { OutgoingAttachment } from "@haex-space/vault-sdk";
import type { InsertDraft, SelectDraft, SelectDraftAttachment, SelectMessage } from "~/database/schemas";
import { parseAddressList } from "./address";
import { bodyToText } from "./composeBody";

/** Pause in typing after which a draft is copied to the server (spec 022, FR-007). */
export const UPLOAD_PAUSE_MS = 30_000;

/** Prefix of the id of a draft's row in the message list; real ids are `account::mailbox::uid`. */
const LIST_ID_PREFIX = "draft::";

/** What the compose dialog holds: address lists as typed, the editor HTML of the body. */
export interface DraftFields {
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  inReplyTo?: string;
  references: string[];
  attachments: OutgoingAttachment[];
}

export type DraftRowValues = Pick<
  InsertDraft,
  | "id"
  | "accountId"
  | "toText"
  | "ccText"
  | "bccText"
  | "subject"
  | "bodyHtml"
  | "inReplyTo"
  | "referencesJson"
  | "editedAt"
  | "uploadDueAt"
  | "attempts"
  | "nextAttemptAt"
>;

const blank = (value: string) => value.trim() === "";

const sameFields = (a: DraftFields, b: DraftFields) =>
  a.to === b.to &&
  a.cc === b.cc &&
  a.bcc === b.bcc &&
  a.subject === b.subject &&
  // The editor rewrites its HTML; the text is what the person sees.
  bodyToText(a.bodyHtml) === bodyToText(b.bodyHtml) &&
  a.attachments.length === b.attachments.length &&
  a.attachments.every((att, i) => att.data === b.attachments[i]!.data);

/**
 * Whether a mail is worth keeping: any recipient, subject, text or attachment. `baseline` is the
 * state the dialog opened with (a reply and its quote); a mail still equal to it was not touched.
 * A mail link passes no baseline, because its fields are content from the start.
 */
export const draftHasContent = (fields: DraftFields, baseline: DraftFields | null): boolean => {
  const empty =
    blank(fields.to) &&
    blank(fields.cc) &&
    blank(fields.bcc) &&
    blank(fields.subject) &&
    blank(bodyToText(fields.bodyHtml)) &&
    fields.attachments.length === 0;
  if (empty) return false;
  return !(baseline && sameFields(fields, baseline));
};

/** The columns a save writes; the upload state of a changed draft starts over. */
export const toDraftRow = (id: string, fields: DraftFields, now: number): DraftRowValues => ({
  id,
  accountId: fields.accountId,
  toText: fields.to,
  ccText: fields.cc,
  bccText: fields.bcc,
  subject: fields.subject,
  bodyHtml: fields.bodyHtml,
  inReplyTo: fields.inReplyTo ?? null,
  referencesJson: fields.references,
  editedAt: now,
  uploadDueAt: now + UPLOAD_PAUSE_MS,
  attempts: 0,
  nextAttemptAt: 0,
});

export const fromDraftRow = (
  row: SelectDraft,
  attachments: SelectDraftAttachment[],
): DraftFields => ({
  accountId: row.accountId,
  to: row.toText,
  cc: row.ccText,
  bcc: row.bccText,
  subject: row.subject,
  bodyHtml: row.bodyHtml,
  inReplyTo: row.inReplyTo ?? undefined,
  references: row.referencesJson,
  attachments: [...attachments]
    .sort((a, b) => a.position - b.position)
    .map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      data: a.data,
      ...(a.contentId ? { contentId: a.contentId } : {}),
    })),
});

export const isDraftRowId = (id: string): boolean => id.startsWith(LIST_ID_PREFIX);

export const draftIdOfRow = (rowId: string): string => rowId.slice(LIST_ID_PREFIX.length);

/** A draft as a row of the message list, so list, sort and search need nothing new. */
export const draftListRow = (
  row: SelectDraft,
  attachmentCount: number,
  draftsMailboxName: string,
): SelectMessage => ({
  id: LIST_ID_PREFIX + row.id,
  accountId: row.accountId,
  mailboxName: draftsMailboxName,
  uid: 0,
  threadKey: null,
  flags: ["\\Draft", "\\Seen"],
  // The list holds seconds, a draft's time is in milliseconds.
  internalDate: Math.floor(row.editedAt / 1000),
  subject: row.subject,
  fromJson: [],
  toJson: parseAddressList(row.toText).addresses,
  ccJson: parseAddressList(row.ccText).addresses,
  messageId: row.serverMessageId,
  inReplyTo: row.inReplyTo,
  references: row.referencesJson,
  size: null,
  hasAttachments: attachmentCount > 0,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * The server's drafts folder and the local drafts as one list, newest first. A server message that
 * is the copy of a local draft is dropped, so each draft appears once.
 */
export const mergeDraftRows = (serverRows: SelectMessage[], local: SelectMessage[]): SelectMessage[] => {
  const copies = new Set(local.map((row) => row.messageId).filter((id): id is string => !!id));
  return [...local, ...serverRows.filter((row) => !row.messageId || !copies.has(row.messageId))].sort(
    (a, b) => (b.internalDate ?? 0) - (a.internalDate ?? 0),
  );
};
