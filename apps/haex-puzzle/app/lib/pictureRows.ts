import { arrayBufferToBase64, base64ToArrayBuffer } from '@haex-space/vault-sdk'
import type { LibraryItem } from '~/types/puzzle'

/**
 * The host returns each row as an array of column values, in SELECT order, with blobs as base64.
 * This is the only place that knows that order.
 */
export type ListRow = [id: string, name: string, width: number, height: number, addedAt: string, thumbnail: string]
export type OpenRow = [data: string, mimeType: string, width: number, height: number]

export interface PictureRecord {
  id: string
  name: string
  width: number
  height: number
  mimeType: string
  data: Uint8Array
  thumbnail: Uint8Array
  addedAt: string
}

export interface OpenedPicture {
  data: Uint8Array
  mimeType: string
  width: number
  height: number
}

/** The statements of the library, for one prefixed table name. The list never names `data`. */
export function statements(table: string) {
  return {
    list: `SELECT id, name, width, height, added_at, thumbnail FROM "${table}" ORDER BY added_at DESC`,
    find: `SELECT id, name, width, height, added_at, thumbnail FROM "${table}" WHERE id = ?`,
    open: `SELECT data, mime_type, width, height FROM "${table}" WHERE id = ?`,
    insert: `INSERT INTO "${table}" (id, name, width, height, mime_type, data, thumbnail, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    remove: (count: number) => `DELETE FROM "${table}" WHERE id IN (${Array.from({ length: count }, () => '?').join(', ')})`,
  }
}

export function listRowToItem(row: ListRow): LibraryItem {
  const [id, name, width, height, addedAt, thumbnail] = row
  return { id, name, width, height, addedAt, thumbnail: base64ToArrayBuffer(thumbnail) }
}

export function openRowToPicture(row: OpenRow): OpenedPicture {
  const [data, mimeType, width, height] = row
  return { data: base64ToArrayBuffer(data), mimeType, width, height }
}

/** Parameters of the insert statement; binary values go over the bridge as `$bytes`. */
export function insertParams(record: PictureRecord): unknown[] {
  return [
    record.id, record.name, record.width, record.height, record.mimeType,
    { $bytes: arrayBufferToBase64(record.data) },
    { $bytes: arrayBufferToBase64(record.thumbnail) },
    record.addedAt,
  ]
}

/**
 * The picture's id: lowercase hex SHA-256 of the original file's bytes.
 * ponytail: the same photo saved at two sizes is two pictures; a perceptual hash would catch it.
 */
export async function contentHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
