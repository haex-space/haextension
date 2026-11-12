# Data Model: haex-mail — contacts from the address book

**No table, no migration, no stored state.** The address book is the host's; haex-mail holds only what a dialog needs while it is open. Everything below lives in memory, in `app/lib` as plain types, and is gone when the dialog or the message closes.

## Reads from the host (SDK types, unchanged)

`ContactSummary` (what a search returns) and `ContactDetail` (what a read returns) are the SDK's types (`src/types/contacts.ts` of `haex-space/vault-sdk`). haex-mail uses `id`, `displayName`, `organization`, `emails` of a summary, and `values` (`id`, `kind`, `label`, `value`) of a detail, to show the addresses of a contact and to name the value to replace.

## In haex-mail

### RecipientToken

The entry of a recipient field the caret is in.

| Field | Type | Meaning |
|-------|------|---------|
| `start`, `end` | number | Range of the entry in the field text, trimmed of surrounding blanks and separators. |
| `text` | string | The entry as typed; what is searched. Empty text asks for nothing. |

Rule: entries are split as `parseAddressList` splits them (at `,` and `;` outside double quotes and angle brackets). A caret between two entries belongs to the one before it.

### Suggestion

One row of the list.

| Field | Type | Meaning |
|-------|------|---------|
| `contactId` | string | The contact it comes from. |
| `name` | string | The contact's display name. |
| `email` | string | One address of the contact. |
| `rank` | 0 \| 1 \| 2 | 0: the name or address starts with the token; 1: a word of the name starts with it; 2: it only contains it. Orders the list, then `name`, then `email`. |

Rules: one row per (contact, address); a contact without an address yields none; at most ten rows are shown; two rows with the same address (ignoring case) from different contacts are both kept, since the person may mean either.

### ReadState (of one compose dialog)

`"unknown" | "on" | "off"`. `off` is set by a 1002 from a search and blocks further searches until the dialog is opened again (FR-021, FR-022). It is not persisted.

### SaveTarget

The address a person chose to save, from one message.

| Field | Type | Meaning |
|-------|------|---------|
| `email` | string | As the mail gave it. Compared ignoring case. |
| `name` | string \| undefined | The display name the mail gave, if any. |

A target is valid when `email` passes the same test the compose dialog uses for an address (`parseAddressList`'s bare-address rule). The addresses of the person's own accounts are never offered.

### ContactDraft (the form for a new contact)

| Field | Type | Meaning |
|-------|------|---------|
| `head` | `{ displayName, givenName, middleName, familyName, namePrefix, nameSuffix, nickname, organization, jobTitle, note }` | All optional text. `displayName` starts as the name the mail gave, or empty. |
| `rows` | `ValueRow[]` | The values. Starts with one e-mail row holding the address, label `home`. |

`ValueRow`: `{ key, kind, label, input }`, where `kind` is one of `phone`, `email`, `address`, `website`, `im`, `sip`, `event`, `relation`, `custom`, `label` is the kind's label or `custom:<text>`, and `input` is the shape the kind takes:

| Shape | Kinds | Holds |
|-------|-------|-------|
| text | phone, email, website, sip, relation, custom | one string |
| address | address | `street`, `pobox`, `neighborhood`, `city`, `region`, `postcode`, `country` |
| messenger | im | `service`, `handle` |
| date | event | `date`: `YYYY-MM-DD`, or `--MM-DD` without a year |

Conversion to the host's `{kind, label, value}` (the value of address, messenger and date shapes is a JSON object holding only the filled parts): a row with no content is dropped. The draft is valid for sending when at least one of: a name part, `displayName`, `organization`, a phone row or an e-mail row remains (as the host requires); otherwise the confirm button explains what is missing and nothing is sent.

Validation of the contents of a value (a date's month, an address with no part, an e-mail without `@`) stays with the host; the form shows its reason next to the row on a `Validation` answer.

### EmailChange (adding to or replacing on an existing contact)

| Field | Type | Meaning |
|-------|------|---------|
| `contactId` | string | The chosen contact. |
| `mode` | `"add"` \| `"replace"` | |
| `replaceValueId` | string \| undefined | The `id` of the e-mail value to replace; set exactly when `mode` is `"replace"`. |
| `email` | string | The address to write; label for an added value is `home`, a replaced value keeps its label. |

Rules: `add` is refused locally when the contact already holds the address (ignoring case); `replace` sends an `upsert` with the old value's `id` and `kind`, so only that row changes. Nothing else of the contact is in the request.

### SaveOutcome

What the dialog shows after a try; produced by one pure function from the error or result.

| Outcome | When | Dialog does |
|---------|------|-------------|
| `saved` | The host answered with the contact. | Closes, toast naming the contact (FR-016), clears the lookup cache. |
| `already` | The contact already holds the address (found before sending, or the host's answer shows it). | Says so; nothing is written. |
| `switched-off` | 1002 on create; 1002 on update with a successful read probe (R-4). | Stays open; note that writing contacts is off or limited; button to the permission settings (FR-020). |
| `not-answered` | The prompt error after the 5-minute wait. | Stays open; note that the question was not answered; can be tried again. |
| `contact-gone` | 1002 on update and the read probe fails. | Stays open at the choice of contact; note that it is no longer available. |
| `value-gone` | `Validation` with `reason: "value_not_found"`. | Reloads the contact and shows its current addresses; nothing written. |
| `invalid` | Other `Validation`. | Stays open; shows the host's reason. |
| `host-too-old` | 8000 (not supported). | Stays open; note that a newer holzi is needed (FR-028). |
| `failed` | Anything else. | Stays open; the plain message from `getErrorMessage`. |

## Writes to the host

Only the three calls of [contracts/host-bridge.md](contracts/host-bridge.md); nothing is kept locally, so there is nothing to migrate, sync or clean up.

## Lifecycle

- `ReadState` and the suggestion list belong to one compose dialog and end with it.
- The lookup cache (address → contacts holding it) belongs to the open message and to the save dialog; any save empties it.
- A `ContactDraft` and an `EmailChange` belong to one save dialog; closing it without confirming drops them (Story 2 scenario 6, Story 3 scenario 8).
