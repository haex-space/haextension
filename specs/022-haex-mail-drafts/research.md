# Research: haex-mail — drafts that save themselves

Facts checked on 2026-10-30 against `origin/main` of haextension (5ccabd7) with haex-space/haextension#165 applied (the compose dialog takes the fields of a mail link), and against `@haex-space/vault-sdk` 5.1.0.

## R-1: Where a draft lives

- **Decision**: Two device-local tables of the extension's vault schema: `drafts_no_sync` (one row per draft, the small fields) and `draft_attachments_no_sync` (one row per attachment, the bytes). The `_no_sync` suffix keeps them out of the vault sync, exactly as `haex-doom` keeps its game files out (`apps/haex-doom/app/database/schemas/index.ts`).
- **Rationale**: Without the suffix every table of the extension syncs (the rules table says so in its comment, and `haex-puzzle` relies on it for its pictures). A synced draft would be edited on two devices at once with column-wise last-write-wins, which can mix the text of two devices into one mail, and it would move attachment bytes through the sync. The spec puts cross-device sync of drafts out of scope and names the server copy as the way a draft reaches other programs; `_no_sync` makes that true by construction. Saving stays a local write that needs no connection (FR-003).
- **Alternatives considered**:
  - *A synced table*: drafts would follow the person to other devices for free, but with the conflicts and the traffic above. Rejected for now; a later spec can drop the suffix by migrating the rows.
  - *The SDK's device-local `storage` (strings, 1 MiB per value)*: no query, and the attachments do not fit. Rejected (same finding as `haex-puzzle` R-1).
  - *The drafts folder of the server as the only store*: every save is an IMAP round trip and fails offline. Rejected by the spec's own premise.

## R-2: When the local draft is written

- **Decision**: A pure debounced saver. Each change of a field restarts a **300 ms** timer; when it fires the draft row is written. It is flushed at once when the dialog closes, when the page becomes hidden (`visibilitychange`) and before it unloads (`pagehide`). Writes are serialised: a change that arrives during a write is written right after it.
- **Rationale**: The spec's bound is one second after the last change (FR-001). 300 ms of debounce plus one row write stays well under it and writes once per pause, not per keystroke (SC-003). A crash inside the 300 ms loses at most that; the spec allows one second. `pagehide` and `visibilitychange` are the events a web view still delivers when the host closes the frame, which is the "lost window" the spec names.
- **Alternatives considered**: *Write on every change*: a row write per keystroke with a large body (the body is HTML). Rejected. *Throttle instead of debounce*: writes during continuous typing, no benefit once the pause bound is met. Rejected.

## R-3: What a draft keeps, and attachments

- **Decision**: The row keeps the account, the three address fields as the text the person typed, the subject, the **editor HTML** of the body (what the dialog's `body` ref holds; formatting survives), and the threading data of a reply (`inReplyTo`, `references`). Attachments are one row each in the second table, with the bytes as base64 (the form `OutgoingAttachment.data` already has). They are written only when the **set** of attachments changes, never with a text change. A draft keeps at most **25 MiB** of attachments locally; beyond that the dialog works as today, says once that the attachments are not saved, and the draft keeps the rest.
- **Rationale**: The dialog already holds attachments in memory as base64, so storing the same string needs no conversion. Separate rows keep the frequent write small. A mail server refuses messages above roughly 25 MB, so a larger local copy would only keep what cannot be sent; the bound also stays far below the 100 MB limit of a database transaction that `apps/haex-notes/app/composables/useAssetStore.ts` records.
- **ponytail**: One base64 string per attachment row means a row of tens of MiB. The ceiling is the transaction limit and the memory of the web view; the upgrade is chunked rows as `haex-doom` stores its game files (`game_file_chunks_no_sync`). Not built, because a 25 MiB total is below where that matters.
- **What counts as content** (FR-002): any non-blank recipient, subject or text, or any attachment. The quoted original of a reply and the fields a mail link brought are the two exceptions, handled by one rule: a reply whose fields equal the state the reply was opened with has no content; a draft opened by a link has content from the start. The comparison is a pure function (`draftHasContent(fields, baseline)`), the baseline is the prefill the dialog applied.
- **Alternatives considered**: *Plain text instead of HTML*: loses the formatting the editor keeps. Rejected. *Attachments inside the draft row*: every text save would rewrite megabytes. Rejected.

## R-4: Replacing and removing the copy on the server

- **Findings that shape it**: `MailAPI.appendMessageAsync` returns `void`, so the UID of the appended message is not known. `OutgoingMessage` has no way to set the Message-ID or another header. `searchMessagesAsync` matches "header and body text" (up to 200 characters) and returns UIDs, newest first. `fetchEnvelopesAsync` with a `uidList` range returns envelopes with the Message-ID. `deleteMessagesAsync(imap, mailbox, uids)` deletes exactly those UIDs (UIDPLUS; it refuses before marking on a server without it).
- **Decision**: The copy of a draft carries a Message-ID that **haex-mail writes itself**: after `buildRfc822Async` the bytes are decoded, any existing `Message-ID` header is removed and `Message-ID: <draft-<uuid>@haex-mail.invalid>` is put first, then the bytes are encoded again and appended. The draft row stores that ID (`serverMessageId`). To **replace**, the old copy is found by a search for its ID, checked against the Message-ID of the envelope of each hit, appended anew, and only then deleted by UID. To **remove**, the same lookup and a delete. Details in [contracts/server-copy.md](contracts/server-copy.md).
- **Rationale**: The ID is the only stable handle the SDK allows. Writing it ourselves removes the dependence on how the host builds the message, and the pure function that does it is tested without a server. Appending before deleting means a failure between the two leaves two copies, never none; the next replace deletes both by ID. `.invalid` is the reserved top-level domain for names that must not resolve, so the ID never collides with a real one.
- **Not verified** `[Guessing]`: that a real server returns the new message for a `TEXT` search on its Message-ID right after an append, and that the host's search passes the `<` and `>` of an ID as plain text. Task T001 of the tasks checks both against a real account before anything depends on them; the fallback if searching by Message-ID fails is a header `X-Haex-Draft: <uuid>` that the same pure function adds next to the Message-ID, and a search for that token.
- **Alternatives considered**: *Do not replace, append a new copy on every upload*: breaks FR-008. *Keep the UID after the append by listing the folder and taking the highest UID*: races with another program appending at the same moment. *Never delete, mark the old copy `\Deleted` only*: leaves flagged messages for the other program to show. Rejected.

## R-5: When the server copy happens, and retries

- **Decision**: Each local save sets `uploadDueAt = now + 30 s` on the draft. Closing the dialog sets it to now. A flush uploads every draft whose time has come, one after the other. A failed upload counts an attempt and waits `retryDelayMs(attempts)`; being offline counts nothing and waits for the `online` event, as the move outbox does. After `MAX_MOVE_ATTEMPTS` failures the draft stays local without being retried until its next change, and the person is told once.
- **Rationale**: The person chose "after closing and after a pause" for the copy (spec clarification). A single `uploadDueAt` per draft is the same state the pause needs and the retry needs. Reusing `retryDelayMs`, `nextRetryAt` and `MAX_MOVE_ATTEMPTS` from `lib/pendingMoves.ts` keeps one backoff in the app.
- **Missing drafts folder** (US4 scenario 4): the account has no row with the role `drafts`; the draft stays local, the folder is named once in a toast, and the upload is not retried until the mailboxes were refreshed.
- **Alternatives considered**: *A setInterval that scans all drafts*: wakes the app when nothing is due. Rejected for one timer set to the next due time (`nextRetryAt` style).

## R-6: The list of drafts

- **Decision**: In the drafts view (one account, or the unified view's role view) the store merges two sources: the cached server messages of the drafts mailbox (as today) and the local drafts of the shown accounts. A local draft becomes a **synthetic row** of the existing message type (`id` = `draft::<draftId>`, `uid` 0, flags `["\\Draft"]`, the subject, the recipients, `internalDate` = the time of the last edit). A server row whose Message-ID equals the `serverMessageId` of a local draft is hidden, so a draft is listed once. Selecting a row whose id starts with `draft::` opens the compose dialog instead of the reading pane.
- **Rationale**: `MessageList`, sorting, search and the unified merge already work on the message row type; a synthetic row reuses them all and needs no new list component. The id prefix cannot collide with a real id (`${accountId}::${mailbox}::${uid}`).
- **Alternatives considered**: *A separate "local drafts" section above the list*: a second list to build, search and sort, and the person sees one draft twice in two places. Rejected.

## R-7: Opening a draft that is only on the server

- **Decision**: Clicking a server-only row in the drafts view **adopts** it: the body and attachments are read (`useReplyBuilder` already fetches both for a forward: `getBodyContextAsync`, `fetchAttachmentBase64Async`), a local draft is created from them with `serverMessageId` set to the message's own Message-ID and the dialog opens on it. The next upload replaces the server message instead of leaving it next to a new one.
- **Rationale**: This is the same operation as continuing a local draft; the only difference is where the fields come from. It also makes the drafts of the agent tools (`create_draft`, spec 019) continuable.
- **Edge**: A server draft that has no Message-ID cannot be replaced by ID; it is adopted with `serverMessageId` empty and the old message is deleted by UID after the first successful upload of the new copy, which the adoption step knows because it has the UID.

## R-8: Starting a new mail never touches the open one

- **Decision**: `ComposeDialog.vue` owns the id of the draft it shows. A mail link (`applyPrefill`), the compose button and "new mail" call one function: flush the saver, then reset the fields and begin a new draft id (created on the first content, or at once for a link). The open draft is already in the table. The `ponytail:` comment of #165 and its replace-on-link behaviour are deleted.
- **Rationale**: Because the previous mail is saved before the reset, no confirmation is needed (spec 2, FR-005).

## R-9: Discard and delete

- **Decision**: "Discard" in the dialog asks once with `ShadcnDialogConfirm` (`packages/haex-ui/components/shadcn/dialog/Confirm.vue`) when the mail has content, then deletes the draft. Deleting a draft that has a server copy marks the row `removedAt` (it disappears from every list) and the flush removes the copy, then the row. A draft that was never uploaded is deleted at once.
- **Rationale**: A soft delete is the persisted "to do" that survives a restart, like a row in `pending_moves`, without a third table.

## R-10: Sending

- **Decision**: After `sendMessageAsync` succeeds the dialog removes its draft (R-9). A failed send changes nothing. The existing "copy to Sent" behaviour is not touched.
- **Rationale**: FR-014; the send path is the one place that already knows the send worked.

## R-11: Closing the dialog today

- **Decision**: `closeAsync` no longer appends a draft to the server by itself. It flushes the local save, sets the upload due now and closes; the toast "Draft saved" and the error "no drafts folder" move to the store's flush (shown once). The close button stops being able to keep the dialog open on a server failure, because the draft is already safe locally.
- **Rationale**: The reason the dialog stayed open on failure was that the text would otherwise be lost; it no longer can be.

## R-12: Graphify consultation (constitution)

Run on the primary checkout's graph (an older snapshot; the worktree has no `graph.json`, which the rule allows, and the snapshot's line numbers were not relied on). Queries: "drafts compose dialog save draft IMAP append drafts mailbox message list", "debounce save timer autosave draft", "retry backoff offline queue flush pending operations", "generate unique id crypto randomUUID", "confirm dialog discard unsaved changes".

| New artifact | Candidates evaluated | Outcome |
|--------------|----------------------|---------|
| `useDraftAutosave`, `createDraftSaver` | `saveDraftAsync`, `closeAsync`, `discardAsync` in `ComposeDialog.vue`; no debounce helper anywhere in the app | **Independent**: no debounce exists. The old `saveDraftAsync` is replaced, its message-building is reused (`buildOutgoingMessage`, `bodyContent`). |
| draft store, upload flush | `useMoveOutbox` (`stores/mail/outbox.ts`), `lib/pendingMoves.ts` | **Borderline** (see Constitution Check): pure helpers reused, flush loop written separately. |
| `draftHasContent`, row mapping, list merge | `parseAddressList`, `formatAddressList` (`lib/address.ts`), `ReplyContext` (`stores/mail/reply.ts`) | **Reuse** the address helpers; the content rule is new. |
| adoption of a server draft | `getBodyContextAsync`, `fetchAttachmentBase64Async` (`useReplyBuilder`) | **Reuse** both. |
| `crypto.randomUUID()` for draft ids | used in `stores/accounts.ts`, `stores/rules.ts` | **Reuse** the same call, no helper. |
| discard confirmation | `ShadcnDialogConfirm` in `packages/haex-ui` | **Reuse**. |

## R-13: Spec adjustments this research asks for

- **Server draft changed by another program** (spec Assumptions and Edge Cases): the plan does not read the server copy back to compare it. When the copy cannot be found by its Message-ID (the other program replaced or removed it) the next upload appends a fresh copy; what the other program saved stays in the folder and shows up as a server-only draft. The outcome the spec wanted ("neither side overwrites the other without notice, the newer server version is kept") holds, reached without a content comparison. The spec text is changed to say this.
- **Attachments bound**: the 25 MiB local bound of R-3 is added to the spec's "Very large mail" edge case.
