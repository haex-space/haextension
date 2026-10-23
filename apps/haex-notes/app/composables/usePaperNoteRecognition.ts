import type { ModelJob } from "@haex-space/vault-sdk";
import type { PageDoc } from "~/lib/commands";
import type { Box } from "~/lib/elementEdits";
import { readCloseUpAsync, type CloseUpResult } from "~/lib/paperNotes/closeUp";
import { importPhotoAsync, type ImportDeps, type ImportedPage, type Photo } from "~/lib/paperNotes/importPage";
import { outcomeOf, type PageJobOutcome, type Rotation } from "~/lib/paperNotes/mapResult";
import { cropAsync, makeWorkingCopyAsync } from "~/lib/paperNotes/workingCopy";

/**
 * Liest ein Foto über holzis Modelle (US1 in haex-space/haex-vault@74263d8c6e8e23831e4a5016797c3db4987d8697:specs/046-paper-notes-canvas/spec.md) und baut daraus eine Seite,
 * oder ein Nahfoto, das eine Stelle einer Seite ersetzt (FR-021 in haex-space/haex-vault@e4b28be9d22e8c0839f8652908b35b78e04c9c6e:specs/046-paper-notes-canvas/spec.md).
 * Der Schüler kann jederzeit abbrechen; holzi beendet den Auftrag dann als abgebrochen.
 */
export function usePaperNoteRecognition() {
  const haexVault = useHaexVaultStore();
  const assetStore = useAssetStore();
  const reading = ref(false);
  let controller: AbortController | null = null;

  async function runPageJobAsync(job: ModelJob): Promise<PageJobOutcome> {
    try {
      const completion = await haexVault.client.models.runAsync(job, { signal: controller?.signal });
      return outcomeOf({ completion });
    } catch (rejection) {
      return outcomeOf({ rejection });
    }
  }

  const depsFor = (bitmap: ImageBitmap): ImportDeps => ({
    putAsset: (bytes, mimeType, fileName) => assetStore.putAsync(bytes, mimeType, fileName),
    makeWorkingCopy: async (rotation: Rotation) => {
      const copy = await makeWorkingCopyAsync(bitmap, rotation);
      return { ...copy, crop: (box) => cropAsync(copy, box) };
    },
    runJob: runPageJobAsync,
    newId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });

  async function whileReadingAsync<T>(read: () => Promise<T>): Promise<T> {
    controller = new AbortController();
    reading.value = true;
    try {
      return await read();
    } finally {
      reading.value = false;
      controller = null;
    }
  }

  const readAsync = (photo: Photo, bitmap: ImageBitmap, page: { width: number; height: number }, fontFamily: string): Promise<ImportedPage> =>
    whileReadingAsync(() => importPhotoAsync(photo, page, fontFamily, depsFor(bitmap)));

  const readCloseUp = (photo: Photo, bitmap: ImageBitmap, page: PageDoc, box: Box, fontFamily: string): Promise<CloseUpResult> =>
    whileReadingAsync(() => readCloseUpAsync(photo, box, page, fontFamily, depsFor(bitmap)));

  const cancel = () => controller?.abort();

  return { reading: readonly(reading), readAsync, readCloseUpAsync: readCloseUp, cancel };
}
