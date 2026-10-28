import { MAX_FILE_BYTES } from '~/lib/pictureBudget'
import type { AddResult, Rejection } from '~/types/puzzle'

const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']

/** Texts for the host's file dialog, given by the caller because only components carry the translations. */
export interface ImportLabels {
  title: string
  images: string
}

type Picked =
  | { name: string; read: () => Promise<Uint8Array> }
  | { name: string; rejected: Rejection }

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

/** A plain file input, for development in a browser tab where the host's file selection does not exist. */
function pickWithInput(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = EXTENSIONS.map(ext => `.${ext}`).join(',')
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

/** Adds pictures from the device to the library: the host's file selection, then `library.add`. */
export function usePictureImport() {
  const library = useLibraryStore()
  const adding = ref(false)

  async function pickFromHost(labels: ImportLabels): Promise<Picked[]> {
    const vault = useHaexVaultStore()
    await vault.initializeAsync()
    const fs = vault.client.filesystem
    const paths = await fs.selectFile({
      title: labels.title,
      filters: [[labels.images, EXTENSIONS]],
      multiple: true,
    })
    if (!paths || paths.length === 0) return []

    const picked: Picked[] = []
    for (const path of paths) {
      const name = fileName(path)
      try {
        // Looked up first: reading a far larger file only to refuse it could exhaust a phone's memory.
        const { size } = await fs.stat(path)
        if (size > MAX_FILE_BYTES) {
          picked.push({ name, rejected: 'too-large' })
          continue
        }
        // Keep the path, not all selected image bytes, until this file is processed.
        picked.push({ name, read: () => fs.readFile(path) })
      } catch (error) {
        console.error('[haex-puzzle] Could not read', name, error)
        picked.push({ name, rejected: 'read-failed' })
      }
    }
    return picked
  }

  async function pickFromBrowser(): Promise<Picked[]> {
    const files = await pickWithInput()
    return files.map((file): Picked => (
      file.size > MAX_FILE_BYTES
        ? { name: file.name, rejected: 'too-large' }
        : { name: file.name, read: async () => new Uint8Array(await file.arrayBuffer()) }
    ))
  }

  /** The result of every picked file, in order; an empty list when the selection was cancelled. */
  async function addPictures(labels: ImportLabels): Promise<AddResult[]> {
    adding.value = true
    try {
      const picked = useStandalone() ? await pickFromBrowser() : await pickFromHost(labels)
      const results: AddResult[] = []
      for (const file of picked) {
        if ('rejected' in file) {
          results.push({ ok: false, name: file.name, reason: file.rejected })
          continue
        }

        let bytes: Uint8Array
        try {
          bytes = await file.read()
        } catch (error) {
          console.error('[haex-puzzle] Could not read', file.name, error)
          results.push({ ok: false, name: file.name, reason: 'read-failed' })
          continue
        }

        results.push(...await library.add([{ name: file.name, bytes }]))
      }
      return results
    } finally {
      adding.value = false
    }
  }

  return { addPictures, adding }
}
