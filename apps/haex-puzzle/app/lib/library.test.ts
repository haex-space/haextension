import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLibrary, type Encode, type Library } from './library'
import { createMemoryBackend, type MemoryBackend } from './memoryBackend.testing'

const encoded = { ok: true as const, data: new Uint8Array([7, 7, 7]), mimeType: 'image/webp', width: 800, height: 600, thumbnail: new Uint8Array([1]) }

let backend: MemoryBackend
let library: Library
let encode: ReturnType<typeof vi.fn<Encode>>
let clock: number

const file = (name: string, ...bytes: number[]) => ({ name, bytes: new Uint8Array(bytes) })

beforeEach(() => {
  backend = createMemoryBackend()
  encode = vi.fn<Encode>(async () => encoded)
  clock = 0
  library = createLibrary(backend, encode, () => new Date(Date.UTC(2026, 9, 27, 10, 0, clock++)).toISOString())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('add', () => {
  it('stores the encoder’s copy and thumbnail, never the caller’s bytes', async () => {
    const [result] = await library.add([file('cat.jpg', 1, 2, 3)])
    expect(result).toMatchObject({ ok: true, duplicate: false })
    const row = [...backend.rows.values()][0]!
    expect(Array.from(row.data)).toEqual([7, 7, 7])
    expect(Array.from(row.thumbnail)).toEqual([1])
    expect(row).toMatchObject({ name: 'cat.jpg', width: 800, height: 600, mimeType: 'image/webp' })
  })

  it('returns the existing item without writing or encoding when the same bytes come again', async () => {
    const [first] = await library.add([file('cat.jpg', 1, 2, 3)])
    const [second] = await library.add([file('copy-of-cat.jpg', 1, 2, 3)])
    expect(second).toMatchObject({ ok: true, duplicate: true })
    expect(second?.ok && second.item.id).toBe(first?.ok && first.item.id)
    expect(backend.rows.size).toBe(1)
    expect(encode).toHaveBeenCalledTimes(1)
  })

  it('reports one result per file, in order, and a failing file does not stop the others', async () => {
    encode.mockImplementationOnce(async () => ({ ok: false, reason: 'unsupported' }))
    const results = await library.add([file('broken.png', 1), file('a.png', 2), file('b.png', 3)])
    expect(results.map(r => r.ok)).toEqual([false, true, true])
    expect(results[0]).toEqual({ ok: false, name: 'broken.png', reason: 'unsupported' })
    expect(backend.rows.size).toBe(2)
  })

  it('passes the encoder’s rejections through', async () => {
    for (const reason of ['unsupported', 'too-large', 'too-small'] as const) {
      encode.mockImplementationOnce(async () => ({ ok: false, reason }))
      const [result] = await library.add([file(`${reason}.png`, reason.length)])
      expect(result).toEqual({ ok: false, name: `${reason}.png`, reason })
    }
  })

  it('leaves no row when the write fails, and reports storage-failed', async () => {
    backend.failNextWrite()
    const [result] = await library.add([file('cat.jpg', 1)])
    expect(result).toEqual({ ok: false, name: 'cat.jpg', reason: 'storage-failed' })
    expect(backend.rows.size).toBe(0)
    expect((await library.list())).toEqual([])
  })

  it('treats a lost race as a duplicate of the row that won', async () => {
    const racing = { ...backend, insert: async () => false }
    const winner = file('cat.jpg', 1)
    await library.add([winner])
    const raced = createLibrary({ ...racing, find: vi.fn().mockResolvedValueOnce(null).mockImplementation(backend.find) }, encode)
    const [result] = await raced.add([winner])
    expect(result).toMatchObject({ ok: true, duplicate: true })
  })
})

describe('list', () => {
  it('lists newest first and never carries the picture', async () => {
    await library.add([file('old.jpg', 1)])
    await library.add([file('new.jpg', 2)])
    const items = await library.list()
    expect(items.map(i => i.name)).toEqual(['new.jpg', 'old.jpg'])
    for (const item of items) expect(item).not.toHaveProperty('data')
  })
})

describe('open', () => {
  it('returns the stored copy', async () => {
    const [result] = await library.add([file('cat.jpg', 1)])
    const opened = await library.open(result?.ok ? result.item.id : '')
    expect(Array.from(opened.data)).toEqual([7, 7, 7])
    expect(opened).toMatchObject({ mimeType: 'image/webp', width: 800, height: 600 })
  })

  it('rejects for a missing row and for empty data', async () => {
    await expect(library.open('nope')).rejects.toThrow()
    const [result] = await library.add([file('cat.jpg', 1)])
    const id = result?.ok ? result.item.id : ''
    backend.rows.get(id)!.data = new Uint8Array()
    await expect(library.open(id)).rejects.toThrow()
  })
})

describe('remove', () => {
  async function addThree() {
    const results = await library.add([file('a.jpg', 1), file('b.jpg', 2), file('c.jpg', 3)])
    return results.map(r => (r.ok ? r.item.id : ''))
  }

  it('removes exactly the given pictures', async () => {
    const [a, b, c] = await addThree()
    await library.remove([a!, c!])
    expect([...backend.rows.keys()]).toEqual([b])
  })

  it('is all or nothing: a failed removal leaves every picture', async () => {
    const ids = await addThree()
    backend.failNextWrite()
    await expect(library.remove(ids)).rejects.toThrow()
    expect(backend.rows.size).toBe(3)
    expect((await library.list()).length).toBe(3)
  })

  it('does nothing for no ids', async () => {
    await addThree()
    await library.remove([])
    expect(backend.rows.size).toBe(3)
  })
})
