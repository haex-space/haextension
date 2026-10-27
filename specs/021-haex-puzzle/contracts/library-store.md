# Contract: picture library store

The one interface between the UI and the vault. Implemented in three layers so the logic is tested without a vault: `app/lib/library.ts` (`createLibrary(backend, encode)`: the behaviour below), a `LibraryBackend` with two implementations — `app/lib/vaultBackend.ts` (the SQL below over the SDK's `database` client, shape as `apps/haex-doom/app/stores/saves.ts`) and `app/lib/memoryBackend.testing.ts` (in memory; the test fake and the development fallback) — and `app/stores/library.ts`, a thin Pinia wrapper holding `items` and `loading`. Table and columns: [data-model.md](../data-model.md).

## Operations

```ts
interface LibraryItem {
  id: string
  name: string
  width: number
  height: number
  addedAt: string            // ISO 8601 UTC
  thumbnail: Uint8Array
}

type Rejection = 'unsupported' | 'too-large' | 'too-small' | 'storage-failed' | 'read-failed'

type AddResult =
  | { ok: true; item: LibraryItem; duplicate: boolean }
  | { ok: false; name: string; reason: Rejection }

interface LibraryStore {
  items: Readonly<Ref<LibraryItem[]>>          // newest first
  loading: Readonly<Ref<boolean>>
  load(): Promise<void>                        // metadata + thumbnails only
  add(files: readonly { name: string; bytes: Uint8Array }[]): Promise<AddResult[]>  // one result per file, in order
  open(id: string): Promise<{ bytes: Uint8Array; mimeType: string; width: number; height: number }>
  remove(ids: readonly string[]): Promise<void>  // all-or-nothing; rejects if the vault refuses
}
```

## Behaviour that callers rely on

| # | Guarantee | Spec |
|---|-----------|------|
| 1 | `add` stores a **re-encoded copy** (≤ 1 MiB, long side ≤ 2048 px) and a thumbnail; the caller's bytes are never written anywhere. | FR-021, R-2 |
| 2 | `add` of bytes whose SHA-256 (the row's `id`) is already stored returns `{ ok: true, duplicate: true, item: <existing> }` and writes nothing. | FR-026 |
| 3 | A failing file does not stop the others; its result is `{ ok: false, … }` and the library is unchanged for it. | US3-8 |
| 4 | A failed write leaves **no partial row** (one statement per picture), and the picture is not played from; the user is told and adds it again. | FR-026, FR-027, spec edge case |
| 5 | `load` never reads the `data` column. | FR-024 |
| 6 | `open` rejects when the row is gone or the stored bytes are empty; the caller shows the "unusable" state. | edge case |
| 7 | `remove` deletes the rows (picture, thumbnail, hash) in one statement; on rejection nothing was removed and `items` is unchanged. After success `items` no longer contains them. | FR-025, FR-027 |
| 8 | No other API removes a picture. | FR-025 |

## SQL (raw client, binary as `{ $bytes: base64 }`)

```text
list    SELECT id, name, width, height, added_at, thumbnail FROM "<pictures>" ORDER BY added_at DESC
open    SELECT data, mime_type, width, height FROM "<pictures>" WHERE id = ?
insert  INSERT INTO "<pictures>" (id, name, width, height, mime_type, data, thumbnail, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING
exists  SELECT id, name, width, height, added_at, thumbnail FROM "<pictures>" WHERE id = ?
remove  DELETE FROM "<pictures>" WHERE id IN (?, ?, …)
```

The host returns rows as arrays of column values in `SELECT` order (see the comment in `apps/haex-doom/app/stores/games.ts`); the row mapper in `app/lib/pictureRows.ts` is the only place that knows the order.

## Tests of this contract

`app/lib/library.test.ts` runs guarantees 1–8 against the in-memory backend with a stub encoder; `app/lib/vaultBackend.test.ts` runs the SQL layer against a fake `database` client and asserts the statements above, binary values sent as `{ $bytes: <base64> }`, the column order of the rows, and that a removal of several pictures is a single `DELETE` statement. The same behaviour tests can be pointed at any new backend.
