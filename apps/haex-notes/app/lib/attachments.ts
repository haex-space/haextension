import type { PageAttachment, PaperNoteImport } from "~/types/document";
import { clonePlain } from "./clone";
import type { Command, PageDoc } from "./commands";

/**
 * Anhänge einer Seite (FR-022 bis FR-024 in haex-space/haex-vault@84de4f4c46aae5852b1d8f817569d874cab63dc7:specs/046-paper-notes-canvas/spec.md):
 * Dateien, die an der Seite hängen und nicht auf ihr liegen. Das Original eines Fotos ist der Anhang der Art
 * `original`. Wer es entfernt, löst die Seite vom Foto: `paperImport` geht mit, die Seite ist danach eine
 * gewöhnliche Seite (ohne Nahfoto-Lesen), und ein Rückgängig stellt beides wieder her.
 */

/** Der Anhang der Art „Original“, falls die Seite einen hat. */
export function originalAttachment(attachments: readonly PageAttachment[] | undefined): PageAttachment | null {
  return attachments?.find((attachment) => attachment.kind === "original") ?? null;
}

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
 * Entfernt einen Anhang von der Seite. `null`, wenn die Seite ihn nicht hat. Beim Original geht die Herkunft
 * `paperImport` mit; sonst legte das Laden der Seite den Anhang aus ihr wieder an. Die Datei selbst bleibt im
 * Asset-Speicher, weil ein Rückgängig sie wieder braucht.
 */
export function removeAttachment(page: PageDoc, attachmentId: string, label: string): Command | null {
  const target = page.attachments?.find((attachment) => attachment.id === attachmentId);
  if (!target) return null;
  let before: { attachments: PageAttachment[]; paperImport: PaperNoteImport | undefined } | null = null;
  return {
    label,
    pageId: page.id,
    apply() {
      before ??= {
        attachments: clonePlain(page.attachments ?? []),
        paperImport: page.paperImport ? clonePlain(page.paperImport) : undefined,
      };
      const rest = (page.attachments ?? []).filter((attachment) => attachment.id !== attachmentId);
      if (rest.length) page.attachments = rest;
      else delete page.attachments;
      if (target.kind === "original") delete page.paperImport;
    },
    revert() {
      if (!before) return;
      page.attachments = clonePlain(before.attachments);
      if (before.paperImport) page.paperImport = clonePlain(before.paperImport);
    },
  };
}
