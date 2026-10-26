import type { PageAttachment } from "~/types/document";
import { clonePlain } from "./clone";
import type { Command, PageDoc } from "./commands";

/**
 * Anhänge einer Seite (FR-022 bis FR-024 in haex-space/haex-vault@84de4f4c46aae5852b1d8f817569d874cab63dc7:specs/046-paper-notes-canvas/spec.md):
 * Dateien, die an der Seite hängen und nicht auf ihr liegen. Das Original eines Fotos ist der Anhang der Art
 * `original` und gegen Entfernen geschützt; es geht nur mit der Seite.
 */

/** Der Anhang der Art „Original“, falls die Seite einen hat. */
export function originalAttachment(attachments: readonly PageAttachment[] | undefined): PageAttachment | null {
  return attachments?.find((attachment) => attachment.kind === "original") ?? null;
}

/** Ob der Anhang entfernt werden darf: nur Dateien, die der Schüler selbst angehängt hat. */
export const isRemovable = (attachment: PageAttachment) => attachment.kind === "file";

/** Hängt eine Datei an die Seite. */
export function addAttachment(page: PageDoc, attachment: PageAttachment, label: string): Command {
  const added = clonePlain(attachment);
  let before: PageAttachment[] | undefined | null = null;
  return {
    label,
    pageId: page.id,
    apply() {
      if (before === null) before = page.attachments ? clonePlain(page.attachments) : undefined;
      page.attachments = [...(page.attachments ?? []), clonePlain(added)];
    },
    revert() {
      if (before === null) return;
      if (before) page.attachments = clonePlain(before);
      else delete page.attachments;
    },
  };
}

/**
 * Entfernt eine Datei von der Seite. `null`, wenn es den Anhang nicht gibt oder er das Original ist;
 * die Datei selbst bleibt im Asset-Speicher, weil ein Rückgängig sie wieder braucht.
 */
export function removeAttachment(page: PageDoc, attachmentId: string, label: string): Command | null {
  const target = page.attachments?.find((attachment) => attachment.id === attachmentId);
  if (!target || !isRemovable(target)) return null;
  let before: PageAttachment[] | null = null;
  return {
    label,
    pageId: page.id,
    apply() {
      before ??= clonePlain(page.attachments ?? []);
      const rest = (page.attachments ?? []).filter((attachment) => attachment.id !== attachmentId);
      if (rest.length) page.attachments = rest;
      else delete page.attachments;
    },
    revert() {
      if (before) page.attachments = clonePlain(before);
    },
  };
}
