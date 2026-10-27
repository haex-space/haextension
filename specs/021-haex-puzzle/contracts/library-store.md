# Contract: picture library store

The one interface between the UI and the vault. Implemented as a Pinia store, `app/stores/library.ts` (shape as `apps/haex-doom/app/stores/saves.ts`); the pure parts (row mapping, SQL text, the add pipeline's decisions) live in `app/lib` and are unit-tested without a vault. Table and columns: [data-model.md](../data-model.md).

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
| 2 | `add` of bytes whose SHA-256 is already stored returns `{ ok: true, duplicate: true, item: <existing> }` and writes nothing. | FR-026 |
| 3 | A failing file does not stop the others; its result is `{ ok: false, … }` and the library is unchanged for it. | US3-8 |
| 4 | A failed write leaves **no partial row** (one statement per picture). | FR-026, FR-027 |
| 5 | `load` never reads the `data` column. | FR-024 |
| 6 | `open` rejects when the row is gone or the stored bytes are empty; the caller shows the "unusable" state. | edge case |
| 7 | `remove` deletes the rows (picture, thumbnail, hash) in one statement; on rejection nothing was removed and `items` is unchanged. After success `items` no longer contains them. | FR-025, FR-027 |
| 8 | No other API removes a picture. | FR-025 |

## SQL (raw client, binary as `{ $bytes: base64 }`)

```text
list    SELECT id, name, width, height, added_at, thumbnail FROM "<pictures>" ORDER BY added_at DESC
open    SELECT data, mime_type, width, height FROM "<pictures>" WHERE id = ?
insert  INSERT INTO "<pictures>" (id, content_hash, name, width, height, mime_type, data, thumbnail, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (content_hash) DO NOTHING
exists  SELECT id FROM "<pictures>" WHERE content_hash = ?
remove  DELETE FROM "<pictures>" WHERE id IN (?, ?, …)
```

The host returns rows as arrays of column values in `SELECT` order (see the comment in `apps/haex-doom/app/stores/games.ts`); the row mapper in `app/lib/pictureRows.ts` is the only place that knows the order.
