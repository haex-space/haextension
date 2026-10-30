# Contract: the draft modules

Everything below is an internal contract between `ComposeDialog.vue`, `pages/index.vue`, the mail store and the draft modules. There is no new bridge method and no new manifest field.

## `lib/drafts.ts` (pure)

```ts
interface DraftFields {
  accountId: string;
  to: string; cc: string; bcc: string;
  subject: string;
  bodyHtml: string;                 // editor HTML
  inReplyTo?: string; references: string[];
  attachments: OutgoingAttachment[];
}

draftHasContent(fields: DraftFields, baseline: DraftFields | null): boolean
toDraftRow(id: string, fields: DraftFields, now: number): DraftRowValues
fromDraftRow(row: SelectDraft, attachments: SelectDraftAttachment[]): DraftFields
draftListRow(row: SelectDraft, draftsMailboxName: string): SelectMessage   // id "draft::<id>"
isDraftRowId(id: string): boolean
mergeDraftRows(serverRows: SelectMessage[], local: SelectMessage[]): SelectMessage[]
```

- `draftHasContent`: `false` when every field is blank and there is no attachment, and `false` when `baseline` is given and the fields equal it (a reply that was not touched). A link's prefill is passed as no baseline, so it has content.
- `mergeDraftRows`: drops each server row whose `messageId` equals the `messageId` of a local row; result is ordered by `internalDate` descending, like the list loaders produce.
- Round trip: `fromDraftRow(toDraftRow(f))` equals `f` for every field, including an empty body and an attachment-only mail.

## `lib/draftSaver.ts` (pure, timers injected)

```ts
createDraftSaver(write: (fields: DraftFields) => Promise<void>, options?: { delayMs?: number; timers?: Timers }):
  { change(fields: DraftFields): void; flush(): Promise<void>; cancel(): void }
```

- `change` restarts the timer (default 300 ms); `write` gets the **latest** fields when it fires.
- `flush` writes the pending fields now and resolves when the write finished; with nothing pending it resolves at once.
- Writes never overlap: a `change` during a write is written after it.
- A failing `write` rejects `flush`, keeps the fields pending and does not stop later changes from being written.

## `lib/draftUpload.ts` (pure)

```ts
dueDrafts(rows: DraftDueRow[], now: number, force: boolean): string[]      // ids, oldest due first
nextDueAt(rows: DraftDueRow[]): number | null                              // the next timer
withMessageId(rfc822Base64: string, id: string): string                    // R-4: put our Message-ID first
messageIdOf(rfc822Base64: string): string | null
sameMessageId(a: string | null | undefined, b: string | null | undefined): boolean   // ignores angle brackets
```

- `dueDrafts`: a row is due when it has something to do (`upload_due_at` or `removed_at` is set, or `previous_message_ids_json` is not empty), `now >= max(upload_due_at, next_attempt_at)` and `attempts < MAX_MOVE_ATTEMPTS`. `force` ignores the two times but not the attempt limit: a draft that gave up waits for its next change.
- `withMessageId`: removes every existing `Message-ID` header including its folded continuation lines, puts `Message-ID: <id>` first, leaves the rest of the bytes untouched (headers and body), and returns valid base64. `messageIdOf(withMessageId(x, id))` is `id`.

## `stores/mail/drafts.ts` (I/O)

```ts
useDrafts(deps: { accounts, mail, sync }) → {
  saveAsync(draftId: string | null, fields: DraftFields): Promise<string | null>   // returns the id; null when no content (row removed)
  loadAsync(id: string): Promise<DraftFields | null>
  listRowsAsync(accountIds: string[], mailboxNameOf: (accountId: string) => string | undefined): Promise<SelectMessage[]>
  adoptServerDraftAsync(message: SelectMessage): Promise<{ id: string; fields: DraftFields }>
  removeAsync(id: string): Promise<void>                  // delete, or mark for removal when a copy exists
  flushUploadsAsync(force?: boolean): Promise<void>       // never throws
  scheduleUploadNow(id: string): Promise<void>            // used on close
}
```

- `saveAsync` with content writes the row (`edited_at = now`, `upload_due_at = now + 30 s`, `attempts = 0`), writes the attachment rows only when `attachments` differ from the stored ones, and arms the flush timer. Without content it removes the row (and deletes a copy, via `removeAsync`).
- `removeAsync`: a draft without `server_message_id` is deleted with its attachments in one transaction; a draft with one gets `removed_at`, and `flushUploadsAsync` deletes the server copy and then the row.
- `flushUploadsAsync` follows [server-copy.md](server-copy.md); calls fold into one more run after the current one (as `flushPendingMovesAsync`), `online` triggers `force`.
- Removing an account calls `removeAsync`-without-server for its drafts; the account's credentials are gone, so no server call is attempted.

## `composables/useDraftAutosave.ts` (wiring)

```ts
useDraftAutosave(fields: Ref<DraftFields>, options: { baseline: Ref<DraftFields | null>; drafts: ReturnType<typeof useDrafts> }) → {
  draftId: Ref<string | null>
  begin(initial: DraftFields, baseline: DraftFields | null, existingId?: string): Promise<void>   // flush the old draft, start this one
  flushAsync(): Promise<void>
  discardAsync(): Promise<void>
  sent(): Promise<void>                                    // after a successful send
}
```

- Watches `fields` (deeply), calls the saver's `change`. Listens to `visibilitychange` (hidden) and `pagehide` and flushes.
- `begin` always flushes the draft that is open before it starts the next; that is the only place a "new mail" starts (compose button, mail link, continuing a draft).

## Behaviour pinned by tests

1. A mail whose content is removed again has no row and no server copy afterwards.
2. A change during a write is not lost and is written once.
3. `mergeDraftRows` lists a draft once, whether or not its server copy is already in the cache.
4. `begin` on a link while a mail with content is open leaves that mail's row with its full text and starts a second row.
5. An untouched reply leaves no row; a touched one does, and keeps `in_reply_to`/`references`.
