# Contract: the copy in the drafts folder

Used by `flushUploadsAsync` ([draft-store.md](draft-store.md)). The SDK calls are `client.mail.*` with the account's `imap` configuration; the mail permission `fetch` on the account's IMAP host covers them all.

## Putting a copy up (new or replacing)

For a draft that is due:

1. Resolve the account (`getCredentialsCachedAsync`); without credentials or without a `drafts` mailbox the draft stays local (no retry count for the missing folder; the person is told once).
2. Build the message exactly as the old `saveDraftAsync` did (`buildOutgoingMessage` with `subject || t("noSubject")`, `bodyContent`, `attachments`), then `buildRfc822Async`.
3. `id = "draft-<uuid>@haex-mail.invalid"`; `bytes = withMessageId(rfc822, id)`.
4. `appendMessageAsync(imap, draftsMailbox, bytes, ["\\Draft", "\\Seen"])`.
5. Store `server_message_id = id`, move the earlier `server_message_id` (if any) to the front of `previous_message_ids_json` (keep at most 5), and set `upload_due_at = NULL`, `attempts = 0` **only if** the draft's `edited_at` still equals the one read in step 2; otherwise keep `upload_due_at` so the newer text follows.
6. For every id in `previous_message_ids_json`: find its copy (below) and `deleteMessagesAsync` its UIDs, then drop the id from the list. A failure here is not an upload failure: the draft is up to date, and the ids that are left are tried again by the next flush.

## Finding a copy

`searchMessagesAsync(imap, draftsMailbox, { text: id })` → UIDs; `fetchEnvelopesAsync(imap, draftsMailbox, { type: "uidList", uids })`; keep the envelopes for which `sameMessageId(envelope.messageId, id)`. More than one match (a crash between append and delete) are all copies of that draft.

## Removing a copy (delete or send)

Find as above and `deleteMessagesAsync` the UIDs. No match means the copy is already gone: the row is deleted. A failure keeps `removed_at` and retries like an upload.

## Leftover copies

Appending before deleting means a failure between the two leaves an extra copy, never none. The extra copy's id stays in `previous_message_ids_json` ([data-model.md](../data-model.md)) until its deletion is confirmed, so replace, removal and every later flush look it up and delete it. A row with a non-empty list is due for a flush even when its text is up to date.

## Guarantees

- A draft has one current copy plus at most five unconfirmed earlier ones; the folder never holds more than six messages for one draft.
- Nothing is deleted that this feature did not append (every delete is for a UID found by one of the draft's own ids and verified against the envelope).
- A failed or interrupted flush leaves the local draft intact.
- The folder is not touched on every change: only on close and after 30 s without a change.

## Not covered

A draft that another program re-saved under a new Message-ID is not recognised as ours; the next upload appends a new copy and leaves the other program's message in the folder (research R-13).
