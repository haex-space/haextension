import { describe, expect, it } from 'vitest'
import { arrayBufferToBase64 } from '@haex-space/vault-sdk'
import { createVaultBackend, type DatabaseClient } from './vaultBackend'

const TABLE = 'key__haex-puzzle__pictures'

function fakeDatabase(rows: Record<string, unknown[][]> = {}, rowsAffected = 1) {
  const calls: { kind: 'query' | 'execute'; sql: string; params: unknown[] }[] = []
  const database: DatabaseClient = {
    async query<T>(sql: string, params: unknown[] = []) {
      calls.push({ kind: 'query', sql, params })
      const key = Object.keys(rows).find(k => sql.startsWith(k))
      return (key ? rows[key] : []) as T[]
    },
    async execute(sql, params = []) {
      calls.push({ kind: 'execute', sql, params })
      return { rowsAffected }
    },
  }
  return { database, calls }
}

const record = {
  id: 'abc', name: 'cat.jpg', width: 640, height: 480, mimeType: 'image/webp',
  data: new Uint8Array([1, 2, 3]), thumbnail: new Uint8Array([4]), addedAt: '2026-10-27T10:00:00.000Z',
}

describe('createVaultBackend', () => {
  it('lists with a statement that does not name the data column and maps rows in SELECT order', async () => {
    const { database, calls } = fakeDatabase({ 'SELECT id, name': [['abc', 'cat.jpg', 640, 480, 'now', arrayBufferToBase64(new Uint8Array([4]))]] })
    const items = await createVaultBackend(database, TABLE).list()
    expect(calls[0]!.sql).not.toMatch(/\bdata\b/)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'abc', name: 'cat.jpg', width: 640, height: 480 })
    expect(Array.from(items[0]!.thumbnail)).toEqual([4])
  })

  it('inserts with one statement, blobs as $bytes, and reports whether a row was written', async () => {
    const written = fakeDatabase({}, 1)
    expect(await createVaultBackend(written.database, TABLE).insert(record)).toBe(true)
    expect(written.calls).toHaveLength(1)
    expect(written.calls[0]!.sql).toContain('ON CONFLICT (id) DO NOTHING')
    expect(written.calls[0]!.params[5]).toEqual({ $bytes: arrayBufferToBase64(record.data) })

    const existing = fakeDatabase({}, 0)
    expect(await createVaultBackend(existing.database, TABLE).insert(record)).toBe(false)
  })

  it('reads one picture by id and returns null when it is gone', async () => {
    const found = fakeDatabase({ 'SELECT data': [[arrayBufferToBase64(new Uint8Array([9, 9])), 'image/jpeg', 10, 20]] })
    const picture = await createVaultBackend(found.database, TABLE).read('abc')
    expect(found.calls[0]!.params).toEqual(['abc'])
    expect(Array.from(picture!.data)).toEqual([9, 9])
    expect(picture).toMatchObject({ mimeType: 'image/jpeg', width: 10, height: 20 })

    expect(await createVaultBackend(fakeDatabase().database, TABLE).read('abc')).toBeNull()
  })

  it('removes several pictures with a single DELETE statement', async () => {
    const { database, calls } = fakeDatabase()
    await createVaultBackend(database, TABLE).remove(['a', 'b', 'c'])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ kind: 'execute', sql: `DELETE FROM "${TABLE}" WHERE id IN (?, ?, ?)`, params: ['a', 'b', 'c'] })
  })

  it('lets a failing database reject', async () => {
    const database: DatabaseClient = {
      async query() { return [] },
      async execute() { throw new Error('vault unavailable') },
    }
    await expect(createVaultBackend(database, TABLE).remove(['a'])).rejects.toThrow('vault unavailable')
  })
})
