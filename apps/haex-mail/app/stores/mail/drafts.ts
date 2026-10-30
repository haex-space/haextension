import type { OutgoingAttachment } from "@haex-space/vault-sdk";
import type { SelectDraft, SelectDraftAttachment, SelectMessage } from "~/database/schemas";
import {
  draftHasContent,
  draftListRow,
  fromDraftRow,
  toDraftRow,
  type DraftFields,
  type DraftRowValues,
} from "../../lib/drafts";

/** Most attachment bytes a draft keeps locally; about what a mail server accepts to send (spec 022). */
export const MAX_DRAFT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type DraftAttachmentValues = SelectDraftAttachment;
export type DraftAttachmentMeta = Omit<SelectDraftAttachment, "data">;

/** The storage the draft store runs on: the vault database, or memory in tests. */
export interface DraftBackend {
  getDraft(id: string): Promise<SelectDraft | null>;
  /** Drafts of these accounts that were not removed. */
  listDrafts(accountIds: string[]): Promise<SelectDraft[]>;
  getAttachments(draftId: string): Promise<DraftAttachmentValues[]>;
  /** The attachments without their bytes, so a save can tell whether the set changed. */
  getAttachmentMeta(draftId: string): Promise<DraftAttachmentMeta[]>;
  attachmentCounts(draftIds: string[]): Promise<Map<string, number>>;
  /** One atomic write: the draft row and, unless `null`, all its attachment rows replaced. */
  saveDraft(row: DraftRowValues, attachments: DraftAttachmentValues[] | null): Promise<void>;
  /** The draft and its attachments, atomically. */
  deleteDraft(id: string): Promise<void>;
  /** Hides a draft whose server copy still has to be deleted. */
  markRemoved(id: string, now: number): Promise<void>;
}

export interface DraftStoreDeps {
  now: () => number;
  newId: () => string;
  /** Called once per draft when attachments beyond the local bound were left out. */
  attachmentsDropped: (count: number) => void;
}

/** Decoded size of a base64 payload. */
const base64Bytes = (data: string) => {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
};

const attachmentRows = (draftId: string, attachments: OutgoingAttachment[]): DraftAttachmentValues[] =>
  attachments.map((a, position) => ({
    id: `${draftId}::${position}`,
    draftId,
    position,
    filename: a.filename,
    contentType: a.contentType,
    contentId: a.contentId ?? null,
    size: base64Bytes(a.data),
    data: a.data,
  }));

const metaKey = (a: DraftAttachmentMeta) =>
  [a.position, a.filename, a.contentType, a.contentId ?? "", a.size].join("\u0000");

const sameAttachmentSet = (stored: DraftAttachmentMeta[], next: DraftAttachmentMeta[]) => {
  if (stored.length !== next.length) return false;
  const sorted = [...stored].sort((a, b) => a.position - b.position);
  return sorted.every((a, i) => metaKey(a) === metaKey(next[i]!));
};

/**
 * The drafts of the compose dialog: written locally a moment after each change, listed with the
 * server's drafts, removed when sent or deleted. The copy in the server's drafts folder is added by
 * the upload (US4); nothing here needs a connection.
 */
export const createDraftStore = (backend: DraftBackend, deps: DraftStoreDeps) => {
  const toldAboutDropped = new Set<string>();

  /** The attachments that fit the local bound, in order; the first one that does not ends the list. */
  const withinBound = (draftId: string, attachments: OutgoingAttachment[]) => {
    const kept: OutgoingAttachment[] = [];
    let total = 0;
    for (const a of attachments) {
      total += base64Bytes(a.data);
      if (total > MAX_DRAFT_ATTACHMENT_BYTES) break;
      kept.push(a);
    }
    const dropped = attachments.length - kept.length;
    if (dropped > 0 && !toldAboutDropped.has(draftId)) {
      toldAboutDropped.add(draftId);
      deps.attachmentsDropped(dropped);
    }
    return kept;
  };

  const removeAsync = async (id: string): Promise<void> => {
    const draft = await backend.getDraft(id);
    if (!draft) return;
    // A copy on the server has to be deleted first, so the row stays, hidden, until that happened.
    if (draft.serverMessageId || draft.previousMessageIdsJson.length > 0) {
      await backend.markRemoved(id, deps.now());
    } else {
      await backend.deleteDraft(id);
    }
    toldAboutDropped.delete(id);
  };

  /**
   * Writes the mail as a draft and returns its id (a new one when `draftId` is null). A mail
   * without content leaves no draft: the row is removed and `null` comes back. `baseline` is the
   * state a reply was opened with.
   */
  const saveAsync = async (
    draftId: string | null,
    fields: DraftFields,
    baseline: DraftFields | null = null,
  ): Promise<string | null> => {
    if (!draftHasContent(fields, baseline)) {
      if (draftId) await removeAsync(draftId);
      return null;
    }
    const id = draftId ?? deps.newId();
    const rows = attachmentRows(id, withinBound(id, fields.attachments));
    const changed = !(draftId && sameAttachmentSet(await backend.getAttachmentMeta(id), rows));
    await backend.saveDraft(toDraftRow(id, fields, deps.now()), changed ? rows : null);
    return id;
  };

  const loadAsync = async (id: string): Promise<DraftFields | null> => {
    const draft = await backend.getDraft(id);
    if (!draft || draft.removedAt !== null) return null;
    return fromDraftRow(draft, await backend.getAttachments(id));
  };

  const listRowsAsync = async (
    accountIds: string[],
    mailboxNameOf: (accountId: string) => string | undefined,
  ): Promise<SelectMessage[]> => {
    if (accountIds.length === 0) return [];
    const drafts = await backend.listDrafts(accountIds);
    const counts = await backend.attachmentCounts(drafts.map((d) => d.id));
    return drafts.map((d) => draftListRow(d, counts.get(d.id) ?? 0, mailboxNameOf(d.accountId) ?? "Drafts"));
  };

  return { saveAsync, loadAsync, listRowsAsync, removeAsync };
};

export type DraftStore = ReturnType<typeof createDraftStore>;
