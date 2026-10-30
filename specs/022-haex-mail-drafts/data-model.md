# Data Model: haex-mail — drafts that save themselves

Both tables live in the extension's own vault schema (`getTableName(publicKey, "haex-mail", name)`), carry `_no_sync` in their name, and are created by one drizzle migration. Neither table appears in the sync, and the ids are random UUIDs (`crypto.randomUUID()`), as accounts and rules have them.

## `drafts_no_sync`

One row per unsent mail.

| Column | Type | Meaning |
|--------|------|---------|
| `id` | text, primary key | The draft's id. The list row id is `draft::<id>`. |
| `account_id` | text, not null | The account the mail is sent from. |
| `to_text`, `cc_text`, `bcc_text` | text, not null, default `""` | The address fields as typed (the dialog parses them on send). |
| `subject` | text, not null, default `""` | |
| `body_html` | text, not null, default `""` | The editor HTML of the body. |
| `in_reply_to` | text | Message-ID this mail answers; with `references_json` it keeps a reply a reply (FR-004). |
| `references_json` | text (JSON array of strings), not null, default `[]` | Threading chain. |
| `edited_at` | integer, not null | Unix ms of the last change by the person. The list shows and sorts by this. Bookkeeping writes (upload state) do not change it, which is why it is not `updated_at`. |
| `upload_due_at` | integer | Unix ms from which the draft is uploaded; `NULL` when its server copy is up to date. |
| `attempts` | integer, not null, default 0 | Failed uploads since the last change. |
| `next_attempt_at` | integer, not null, default 0 | Unix ms; not tried before. |
| `server_message_id` | text | The Message-ID of the copy in the drafts folder, without angle brackets; `NULL` while there is none. |
| `previous_message_ids_json` | text (JSON array of strings), not null, default `[]` | Earlier copies not yet confirmed deleted, at most 5 ([server-copy.md](contracts/server-copy.md)). |
| `removed_at` | integer | Unix ms; set when the person deleted or sent a draft that has a server copy, so the copy can still be removed after a restart. A row with this set is in no list. |
| `created_at`, `updated_at` | integer | The usual timestamps. |

**Validation**: a row exists only for a mail with content (FR-002); the store deletes the row when the content is removed again. `server_message_id` is never reused for another draft.

**State of a draft**

```text
(typing) ──content──▶ local, not uploaded ──30 s idle / close──▶ uploaded (server_message_id set)
   ▲                         │ change                                  │ change
   │                         ▼                                         ▼
   └─ emptied ◀─────── upload_due_at = now + 30 s ◀────────────────────┘
send / delete: no copy → row deleted; copy → removed_at set → copy deleted → row deleted
```

## `draft_attachments_no_sync`

One row per attachment of a draft.

| Column | Type | Meaning |
|--------|------|---------|
| `id` | text, primary key | |
| `draft_id` | text, not null | The owning draft. Deleted with it. |
| `position` | integer, not null | Order in the dialog. |
| `filename` | text, not null | |
| `content_type` | text, not null | |
| `content_id` | text | For inline parts, as `OutgoingAttachment.contentId`. |
| `size` | integer, not null | Decoded size in bytes, for the 25 MiB bound (R-3 of the research). |
| `data` | text, not null | Base64, as `OutgoingAttachment.data`. |

Written only when the set of attachments changes (a replace of all rows of the draft in one transaction).

## Derived: draft list row

Not stored. The store maps a draft to the existing message row type (`SelectMessage`): `id = "draft::" + id`, `accountId`, `mailboxName` = the account's drafts mailbox, `uid = 0`, `flags = ["\\Draft"]`, `subject`, `toJson` and `ccJson` parsed from the text fields, `internalDate = edited_at`, `messageId = server_message_id`. The server row that has the same `messageId` is dropped from the merged list.

## Relationships

- `drafts_no_sync.account_id` → `accounts.id`. A removed account removes its drafts (and their attachments) in the same operation that removes the account's cache.
- `draft_attachments_no_sync.draft_id` → `drafts_no_sync.id`, cascade by the store, not by a foreign key (the vault's SQL check does not take them).
