import type { LibraryItem } from '~/types/puzzle'
import type { LibraryBackend } from './library'
import type { OpenedPicture, PictureRecord } from './pictureRows'

export interface MemoryBackend extends LibraryBackend {
  /** Makes the next write or removal reject, once. */
  failNextWrite(): void
  readonly rows: ReadonlyMap<string, PictureRecord>
}

function toItem(record: PictureRecord): LibraryItem {
  return { id: record.id, name: record.name, width: record.width, height: record.height, addedAt: record.addedAt, thumbnail: record.thumbnail }
}

/** An in-memory library with the semantics of the SQL backend; the test fake and the development fallback. */
export function createMemoryBackend(): MemoryBackend {
  const rows = new Map<string, PictureRecord>()
  let failing = false

  const guardWrite = () => {
    if (!failing) return
    failing = false
    throw new Error('The vault refused the write')
  }

  return {
    rows,
    failNextWrite() { failing = true },

    async list() {
      return [...rows.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).map(toItem)
    },

    async find(id) {
      const record = rows.get(id)
      return record ? toItem(record) : null
    },

    async insert(record) {
      guardWrite()
      if (rows.has(record.id)) return false
      rows.set(record.id, record)
      return true
    },

    async read(id): Promise<OpenedPicture | null> {
      const record = rows.get(id)
      return record ? { data: record.data, mimeType: record.mimeType, width: record.width, height: record.height } : null
    },

    async remove(ids) {
      guardWrite()
      for (const id of ids) rows.delete(id)
    },
  }
}
