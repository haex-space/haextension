# Contract: haex-mail modules

The pure modules and the units that carry the logic of FR-001 to FR-022, with the signatures the tests are written against. Paths are relative to `apps/haex-mail/app`. Each `lib` module has its test file beside it (`*.test.ts`). Names are proposals; the graph is consulted again per artifact when it is written.

## `lib/address.ts` (extended)

```ts
interface RecipientRange { start: number; end: number; text: string }

/** The entry the caret is in; `text` is "" for an empty entry. */
recipientAt(text: string, caret: number): RecipientRange

/** `Name <email>` (name quoted when it needs it) or the bare address. */
formatRecipient(address: { name?: string; email: string }): string

/** Writes `address` in place of the range, followed by ", "; returns the new text and caret. */
insertRecipient(text: string, range: RecipientRange, address: { name?: string; email: string }):
  { text: string; caret: number }

/** The bare-address test the dialog already uses on send, exported for the save form. */
isBareAddress(email: string): boolean
```

Tests: caret at start, middle, end and between entries; separators inside quotes and angle brackets do not split; `"Doe, John" <j@x.de>` round-trips through `insertRecipient` and `parseAddressList`; a name with `"` or `\` is escaped; names without special characters are not quoted; an empty field.

## `lib/contactSuggest.ts`

```ts
interface Suggestion { contactId: string; name: string; email: string; rank: 0 | 1 | 2 }

/** One row per (contact, address); ranked as in data-model.md; at most `limit` (default 10).
 *  Drops values that are not bare addresses and hits that match in none of name, organization, address. */
suggestionsFrom(hits: ContactSummary[], token: string, limit?: number): Suggestion[]
```

Tests: accents and case; a contact with two addresses gives two rows; none for a contact without an address; none for a stored value that is not a bare address (for example `a@x.de, b@y.de`); none for a hit that matched only by phone number; an organization-only match is rank 2; prefix before word-prefix before contains; stable order by name then address; the limit; the same address from two contacts is kept twice.

## `lib/contactLookup.ts`

```ts
/** The hits that hold `email` exactly, ignoring case. */
contactsHolding(hits: ContactSummary[], email: string): ContactSummary[]
```

Tests: exact match only, not a longer address that contains it; case; whitespace around the stored value.

## `lib/contactKinds.ts`

The kinds and their labels and input shapes (data-model.md), the first label the default, and:

```ts
type ValueRow = { key: string; kind: ContactValueKind; label: string; input: RowInput }

/** The host's `{kind, label, value}` for a row, or null for an empty row. */
rowToValue(row: ValueRow): ContactValueInput | null
```

Tests: a text row; an address row keeps only filled parts and is a JSON object; a messenger needs both parts or is reported as incomplete; a date row with and without a year; an empty row gives null; a typed label becomes `custom:<text>`; a `custom` row without a name is reported incomplete.

## `lib/contactSave.ts`

```ts
/** The body of `createAsync`: head (empty fields dropped) and values; the error names what is missing. */
buildCreate(draft: ContactDraft): { input: ContactCreateInput } | { missing: "identity" | "row"; row?: string }

/** The body of `updateAsync` for an EmailChange; "already" when the contact holds the address. */
buildEmailChange(contact: ContactDetail, change: EmailChange):
  { values: ContactValuesChange } | { already: true } | { gone: true }

/** What the dialog shows for an error; `probe` is the result of the read after a 1002 on update. */
classifySaveError(error: unknown, ctx: { op: "create" | "update"; contactReadable?: boolean }): SaveOutcome
```

Tests: `buildCreate` drops empty head fields and rows, refuses a draft with no identity, keeps no groups or targets; `buildEmailChange` for add (new address, `home`), for add of an address the contact holds in another case (`already`), for replace (the old value's id and kind, no label so the host keeps the current one, nothing else in the request), for replace of an id the contact no longer has (`gone`); `classifySaveError` for each outcome of data-model.md, with 1002 on create (switched-off), on update with and without a readable contact, the prompt error, `value_not_found`, 8000, another `Validation`, an unknown error.

## `stores/contacts.ts`

```ts
useContactsStore(): {
  readState: Ref<"unknown" | "on" | "off">
  resetReadState(): void                                   // called when the compose dialog opens
  suggestAsync(token: string): Promise<Suggestion[]>       // searchAsync(token, 200) + suggestionsFrom; [] when off
  holdersAsync(email: string): Promise<ContactSummary[]>   // searchAsync(email, 200) + contactsHolding, cached
  searchAsync(query: string): Promise<ContactSummary[]>    // for "add to existing", limit 20
  readAsync(id: string): Promise<ContactDetail>
  createAsync(draft: ContactDraft): Promise<SaveOutcome>
  changeEmailAsync(change: EmailChange): Promise<SaveOutcome>  // reads the contact first, then buildEmailChange on that copy
  openPermissionSettingsAsync(): Promise<"opened" | "host-too-old">
}
```

The store takes the SDK's contacts and permissions API through a typed slice (`ContactsSource`, as `haex-doom` does), so the store test runs on a fake. Tests: `suggestAsync` sets `off` on 1002 and returns `[]` without calling the host again until reset; while the first search is pending a second `suggestAsync` does not reach the host (one question to the person, FR-022) and is searched, newest token only, after the first answer; a stale answer is not returned when a newer call exists (the component's token is compared by the caller; the store returns the answer for its own token); `holdersAsync` caches and `createAsync`/`changeEmailAsync` empty the cache on `saved`; `changeEmailAsync` probes with `readAsync` after a 1002 and passes the result to `classifySaveError`; `openPermissionSettingsAsync` maps 8000 to `host-too-old`.

## Components (checked by hand, see quickstart.md)

| Component | Props / events | Notes |
|-----------|----------------|-------|
| `RecipientInput.vue` | `v-model: string`, `placeholder`, `required` | The existing `UiInput` with the popover list; 150 ms debounce; newest token wins; keys as in research R-10. Replaces the three inputs in `ComposeDialog.vue`. |
| `MessageAddresses.vue` | `envelope` | The From/To/Cc rows of `MessageView.vue`, each address with a menu "Save to contacts" (own addresses excluded, FR-007); opens `SaveContactDialog`. |
| `SaveContactDialog.vue` | `target: SaveTarget`, `open` | Two choices: new contact, add to existing; shows "already saved under" when `holdersAsync` finds the address (FR-009). Owns the busy state and the outcome notes. |
| `ContactForm.vue` | `v-model: ContactDraft` | Head fields and the list of rows with an "add" menu of kinds. |
| `ContactValueRow.vue` | `v-model: ValueRow` | The input for the row's shape; label select with "other …" for an own name. |

Texts: in-file `<i18n lang="yaml">` with `de` and `en` blocks per component, as the existing components have them (FR-030).
