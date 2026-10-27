import { describe, expect, it } from 'vitest'
import { arrayBufferToBase64 } from '@haex-space/vault-sdk'
import { contentHash, insertParams, listRowToItem, openRowToPicture, statements } from './pictureRows'

const TABLE = 'key__haex-puzzle__pictures'

describe('statements', () => {
  const sql = statements(TABLE)

  it('names the prefixed table and quotes it', () => {
    expect(sql.list).toContain(`FROM "${TABLE}"`)
    expect(sql.insert).toContain(`INSERT INTO "${TABLE}"`)
  })

  it('never selects the picture in the list and the find', () => {
    expect(sql.list).not.toMatch(/\bdata\b/)
    expect(sql.find).not.toMatch(/\bdata\b/)
    expect(sql.list).toContain('ORDER BY added_at DESC')
  })

  it('treats id as the only key', () => {
    expect(sql.insert).toContain('ON CONFLICT (id) DO NOTHING')
    expect(sql.find).toContain('WHERE id = ?')
  })

  it('removes any number of pictures with one statement', () => {
    expect(sql.remove(3)).toBe(`DELETE FROM "${TABLE}" WHERE id IN (?, ?, ?)`)
    expect(sql.remove(1)).toBe(`DELETE FROM "${TABLE}" WHERE id IN (?)`)
  })
})

describe('row mapping', () => {
  const thumbnail = new Uint8Array([9, 8, 7])
  const data = new Uint8Array([1, 2, 3, 4])

  it('turns a list row, in SELECT order, into a library item', () => {
    const item = listRowToItem(['abc', 'cat.jpg', 640, 480, '2026-10-27T10:00:00.000Z', arrayBufferToBase64(thumbnail)])
    expect(item).toMatchObject({ id: 'abc', name: 'cat.jpg', width: 640, height: 480, addedAt: '2026-10-27T10:00:00.000Z' })
    expect(Array.from(item.thumbnail)).toEqual([9, 8, 7])
  })

  it('turns an open row into the stored picture', () => {
    const picture = openRowToPicture([arrayBufferToBase64(data), 'image/webp', 640, 480])
    expect(Array.from(picture.data)).toEqual([1, 2, 3, 4])
    expect(picture).toMatchObject({ mimeType: 'image/webp', width: 640, height: 480 })
  })

  it('sends a record as parameters in the order of the insert, blobs as $bytes', () => {
    const params = insertParams({ id: 'abc', name: 'cat.jpg', width: 640, height: 480, mimeType: 'image/webp', data, thumbnail, addedAt: 'now' })
    expect(params).toEqual([
      'abc', 'cat.jpg', 640, 480, 'image/webp',
      { $bytes: arrayBufferToBase64(data) }, { $bytes: arrayBufferToBase64(thumbnail) }, 'now',
    ])
  })
})

describe('contentHash', () => {
  it('is the lowercase hex SHA-256', async () => {
    expect(await contentHash(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('differs for one changed byte', async () => {
    const a = await contentHash(new Uint8Array([1, 2, 3]))
    expect(await contentHash(new Uint8Array([1, 2, 3]))).toBe(a)
    expect(await contentHash(new Uint8Array([1, 2, 4]))).not.toBe(a)
  })
})
