# Contract: host bridge (holzi) — what haex-mail needs

This is the contract the host (`haex-space/haex-vault`) must meet for FR-023 to FR-029 and that haex-mail and the SDK build on. It is checked against the host's current code at cc609e82dac86a7bc119db445197214052115ca4. The host writes its own spec and ADR from it; where the host's process finds a better shape, this file is changed first.

The existing methods `extension_contacts_list`, `_read`, `_search` and `_photo` do not change (FR-028).

## Permission

`contacts` accepts the actions `read` and `readWrite`, for the target `*` or the name of a group.

- Manifest: `"contacts": [{ "target": "*", "action": "read" }, { "target": "*", "action": "readWrite" }]`. The spelling `read_write` is normalised as for other kinds. The action `write` stays invalid.
- Two rows are stored, each with its own state: `granted`, `ask`, `denied`. A granted `readWrite` covers `read`.
- The extension's grants for the service are built from both rows: a `readWrite` row yields a `ReadWrite` grant, a `read` row a `Read` grant, each with the scope of its target.

## Answers every call can give

| Situation | Answer |
|-----------|--------|
| Write call, `readWrite` row is `ask` | 1004 `PermissionPromptRequired` with `details {resourceType: "contacts", action: "readWrite", target}`; the host puts the question before the person. The SDK waits and repeats the call. |
| `readWrite` row is `denied`, or `read`/`readWrite` of the whole `*` is denied | 1002 `PermissionDenied`, no question asked. |
| The contact is not covered by the grant, or does not exist | 1002, the same answer (FR-025). |
| The frame is not an installed, enabled extension | as for every method (8002). |
| Unknown method (older host) | 8000 `NotSupported`. |

When the grant has two rows (`read` granted, `readWrite` ask), a write call asks for `readWrite`; a read call is never answered with a question for `readWrite`.

## `extension_contacts_create`

Params:

```json
{
  "head": {
    "displayName": "…", "givenName": "…", "middleName": "…", "familyName": "…",
    "namePrefix": "…", "nameSuffix": "…", "nickname": "…",
    "organization": "…", "jobTitle": "…", "note": "…"
  },
  "values": [ { "kind": "email", "label": "home", "value": "max@example.org" } ]
}
```

- Every `head` field and `head` itself may be absent. Unknown fields at any level are rejected (`Validation`), notably `groups`, `targets` and anything about a photo.
- `kind` is one of `phone`, `email`, `address`, `website`, `im`, `sip`, `event`, `relation`, `custom`. The kinds `holzi_vault`, `holzi_nostr_relay`, `holzi_iroh` and any unknown kind are rejected.
- `label` and `value` follow the host's own rules per kind (`kinds::validate`): labels from the host's set or `custom:<text>`; values of `address`, `im` and `event` are JSON objects as text.
- The contact needs a name part, an organization, a phone or an e-mail value, else `Validation`.
- Groups: if the grant's scope is `Groups(g…)`, the contact is created in those groups; for `All` and `AllExcept` it is created in none. A grant that cannot cover the new contact answers 1002.
- The origin of the contact records the calling extension (as the service does for any caller).

Result: the created contact in the shape of `ContactDetail` (the same shape `extension_contacts_read` answers, scoped as that is).

## `extension_contacts_update`

Params:

```json
{
  "id": "…",
  "values": {
    "upsert": [ { "id": "<value id>", "kind": "email", "label": "work", "value": "new@example.org" },
                { "kind": "email", "label": "home", "value": "other@example.org" } ],
    "remove": [ "<value id>" ]
  }
}
```

- `values` may omit `upsert` or `remove`; an `upsert` with an `id` changes that value (its `kind` must match), one without adds a value at the end of its kind; `position` is accepted as in the service.
- `label` is optional in an `upsert` **with an `id`**: when it is omitted the value's label **as it is when the call arrives** is kept, so a replace that names only the new address cannot write back a label the person changed in the meantime. An `upsert` without an `id` needs a `label`.
- Nothing is changed that is not named. The change is applied to the contact as it is when the call arrives; no version of an earlier read is checked.
- A value `id` the contact does not hold: `Validation` with `details.reason = "value_not_found"`; nothing is written (the whole call is one transaction, as in the service). Reaching this answer means the contact itself was in scope, so it reveals nothing hidden.
- A value of a kind the host does not know is never changed or removed (`ContactsUnknownKindReadOnly`, as in the service); adding next to it is fine.
- After the change the contact still needs a name, organization, phone or e-mail, else `Validation` and nothing is written (the service already checks this in the transaction).
- Same field and kind restrictions as `create`; head fields and `groups` are not accepted.

Result: the changed contact as `ContactDetail`.

## `extension_permissions_open_settings`

Params: `{}`. Makes the host emit an event naming **the calling extension's id from the frame session** (never one from the params); the window opens that extension's page of the settings with `?section=permissions` and raises itself, as `extension-open-model-settings` does for the models. The page scrolls to its permissions section.

Result: `{}`. Works for any calling extension and any permission.

## Host-side checks to write (not an implementation)

- Contacts permission: `readWrite` parses; `write` still does not; a manifest with both rows yields two rows; the test that said "a write never becomes a permission" is changed to say what is true now.
- Create/update: no grant → 1004 naming `readWrite`; `denied` → 1002 without a question; `read` only → refused as for no write grant; `readWrite` → works.
- Create/update: unknown fields, `holzi_*` kinds and unknown kinds refused; `targets` and `groups` unreachable for an extension.
- Group scope: create lands in the scope's groups; update of a contact outside the scope answers like a missing one; the read grant and the write grant can have different scopes.
- Update: replace of an existing value changes only that row; a vanished value id answers `value_not_found` and writes nothing; removing the last identity is refused.
- The 1004 for a write call is answered with the key `contacts:readWrite:<target>` so that the SDK's waiter, which keys on that triple, repeats the right call.
- `extension_permissions_open_settings`: the event carries the session's extension id; the settings page opens on the permissions section.
