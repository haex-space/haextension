import type { AddResult, LibraryItem, Rejection } from '~/types/puzzle'
import { contentHash, type OpenedPicture, type PictureRecord } from './pictureRows'

/** What a backend (the vault's SQL, or memory) must do; see contracts/library-store.md. */
export interface LibraryBackend {
  /** Newest first; items never carry the picture itself. */
  list(): Promise<LibraryItem[]>
  find(id: string): Promise<LibraryItem | null>
  /** False when a picture with this id is already stored and nothing was written. */
  insert(record: PictureRecord): Promise<boolean>
  read(id: string): Promise<OpenedPicture | null>
  /** All or nothing. */
  remove(ids: readonly string[]): Promise<void>
}

export interface Encoded {
  data: Uint8Array
  mimeType: string
  width: number
  height: number
  thumbnail: Uint8Array
}

export type EncodeResult = ({ ok: true } & Encoded) | { ok: false; reason: Rejection }
export type Encode = (bytes: Uint8Array, name: string) => Promise<EncodeResult>

export interface LibraryFile {
  name: string
  bytes: Uint8Array
}

export interface Library {
  list(): Promise<LibraryItem[]>
  add(files: readonly LibraryFile[]): Promise<AddResult[]>
  open(id: string): Promise<OpenedPicture>
  remove(ids: readonly string[]): Promise<void>
}

/** The library's behaviour, independent of where the pictures are kept. */
export function createLibrary(backend: LibraryBackend, encode: Encode, now: () => string = () => new Date().toISOString()): Library {
  async function addOne(file: LibraryFile): Promise<AddResult> {
    const fail = (reason: Rejection): AddResult => ({ ok: false, name: file.name, reason })
    try {
      const id = await contentHash(file.bytes)
      const existing = await backend.find(id)
      if (existing) return { ok: true, item: existing, duplicate: true }

      const encoded = await encode(file.bytes, file.name)
      if (!encoded.ok) return fail(encoded.reason)

      const record: PictureRecord = {
        id,
        name: file.name,
        width: encoded.width,
        height: encoded.height,
        mimeType: encoded.mimeType,
        data: encoded.data,
        thumbnail: encoded.thumbnail,
        addedAt: now(),
      }
      const inserted = await backend.insert(record)
      if (!inserted) {
        // Another device added the same file in between; its row stands.
        const winner = await backend.find(id)
        if (winner) return { ok: true, item: winner, duplicate: true }
        return fail('storage-failed')
      }
      const item: LibraryItem = { id, name: record.name, width: record.width, height: record.height, addedAt: record.addedAt, thumbnail: record.thumbnail }
      return { ok: true, item, duplicate: false }
    } catch (error) {
      console.error('[haex-puzzle] Could not add a picture:', error)
      return fail('storage-failed')
    }
  }

  return {
    list: () => backend.list(),

    async add(files) {
      const results: AddResult[] = []
      for (const file of files) results.push(await addOne(file))
      return results
    },

    async open(id) {
      const picture = await backend.read(id)
      if (!picture || picture.data.byteLength === 0) throw new Error(`The picture ${id} is not in the library or has no data`)
      return picture
    },

    async remove(ids) {
      if (ids.length === 0) return
      await backend.remove(ids)
    },
  }
}
