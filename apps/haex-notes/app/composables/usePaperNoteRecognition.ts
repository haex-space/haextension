import type { ModelJob } from "@haex-space/vault-sdk";
import { importPhotoAsync, type ImportedPage, type Photo } from "~/lib/paperNotes/importPage";
import { outcomeOf, type PageJobOutcome, type Rotation } from "~/lib/paperNotes/mapResult";
import { cropAsync, makeWorkingCopyAsync } from "~/lib/paperNotes/workingCopy";

/**
 * Liest ein Foto über holzis Modelle (holzi Spec 046, US1) und baut daraus eine Seite. Der Schüler
 * kann jederzeit abbrechen; holzi beendet den Auftrag dann als abgebrochen.
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

  async function readAsync(
    photo: Photo,
    bitmap: ImageBitmap,
    page: { width: number; height: number },
    fontFamily: string,
  ): Promise<ImportedPage> {
    controller = new AbortController();
    reading.value = true;
    try {
      return await importPhotoAsync(photo, page, fontFamily, {
        putAsset: (bytes, mimeType, fileName) => assetStore.putAsync(bytes, mimeType, fileName),
        makeWorkingCopy: async (rotation: Rotation) => {
          const copy = await makeWorkingCopyAsync(bitmap, rotation);
          return { ...copy, crop: (box) => cropAsync(copy, box) };
        },
        runJob: runPageJobAsync,
        newId: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
      });
    } finally {
      reading.value = false;
      controller = null;
    }
  }

  const cancel = () => controller?.abort();

  return { reading: readonly(reading), readAsync, cancel };
}
