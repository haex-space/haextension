# Research: haex-mail — contacts from the address book

Facts checked on 2026-11-12 against these revisions:

- haextension `main` at d07e181 (apps/haex-mail as it is).
- `haex-space/haex-vault` at cc609e82dac86a7bc119db445197214052115ca4 — the host (holzi). Paths below are relative to that repository.
- `haex-space/vault-sdk` at 1af55e9d95858db14603b984394e1235c145de93, released as 5.5.0. Paths below are relative to that repository.

## R-1: Three parts, three repositories

- **Decision**: The feature ships as three changes, in this order: the host (`haex-vault`), the SDK (`vault-sdk`, minor release 5.6.0), haex-mail (this repository). The host part gets a spec and an ADR of its own in the host repository, written against FR-023 to FR-029 of this spec; the SDK part is a pull request with the tests and README of FR-027; haex-mail starts once 5.6.0 is released.
- **Rationale**: haex-mail cannot be tested end to end against anything older, and the SDK cannot be released before the host contract is fixed. The three repositories have their own release tooling (the SDK uses release-please on Conventional Commits, so a `feat` commit is a minor release).
- **Alternatives considered**: *One spec for all three in one repository*: the host's own process (spec numbering, ADRs, Rust checks) would not see it. Rejected. *haex-mail first against a stub*: a stub hides the one thing that matters here, the real permission dialog. Rejected.
- **How haex-mail is built before the release**: this repository pins the SDK in its root `package.json` (`pnpm.overrides`: `@haex-space/vault-sdk` and `haex-mail>@haex-space/vault-sdk`). The implementation bumps both once 5.6.0 exists; until then a local link (never committed) is used for development.

## R-2: The permission is two rows, and it reverses a recorded decision

- **Found**: A `contacts` permission exists with the action `read` only (`src-tauri/src/extensions/permissions/model.rs`, `Action::parse`). The manifest mapping treats `readWrite` and `write` for `contacts` as invalid, and a test says so (`manifest_map_tests.rs`, `contacts_are_read_only_of_all_or_of_a_group`). That follows spec 051 FR-029 of the host: "Extensions MUST NOT change contacts in this spec." The grants an extension reaches the service with are built from `read` rows only (`src-tauri/src/extensions/contacts.rs`, `grants_of`). The host's own service already checks `ReadWrite` for every caller (`src-tauri/src/contacts/access.rs`, `authorize_create`, `authorize_write`), so the check exists and only the way in is closed.
- **Decision**: `readWrite` becomes a valid action of `contacts`, with the same targets (`*` or a group) and the same three states as every other permission. `readWrite` covers `read` (that is what `Action::covers` already says). haex-mail declares **two rows**: `read` for `*` and `readWrite` for `*`. The person sees two separate permissions in the install dialog and in the extension's settings, so reading can be granted without writing (FR-017). The host marks the former decision as superseded in an ADR (next free number in `docs/adr/`) and changes the test above to say `readWrite` is valid and `write` is not.
- **Rationale**: The service needs no new rule, only the grants of the `readWrite` rows. Two rows give exactly the split the spec asks for without a new concept in the permission model.
- **Alternatives considered**: *One permission "contacts" with a flag*: a new concept next to `read`/`readWrite` that every other kind already has. Rejected. *Make `readWrite` only for the person's own window and agents*: that is the status quo.

## R-3: The permission dialog and the retry are the SDK's

- **Found**: On a call without a grant the host answers 1004 (`PermissionPromptRequired`) with `details {resourceType, action, target}` and puts the question before the person (`src-tauri/src/extensions/bridge/dispatch.rs` calls `permissions::ask`). The SDK's `client.request()` waits for the event `extension:permission-resolved` and **repeats the call on a grant**, rejects with 1002 on a denial, and rethrows the prompt error after 5 minutes without an answer (`src/client/permissionRetry.ts`, `withPermissionRetry`). The dialog offers Allow and Deny with a "remember" box; closing it cancels and never denies (`src/components/extensions/PermissionRequestDialog.vue` of the host).
- **Decision**: haex-mail does **not** build a wait-and-retry of its own. `createAsync` and `updateAsync` are awaited like any other call: they resolve after a grant, reject with 1002 after a denial or when the state already is "denied", and with the prompt error after the timeout. FR-019 is met by the SDK once the host answers 1004 with `action: "readWrite"` for a write call (host contract, [contracts/host-bridge.md](contracts/host-bridge.md)).
- **Consequence for the form**: while the dialog is open the save promise is pending, so the form shows a busy state on its confirm button and keeps all input; a timeout is shown like a refusal ("not answered").
- **Alternatives considered**: *haex-mail checks the permission first and asks*: there is no check call for contacts, and a second source of truth would disagree with the host's. Rejected.

## R-4: A denial and a missing contact look the same, so the form probes

- **Found**: For a contact outside the grants or a missing one the host answers 1002, the same code as a refused permission, by design (spec 051 FR-031: no answer may reveal whether a contact exists). `map_error` in `src-tauri/src/extensions/contacts.rs` maps `ContactsNotFound` to `denied()`.
- **Problem**: Story 3 scenario 6 wants "the contact is gone" told differently from Story 4 scenario 5 "writing contacts is switched off". For `update` both arrive as 1002.
- **Decision**: On a 1002 from `updateAsync(id, …)` haex-mail **reads the contact** (`readAsync(id)`). If the read succeeds, the contact is there and writing is the thing that is off or limited: show the note with the button to the permission settings (FR-020). If the read fails too (1002 or not found), the contact is gone or out of reach: show "this contact is no longer available" and offer to choose again. A 1002 from `createAsync` is always the permission, because a create names no contact.
- **Rationale**: It costs one extra call only on a failure and needs no host change, and it keeps the host's rule that a missing contact and a hidden one answer alike. A write limited to a group (read for `*`, write for one group) falls into the first case, which is the right message ("limited").
- **Alternatives considered**: *A new error code for "write not granted"*: it would let an extension tell a denial from a missing contact for create/update only, but a denied read still must not be told apart, and the rule is easier to keep whole. Rejected for now.

## R-5: A value that is gone needs a reason of its own

- **Found**: `update` with an `upsert` or `remove` that names a value id the contact does not hold fails with `ContactsNotFound` (`src-tauri/src/contacts/service/contacts.rs`, `owned_value_kind`), which the bridge turns into 1002 (R-4). The check runs after the contact itself was authorised, so the answer reveals nothing the caller could not read.
- **Decision**: The service gets its own error for "this contact has no such value", and the bridge answers it as a validation error (the host's `Validation` code) with `details.reason = "value_not_found"`. FR-024's "a value to replace or remove that no longer exists MUST be reported" is met by it; haex-mail shows scenario 7 of Story 3 and reloads the contact.
- **Alternatives considered**: *haex-mail reads the contact first and sends the replace only if the value is still there*: a race between the read and the write remains, and the host is the only place that can decide atomically. Rejected.

## R-6: What an extension may send — a smaller input than the service takes

- **Found**: The service's `ContactInput` carries `groups` and `targets` (phones), and `ContactPatch` carries head fields, `groups` and value changes. `create` already refuses `targets` for any caller that is not the person (`require_user`); `set_photo` is for the window only.
- **Decision**: The bridge parses its own, smaller types and rejects unknown fields:
  - `extension_contacts_create` takes `head` (the ten head fields) and `values` (`kind`, `label`, `value`). No `groups`, no `targets`, no photo.
  - `extension_contacts_update` takes `id` and `values {upsert, remove}`. No head fields, no groups.
  - Kinds the host keeps for itself are refused for an extension: the three `holzi_*` kinds (they come from a Visitenkarte). The nine others may be written.
  - **Group scope**: when the grant covers groups (`Scope::Groups`), the new contact is put into those groups by the host, because `authorize_create` refuses a contact that is not covered. For `All` and `AllExcept` the contact gets no group.
- **Rationale**: FR-015, FR-025 and the spec's out-of-scope list say it; accepting only what is allowed is simpler to test than accepting everything and refusing parts. Head-field changes of an existing contact are not needed (the spec limits that form to e-mail addresses), so they are not built.
- **ponytail**: Values-only `update` is the smallest thing that serves "add" and "replace". The ceiling is a later feature that edits more of an existing contact; the upgrade is to accept the head fields the service already takes.

## R-7: Opening the permission settings is one generic call

- **Found**: There is a precedent. `extension_model_settings_open` makes the host emit `extension-open-model-settings` with the calling extension's id, and the window opens that extension's page with `?section=models` (`src-tauri/src/model_jobs/access.rs`, `src/composables/useExtensionHost.ts`); the SDK exposes it as `ModelsAPI.openSettingsAsync` (`src/api/models.ts`). The extension's detail page has a permissions section (`ExtensionPermissionsView.vue`) but scrolls only to `models` today.
- **Decision**: One generic call, `extension_permissions_open_settings` (host) and `PermissionsAPI.openSettingsAsync()` (SDK), that opens the calling extension's page with `?section=permissions`. The id always comes from the frame session, never from the caller (as in the precedent), so an extension can only open its own. The detail page learns to scroll to that section.
- **Rationale**: The page it opens is the extension's permissions, nothing about contacts, and the same call serves any permission a person denied. It costs the same as a contacts-only call.
- **Alternatives considered**: *`ContactsAPI.openSettingsAsync`*: ties a general need to one kind. Rejected.

## R-8: Suggestions — ask the host per query, rank here

- **Found**: `searchAsync(query, limit?)` matches name, organization, phone number and e-mail address, regardless of case and accents; the host's default limit is 20 and its maximum 200; a hit carries the contact's `emails` (`src-tauri/src/extensions/contacts.rs`, `search`; `src/api/contacts.ts` of the SDK). `listAsync` pages 100 at a time.
- **Decision**: One `searchAsync(token, 20)` per pause in typing (150 ms), the newest query wins and an older answer is dropped. The answer is turned into suggestions here: one per (contact, address), contacts without an address dropped, names or addresses that **start with** the token before those that contain it, then by name, at most ten shown. Nothing is cached between keystrokes and no list of all contacts is held, so a contact saved a moment ago is found at once (FR-006) and nothing outlives the dialog.
- **Rationale**: The host already does the folding and the scope; a cache would need its own invalidation. `list` would move the whole address book into the frame for a feature that needs a handful of rows.
- **Not verified** `[Guessing]`: that the host's search answers within 0.3 s with 5,000 contacts (SC-001). The quickstart measures it on a seeded address book. If it does not hold, the fallback is one `listAsync` sweep per compose dialog into memory (about 50 pages of 100) with the ranking done here; the pure ranking module is the same either way.
- **Permission state**: a 1002 on the first search means read is off. The compose dialog keeps `readState = "off"` until it is opened again, so a refusal is not asked again per key (FR-022) but a change made in holzi is noticed with the next dialog (FR-021). The "ask" case is the SDK's wait (R-3): the first search stays pending while the host's dialog is open, typing goes on, and the answer for the newest token is applied if it is still current when it arrives.

## R-9: Finding the contact of an address, and "already saved"

- **Decision**: `searchAsync(address, 50)`, then keep the hits whose `emails` hold the address **exactly, ignoring case**. The result per address is kept for the open message and dropped after any save, so the menu is not delayed on every open (FR-009, FR-013). The same comparison decides "already on this contact" when adding.
- **Rationale**: The host searches by "contains", so a short address returns neighbours; the exact test belongs here. 50 is more than the contacts of one address can be and well below the host's maximum.

## R-10: The suggestion list is a popover over the existing input

- **Found**: The recipient fields are plain `UiInput` bound to strings; the text is parsed on send (`parseAddressList` in `lib/address.ts`). `packages/haex-ui` has `popover` (with `Anchor`) and `command` components; `command` brings its own input, which would take the focus from the field.
- **Decision**: `RecipientInput.vue` keeps the `UiInput` (so focus, caret and IME behave as before), anchors a popover to it with the focus kept in the input (`open-auto-focus` prevented), and renders the rows itself as a listbox with `aria-activedescendant`. Keys: ArrowDown/ArrowUp move, Enter and Tab take, Escape closes. The `command` component is not used.
- **Rationale**: A listbox of at most ten rows needs no filtering (the host did it), so `command`'s search is dead weight and its input is in the way. This follows ponytail: no new dependency, no new abstraction.
- **Alternatives considered**: *`command` with `shouldFilter` off and its input hidden*: fights the component's focus model. Rejected.

## R-11: Which part of the field is the address being typed

- **Decision**: Pure functions in `lib/address.ts`: `recipientAt(text, caret)` returns the range and the text of the entry the caret is in (entries split as `parseAddressList` splits them, outside quotes and angle brackets), and `insertRecipient(text, range, address)` returns the new text and caret with `Name <email>, ` written in place. `formatRecipient` writes the display name in quotes when it holds a comma, a quote, a semicolon or angle brackets, escaping `"` and `\`. The existing `formatAddressList` is **not** changed: it is for display and quoting there would show quotes to the reader.
- **Rationale**: `splitAddresses` and `unquote` already live in `address.ts`; extending the file keeps one definition of how a field is split.

## R-12: The form for a new contact

- **Found**: The host validates every value by kind and label (`src-tauri/src/contacts/kinds.rs`): labels are `home`, `work`, `mobile`, `other`, the kind's own (phone: `main`, `fax_work`, …; event: `birthday`, `anniversary`; relation: a fixed list), or `custom:<text>`; a `custom` value must carry `custom:<name>`. Values are text for phone, e-mail, web site, SIP and relation, but **JSON objects** for a postal address (`street`, `pobox`, `neighborhood`, `city`, `region`, `postcode`, `country`), a messenger (`service`, `handle`) and an event (`date` as `YYYY-MM-DD` or `--MM-DD`). The window offers exactly these in `src/lib/contacts/kinds.ts`, with the first label as the default (`home` for e-mail, `mobile` for phone).
- **Decision**: haex-mail has its own small table of kinds (`lib/contactKinds.ts`: the label set and the input shape per kind, the first label the default) and one pure function per shape that turns the form row into the `{kind, label, value}` the host takes. The e-mail prefilled from the mail is a normal row with label `home` and can be changed or removed. The form is split into `ContactForm.vue` (head fields, the list of rows) and `ContactValueRow.vue` (one row, with its text, address, messenger or date input). A row the person leaves empty is dropped, not sent.
- **Rationale**: haex-mail cannot import from the host or the window; the host validates anyway, so the table only decides what the form offers. Labels the person types become `custom:<text>`.
- **Alternatives considered**: *Free-text value for every kind*: the host rejects a postal address that is not JSON. Rejected. *Put the kind table in the SDK*: a second consumer would be needed to justify it; the SDK exports the types (R-13). Kept local.
- **Spec adjustment**: FR-008a said "a label of the person's choosing"; it is a choice among the host's labels or an own name (`custom:`). The assumption about the default label is settled as `home`. Both changed in the spec.

## R-13: What the SDK adds

- **Decision**: In `ContactsAPI`: `createAsync(input): Promise<ContactDetail>` and `updateAsync(id, change): Promise<ContactDetail>`; in `PermissionsAPI`: `openSettingsAsync()`. In the types: `ContactCreateInput`, `ContactValueInput`, `ContactValuesChange`, a `ContactValueKind` union, and `contacts?: { target; action?: "read" | "readWrite" }[]` in the manifest type. The doc comment that says "Extensions cannot change contacts" is rewritten, and the README gets the permission and both calls. Tests beside the existing `contacts.test.ts`. The API wraps `client.request` and adds nothing of its own: errors and the prompt retry are the client's (R-3).
- **Release**: a `feat(contacts):` commit is a minor release by release-please (5.6.0).

## R-14: Sizes of the files this touches

- `ComposeDialog.vue` has 541 lines and `MessageView.vue` 430. The change **removes** lines from both: three `UiInput` become three `RecipientInput`, and the From/To/Cc block of the message header moves into `MessageAddresses.vue`, which holds the per-address menu. Neither grows, so the 500-line rule does not get worse. The 541 lines of the dialog are an existing matter that spec 022 plans to resolve; this feature does not add to it.
- New haex-mail files stay small by construction: pure logic in `app/lib` with tests beside it, one store, five components.

## R-15: Testing

- **haex-mail**: Vitest 3, `environment: node`, tests beside the modules in `app/lib` and `app/stores`, as `apps/haex-mail/vitest.config.ts` has it. The pure modules (token, ranking, exact lookup, form-to-input, patch building, error classification) carry the logic; the store is tested over a fake of the contacts API (the way `haex-doom` types its `ContactsSource`). The wiring of the components and the dialog of the host are checked by hand ([quickstart.md](quickstart.md)).
- **SDK**: the existing `api/__tests__/contacts.test.ts` style (a mocked client) for the two calls and for `openSettingsAsync`.
- **Host**: Rust tests in `extensions/contacts_tests.rs` (create and update with and without the grant, group scope, refused kinds, refused fields, value not found, the 1004 answer for `readWrite`) and `manifest_map_tests.rs`; the host's frontend scripts for the settings page section.

## R-16: Graphify consultation (constitution)

Run on the worktree's snapshot (`graphify-out/graph.json`, 8,887 nodes; fork-point snapshot used as-is). Queries: "recipient address autocomplete suggestions popover command list", "contacts read search sdk client contacts api", "permission denied error message toast getErrorMessage", "parse and format email address list name email". Each answer was truncated to the token budget; the candidates below are the ones it named that matter.

| New artifact | Candidates evaluated | Outcome |
|--------------|----------------------|---------|
| `recipientAt`, `insertRecipient`, `formatRecipient` | `parseAddressList`, `formatAddressList`, private `splitAddresses`, `unquote` in `lib/address.ts` | **Extend the file**: the split rules are reused, not copied. `formatAddressList` is deliberately left alone (R-11). |
| `RecipientInput.vue` | `UiInput`, `popover/Anchor.vue`, `popover/Content.vue`, `command/*` in `packages/haex-ui`; the three recipient `UiInput` in `ComposeDialog.vue` | **Reuse** input and popover; `command` evaluated and rejected (R-10); the dialog's three inputs are replaced, not paralleled. |
| `lib/contactSuggest.ts`, `lib/contactLookup.ts` | `listInvitableContacts` and `ContactsSource` in `apps/haex-doom/app/lib/contacts.ts` | **Independent**: it lists and reads contacts for invitations; nothing there searches, ranks or matches an address. Another app, so not importable. The structural `ContactsSource` idea (a typed slice of the API, faked in tests) is reused. |
| error classification (`lib/contactSave.ts`) | `getErrorMessage` in `lib/utils.ts`; `deniedPermission` handling in `apps/haex-files/app/components/drawer/Permission.vue`; `isPermissionDeniedError`, `isPermissionPromptError` of the SDK | **Reuse** `getErrorMessage` for the plain reason and the SDK's guards for the codes; haex-files' drawer is a different app and a different flow (it asks the person to go to the host, this one retries by itself). |
| `stores/contacts.ts` | `useHaexVaultStore` (`stores/haexvault.ts`) for the client, `stores/mail/*` for the shape of a store | **Reuse** the client access; a store of its own because it holds state across components (the read state, the address cache). |
| `MessageAddresses.vue`, `SaveContactDialog.vue`, `ContactForm.vue`, `ContactValueRow.vue` | `formatAddressList` and the From/To/Cc block in `MessageView.vue`; `AccountForm.vue`, `MailboxNameDialog.vue`, `RuleDialog.vue` for dialog and form conventions; `ShadcnDialogConfirm` | **Extend by extraction** for the header block (moved, not copied); the dialogs are **independent** (no contact form exists), built on the same dialog and input components. |
| `lib/contactKinds.ts` | `src/lib/contacts/kinds.ts` of the host (pinned above) | **Independent** by necessity (another repository, a window component); it is the reference the table follows and is named in the file's first comment. |

No candidate was borderline in the sense of the rule: none was close enough to extend and none had to be decided by the operator. The graph is consulted again, per artifact, during implementation.

## R-17: Adjustments this research asks for in the spec

- FR-008a: labels are the host's set or an own name (R-12). Assumption on the default label: `home`.
- FR-014 / Story 3 scenarios 6 and 7: the two failures are told apart as R-4 and R-5 describe; the spec's wording stands, the plan says how.
- Assumptions: "the host (holzi) part is specified in its own numbering" gets the ADR named.
