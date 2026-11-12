---

description: "Task list for haex-mail — contacts from the address book"
---

# Tasks: haex-mail — contacts from the address book

**Input**: Design documents from `specs/023-haex-mail-contacts/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. The plan names a test beside every logic module (constitution: one runnable check for non-trivial logic) and the contracts list the cases. Tests of a module are written first and must fail before its implementation.

**Organization**: Tasks are grouped by user story. The feature lies in three repositories; a task names its repository when it is not this one. Paths in the host repository (`haex-space/haex-vault`) and in the SDK repository (`haex-space/vault-sdk`) are relative to that repository; all other paths are relative to the root of this repository. Every artifact the tasks author in haex-mail is first looked up in the graph (`graphify query "<intent>"`, `graphify explain <symbol>`) and extended when a candidate fits (constitution); research R-16 lists the candidates already evaluated.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on open tasks)
- **[Story]**: The user story the task belongs to (US1 to US4)
- Commit messages are Conventional Commits with no reference to authoring tooling; pull requests are merged with rebase or a merge commit, never squashed.

---

## Phase 1: Setup

**Purpose**: Worktrees on topic branches in all three repositories (constitution: no authoring in a primary checkout).

- [ ] T001 In the host repository (`haex-space/haex-vault`) create a worktree on the topic branch `feat/extension-contacts-write` and confirm it with `git worktree list`
- [ ] T002 [P] In the SDK repository (`haex-space/vault-sdk`) create a worktree on the topic branch `feat/contacts-write` and confirm it with `git worktree list`
- [ ] T003 [P] In this repository confirm `.worktrees/haex-mail-contacts` is registered by `git worktree list`, run `pnpm install`, and run `pnpm --filter haex-mail test` once to record the baseline (all green before any change)

---

## Phase 2: Foundational — the write path in the host and the SDK

**Purpose**: What creating and changing a contact needs outside haex-mail ([contracts/host-bridge.md](contracts/host-bridge.md), [contracts/sdk-api.md](contracts/sdk-api.md)).

**⚠️ CRITICAL**: US2, US3 and US4 cannot start before T021. **US1 is exempt**: it needs only reading, which the released SDK 5.5.0 already has, so it may start right after Phase 1.

### Host (`haex-space/haex-vault`)

- [ ] T004 Write the host's own spec for FR-023 to FR-026 and FR-029 with that repository's speckit flow (next free number under `specs/`), taking [contracts/host-bridge.md](contracts/host-bridge.md) as its source, and write `docs/adr/` (next free number) "Extensions may change contacts" that supersedes spec 051 FR-029 ("Extensions MUST NOT change contacts") and says why
- [ ] T005 [P] Update the tests first: in `src-tauri/src/extensions/permissions/manifest_map_tests.rs` replace `contacts_are_read_only_of_all_or_of_a_group` so that `readWrite` and `read_write` for `contacts` map to `Action::ReadWrite` for `*` and for a group, `write` and an empty target stay invalid, and a manifest with both a `read` and a `readWrite` row yields two permissions; adjust `src-tauri/src/extensions/permissions/model_tests.rs` and `target_tests.rs` where they list `contacts` + `readWrite` as refused. The tests fail before T006
- [ ] T006 Make `readWrite` a valid action of `contacts`: `Action::parse` in `src-tauri/src/extensions/permissions/model.rs` (`(K::Contacts, "readWrite") => Some(Self::ReadWrite)`) and the manifest mapping in `src-tauri/src/extensions/permissions/manifest_map.rs`; the default action stays `read`
- [ ] T007 Write failing tests in `src-tauri/src/extensions/contacts_tests.rs`: a `readWrite` row yields a `ReadWrite` grant and a `read` row a `Read` grant; a write call with the row in `ask` answers 1004 with `details.action = "readWrite"` and the right target; a write call with the row `denied` answers 1002 without a question; a `read`-only extension is refused a write like an extension without a grant; a read call is never answered with a question for `readWrite`
- [ ] T008 Build the grants of both rows and let `refused` take the asked action in `src-tauri/src/extensions/contacts.rs` (`grants_of` stops filtering on `Action::Read`; the 1004 names `readWrite` for a write call); T007 passes
- [ ] T009 [P] Write failing service tests in `src-tauri/src/contacts/service/contacts_tests.rs`: an `upsert` or `remove` naming a value id the contact does not hold fails with a new error `ContactsValueNotFound`, writes nothing, and a missing contact still fails with `ContactsNotFound`
- [ ] T010 Add `ContactsValueNotFound` to `HolziError` in `src-tauri/src/error.rs`, return it from `owned_value_kind` in `src-tauri/src/contacts/service/contacts.rs`, and map it in `map_error` of `src-tauri/src/extensions/contacts.rs` to the `Validation` code with `details.reason = "value_not_found"`; T009 passes
- [ ] T011 Write failing bridge tests in `src-tauri/src/extensions/contacts_tests.rs` for `extension_contacts_create`: no grant → 1004; granted → creates and answers the `ContactDetail` shape; unknown fields (`groups`, `targets`, a photo) rejected; kinds `holzi_vault`, `holzi_nostr_relay`, `holzi_iroh` and an unknown kind rejected; a contact with no name part, organization, phone or e-mail rejected; with a `Groups` scope the contact lands in those groups, with `All` in none; a scope that cannot cover the contact answers 1002; the origin records the calling extension
- [ ] T012 Implement `extension_contacts_create` in `src-tauri/src/extensions/contacts.rs` with its own input type (`head` of ten optional fields, `values` of `kind`, `label`, `value`; unknown fields denied), the kind allowlist of nine kinds, and the group assignment of research R-6; register it in `src-tauri/src/extensions/bridge/allowlist.rs`; T011 passes
- [ ] T013 Write failing bridge tests in `src-tauri/src/extensions/contacts_tests.rs` for `extension_contacts_update`: `upsert` with an id changes only that row and its `kind` must match; `upsert` without an id appends; `remove`; the change is applied to the contact as it is when the call arrives (a head field changed meanwhile is kept); `head` and `groups` in the params rejected; a contact outside the grants answers 1002 exactly like a missing one; removing the last identity rejected and nothing written; a value of an unknown kind is never changed
- [ ] T014 Implement `extension_contacts_update` in `src-tauri/src/extensions/contacts.rs` (params `id` and `values {upsert, remove}`, unknown fields denied) and register it in `src-tauri/src/extensions/bridge/allowlist.rs`; T013 passes
- [ ] T015 [P] Write failing tests in a new `src-tauri/src/extensions/bridge/permissions_settings_tests.rs` (beside `model_access_tests.rs`, same style) for `extension_permissions_open_settings`: the emitted event carries only the id of the calling extension's frame session, never an id from the params; the answer is `{}`
- [ ] T016 Implement `extension_permissions_open_settings` (handler next to `open_settings` in `src-tauri/src/model_jobs/access.rs` or in `src-tauri/src/extensions/bridge/permissions.rs`, whichever the host's graph shows as the closer sibling), the event `extension-open-permission-settings`, its entry in `src-tauri/src/extensions/bridge/allowlist.rs`, a listener in `src/composables/useExtensionHost.ts` that opens `/extensions/<id>?section=permissions` and raises the window, and the scroll to the permissions section in `src/components/settings/extensions/ExtensionDetailView.vue`; T015 passes
- [ ] T017 In the host run the Rust tests of `extensions` and `contacts` and the scripts `check:extensions` and `check:contacts`; fix what the changed permission model breaks; open the host's pull request (`feat(extensions): let extensions create and change contacts`, ADR and spec included) and name this spec in its description

### SDK (`haex-space/vault-sdk`)

- [ ] T018 [P] Write failing tests: in `src/api/__tests__/contacts.test.ts` (`createAsync` sends `extension_contacts_create` with exactly `{head, values}`, either may be absent, and returns the answer; `updateAsync` sends `{id, values}` for `upsert` with and without `id` and for `remove`; a rejected request reaches the caller unchanged); a new `src/api/__tests__/permissions.test.ts` (`openSettingsAsync` sends `extension_permissions_open_settings` with `{}`); in `src/client/__tests__/permissionRetry.test.ts` one case with `action: "readWrite"` that pins the key `contacts:readWrite:<target>`
- [ ] T019 [P] Add the types to `src/types/contacts.ts` (`ContactValueKind`, `ContactValueInput`, `ContactHeadInput`, `ContactCreateInput`, `ContactValuesChange` as in [contracts/sdk-api.md](contracts/sdk-api.md)), the commands to `src/commands/contacts.ts` and `src/commands/permissions.ts`, export them from `src/index.ts`, and widen the manifest type in `src/types.ts` to `contacts?: { target: string; action?: "read" | "readWrite" }[]`
- [ ] T020 Implement `ContactsAPI.createAsync` and `updateAsync` in `src/api/contacts.ts` and `PermissionsAPI.openSettingsAsync` in `src/api/permissions.ts` as thin calls of `client.request`; rewrite the class comment "Extensions cannot change contacts"; add a "Contacts" section to `README.md` (the two permission rows, the five calls, what a refusal looks like, that a missing contact answers like a hidden one, that groups, phone targets and photos are unreachable, `openSettingsAsync` for a person who denied) and remove the "only read" wording; run `pnpm test`, `pnpm lint`, `pnpm typecheck`
- [ ] T021 Open the SDK's pull request (`feat(contacts): create and change contacts, open the permission settings`), merge it after the host's, and wait for release-please to publish 5.6.0; then in this repository set `@haex-space/vault-sdk` to `^5.6.0` in `apps/haex-mail/package.json` and in the `haex-mail>@haex-space/vault-sdk` entry of `pnpm.overrides` in the root `package.json` (the general `@haex-space/vault-sdk` entry stays at 5.4.2, it holds the other apps), run `pnpm install` and `pnpm --filter haex-mail test`

**Checkpoint**: The host answers the three new methods, the SDK 5.6.0 offers them, haex-mail builds against it.

---

## Phase 3: User Story 1 — Suggestions for recipients from my contacts (Priority: P1) 🎯 MVP

**Goal**: In To, Cc and Bcc the person gets suggestions from the address book, with read access alone.

**Independent Test**: With `read` granted and `readWrite` on ask, typing "must" into To offers "Erika Mustermann" with her address and Enter puts `Erika Mustermann <…>, ` into the field ([quickstart.md](quickstart.md) 1 to 6). Needs no host change and no new SDK.

### Tests for User Story 1 ⚠️ write first, they fail

- [ ] T022 [P] [US1] Add the cases of `recipientAt`, `insertRecipient`, `formatRecipient` and `isBareAddress` to `apps/haex-mail/app/lib/address.test.ts`: caret at start, middle, end and between entries; separators inside quotes and angle brackets do not split; `"Doe, John" <j@x.de>` round-trips through `insertRecipient` and `parseAddressList`; a name holding `"` or `\` is escaped; a name without special characters is not quoted; an empty field; `, ` is written after the inserted recipient
- [ ] T023 [P] [US1] Create `apps/haex-mail/app/lib/contactSuggest.test.ts`: case and accents; one row per (contact, address) so a contact with two addresses gives two rows; a contact without an address gives none; rank 0 (name or address starts with the token) before 1 (a word of the name starts with it) before 2 (contains), then by name, then by address; at most ten rows by default; the same address from two contacts is kept twice; a stored value that is not a bare address and a hit that matched only by phone number give no row; an organization-only match is rank 2
- [ ] T024 [P] [US1] Create `apps/haex-mail/app/stores/contacts.test.ts` over a typed fake of the SDK's contacts slice: `suggestAsync` calls `searchAsync(token, 200)` and returns ranked rows; a 1002 sets `readState` to `"off"` and returns `[]`; while `"off"` the host is not called again; `resetReadState()` makes the next call ask again; a failed call other than 1002 returns `[]` and does not set `"off"`; while the first search is pending a second call does not reach the host and is searched (newest token only) after the first answer, so the person is asked once (FR-022)

### Implementation for User Story 1

- [ ] T025 [US1] Extend `apps/haex-mail/app/lib/address.ts` with `recipientAt`, `insertRecipient`, `formatRecipient` and an exported `isBareAddress` (from the existing `EMAIL_RE`), reusing `splitAddresses` and `unquote`; leave `formatAddressList` unchanged (research R-11); T022 passes
- [ ] T026 [P] [US1] Create `apps/haex-mail/app/lib/contactSuggest.ts` with `suggestionsFrom(hits, token, limit = 10)` as in [contracts/mail-modules.md](contracts/mail-modules.md); T023 passes
- [ ] T027 [US1] Create `apps/haex-mail/app/stores/contacts.ts` with `readState` (`"unknown" | "on" | "off"`), `resetReadState()` and `suggestAsync(token)`, taking the SDK's contacts API through a typed slice like `ContactsSource` in `apps/haex-doom/app/lib/contacts.ts` and reaching the client through `useHaexVaultStore`; T024 passes
- [ ] T028 [US1] Create `apps/haex-mail/app/components/RecipientInput.vue`: the existing `UiInput` with `v-model: string`, `placeholder`, `required`; a popover anchored to it with the focus kept in the input; rows rendered as a listbox with `aria-activedescendant`; 150 ms debounce and the newest token wins (an older answer is dropped); ArrowDown/ArrowUp move, Enter and Tab take, Escape closes without changing the field; touch-tappable rows; no list when nothing matches; German and English texts in an in-file `<i18n lang="yaml">` block
- [ ] T029 [US1] In `apps/haex-mail/app/components/ComposeDialog.vue` replace the three `UiInput` of To, Cc and Bcc by `RecipientInput` and call `useContactsStore().resetReadState()` when the dialog opens; the file grows by that call and nothing else
- [ ] T030 [US1] In `apps/haex-mail/haextension/manifest.json` declare `"contacts": [{ "target": "*", "action": "read" }]` (the `readWrite` row comes with T045)
- [ ] T031 [US1] Measure SC-001: seed a test address book with 5,000 contacts, type into To and time the gap between the last key and the list (target 0.3 s, no delayed keystroke); if it does not hold, implement the fallback of research R-8 (one `listAsync` sweep per compose dialog into memory, ranking with the same `suggestionsFrom`) and record the numbers in `specs/023-haex-mail-contacts/research.md` R-8
- [ ] T032 [US1] Run [quickstart.md](quickstart.md) scenarios 1 to 6 by hand and fix what they show

**Checkpoint**: US1 works on its own and can ship before the host and SDK parts.

---

## Phase 4: User Story 2 — Save an address from a received mail as a new contact (Priority: P1)

**Goal**: From any address of a received mail the person creates a new contact, filling in as many fields as they like.

**Independent Test**: With `readWrite` granted, "Save to contacts" → "New contact" at an unknown sender creates the contact in the address book; its name is then suggested in Compose without a restart ([quickstart.md](quickstart.md) 7 to 11). Needs T021.

### Tests for User Story 2 ⚠️ write first, they fail

- [ ] T033 [P] [US2] Create `apps/haex-mail/app/lib/contactKinds.test.ts`: a text row gives `{kind, label, value}`; an address row keeps only the filled parts (`street`, `pobox`, `neighborhood`, `city`, `region`, `postcode`, `country`) and is a JSON object as text; a messenger needs `service` and `handle` or is reported incomplete; a date row is `YYYY-MM-DD` or `--MM-DD` without a year; an empty row gives `null`; a label typed by the person becomes `custom:<text>`; a `custom` row without a name is reported incomplete; the first label of a kind is its default (`home` for e-mail, `mobile` for phone)
- [ ] T034 [P] [US2] Create `apps/haex-mail/app/lib/contactLookup.test.ts`: only an exact match of the address counts, not a longer address that contains it; case is ignored; blanks around the stored value are ignored
- [ ] T035 [P] [US2] Create `apps/haex-mail/app/lib/contactSave.test.ts` for `buildCreate` and `classifySaveError` on `create`: empty head fields and empty rows are dropped; a draft with no name part, `displayName`, organization, phone row or e-mail row is refused as `missing: "identity"`; the request holds no `groups`, `targets` or photo; 1002 on create is `switched-off`; the prompt error is `not-answered`; 8000 is `host-too-old`; `Validation` is `invalid` with the host's reason; anything else is `failed` with the plain message
- [ ] T036 [US2] Extend `apps/haex-mail/app/stores/contacts.test.ts`: `holdersAsync` calls `searchAsync(email, 200)`, keeps the exact holders and caches the answer; `createAsync` returns `saved` with the contact and empties the cache, and returns the classified outcome on an error

### Implementation for User Story 2

- [ ] T037 [P] [US2] Create `apps/haex-mail/app/lib/contactKinds.ts` (the nine kinds, their label sets as in research R-12, input shapes text / address / messenger / date, the first label the default, `rowToValue`), with a first comment naming the host's `src/lib/contacts/kinds.ts` as the reference; T033 passes
- [ ] T038 [P] [US2] Create `apps/haex-mail/app/lib/contactLookup.ts` with `contactsHolding(hits, email)`; T034 passes
- [ ] T039 [US2] Create `apps/haex-mail/app/lib/contactSave.ts` with `buildCreate` and `classifySaveError` (the `create` part), using `getErrorMessage` of `apps/haex-mail/app/lib/utils.ts` and the SDK's `isPermissionDeniedError`, `isPermissionPromptError`; T035 passes
- [ ] T040 [US2] Extend `apps/haex-mail/app/stores/contacts.ts` with `holdersAsync(email)` and `createAsync(draft)`; T036 passes
- [ ] T041 [P] [US2] Create `apps/haex-mail/app/components/ContactValueRow.vue`: one row with a label select (the kind's labels plus an own name that becomes `custom:<text>`) and the input of the row's shape; shows the host's reason next to the row on a `Validation` answer; texts in an in-file `<i18n>` block
- [ ] T042 [US2] Create `apps/haex-mail/app/components/ContactForm.vue`: `v-model: ContactDraft`, the head fields (display name, given, middle and family name, prefix, suffix, nickname, organization, job title, note) and the list of `ContactValueRow` with an "add" menu of the nine kinds; starts with one e-mail row holding the address, label `home`; no photo, groups, phone targets or holzi addresses are offered
- [ ] T043 [US2] Create `apps/haex-mail/app/components/MessageAddresses.vue`: the From/To/Cc block moved out of `apps/haex-mail/app/components/MessageView.vue` (not copied), each address with a menu "Save to contacts" that is never disabled; the addresses of the person's own accounts (from `useAccountsStore`) and invalid addresses are not offered; touch-reachable without hover
- [ ] T044 [US2] Use `MessageAddresses` in `apps/haex-mail/app/components/MessageView.vue` in place of the removed block; the file must end up shorter than its 430 lines
- [ ] T045 [US2] In `apps/haex-mail/haextension/manifest.json` add the second row `{ "target": "*", "action": "readWrite" }` to `contacts`, so the install dialog and the settings show two separate permissions
- [ ] T046 [US2] Create `apps/haex-mail/app/components/SaveContactDialog.vue` with the choice "New contact": opens with the name the mail gave (empty if none) and the address, lets the person edit the name or type one, confirms only on the person's click, creates through `createAsync`, and shows a busy state on the confirm button while the host's permission dialog is open (haex-mail has no wait or retry of its own, research R-3); a draft with no identity explains what is missing; on `holdersAsync` finding the address it says it is already saved under that contact and does not offer "New contact" first (FR-009); on `saved` it closes and shows a toast naming the contact (FR-016); cancelling creates nothing
- [ ] T047 [US2] Run [quickstart.md](quickstart.md) scenarios 7 to 11 by hand and fix what they show

**Checkpoint**: US1 and US2 both work; a contact can be created from a mail and is suggested at once.

---

## Phase 5: User Story 3 — Add an address to an existing contact, or update it (Priority: P2)

**Goal**: The person adds an address to a known contact or replaces one of its addresses, changing nothing else.

**Independent Test**: With `readWrite` granted and a contact holding one address, "Add to existing contact" → choose her → "add" gives her both addresses with her other details unchanged ([quickstart.md](quickstart.md) 12 to 17).

### Tests for User Story 3 ⚠️ write first, they fail

- [ ] T048 [P] [US3] Extend `apps/haex-mail/app/lib/contactSave.test.ts` for `buildEmailChange`: add of a new address gives one `upsert` without `id`, kind `email`, label `home`; add of an address the contact holds in another case gives `already`; replace gives one `upsert` with the old value's `id` and `kind`, the new address and no `label` (the host keeps the current one), and nothing else in the request; replace of an id the contact no longer has gives `gone`; and for `classifySaveError` on `update`: 1002 with `contactReadable: true` is `switched-off`, 1002 with `contactReadable: false` is `contact-gone`, `Validation` with `reason: "value_not_found"` is `value-gone`
- [ ] T049 [P] [US3] Extend `apps/haex-mail/app/stores/contacts.test.ts`: `changeEmailAsync` reads the contact first and builds the change from that copy (an address added in holzi after the person chose the contact is found as `already`), sends only the named value; after a 1002 it reads the contact with `readAsync(id)` and passes the result as `contactReadable` to the classification; `searchAsync(query)` asks with limit 20; a `saved` result empties the holders cache

### Implementation for User Story 3

- [ ] T050 [US3] Add `buildEmailChange` and the `update` part of `classifySaveError` to `apps/haex-mail/app/lib/contactSave.ts`; T048 passes
- [ ] T051 [US3] Add `searchAsync(query)`, `readAsync(id)` and `changeEmailAsync(change)` (with the read probe of research R-4) to `apps/haex-mail/app/stores/contacts.ts`; T049 passes
- [ ] T052 [US3] Add the choice "Add to existing contact" to `apps/haex-mail/app/components/SaveContactDialog.vue` (extract it into `AddToContactPane.vue` beside it and update the source tree of [plan.md](plan.md) if the dialog would pass 500 lines): search by name, organization, phone number or address; show the chosen contact's current e-mail addresses; choose "add" or "replace" one shown address; on `already` say so; on `contact-gone` say the contact is no longer available and return to the search; on `value-gone` reload the contact, show its current addresses and write nothing; a contact changed in the meantime still gets the address on its current state (FR-014); cancelling leaves the contact as it was
- [ ] T053 [US3] Run [quickstart.md](quickstart.md) scenarios 12 to 17 by hand and fix what they show

**Checkpoint**: US1 to US3 work.

---

## Phase 6: User Story 4 — Write access can be asked for later, and changed later (Priority: P2)

**Goal**: Read-only is a respectable state: the save actions stay usable, ask when needed, and lead to the settings when switched off.

**Independent Test**: With read granted and write on ask, confirming a save opens the host's dialog; Allow completes the save once; Deny with "remember" leads, on the next try, to a note with a button that opens the permission settings in holzi ([quickstart.md](quickstart.md) 18 to 22).

### Tests for User Story 4 ⚠️ write first, they fail

- [ ] T054 [US4] Extend `apps/haex-mail/app/stores/contacts.test.ts`: `openPermissionSettingsAsync` calls the SDK's `permissions.openSettingsAsync` and returns `"opened"`; an 8000 answer returns `"host-too-old"`; any other failure is rethrown

### Implementation for User Story 4

- [ ] T055 [US4] Add `openPermissionSettingsAsync()` to `apps/haex-mail/app/stores/contacts.ts`; T054 passes
- [ ] T056 [US4] In `apps/haex-mail/app/components/SaveContactDialog.vue` (and `AddToContactPane.vue` if it exists) show the notes of data-model.md for `switched-off` (writing contacts is off or limited, with a button that calls `openPermissionSettingsAsync`; when that returns `"host-too-old"` the note tells the person to open the permission settings of haex-mail in holzi by hand), `not-answered` (the question was not answered, try again) and `host-too-old` (a newer holzi is needed); in every case the form keeps the person's input, the confirm button stays enabled, and nothing is written
- [ ] T057 [US4] Check FR-018 and FR-022 across the dialogs: no save control is hidden or disabled in any permission state; a change of either permission in holzi takes effect on the next action without a restart (the compose dialog asks again after `resetReadState()`, a save asks the host each time)
- [ ] T058 [US4] Build a local signed package (`pnpm --filter haex-mail build:release`), install it in a holzi with the host part, and confirm the install dialog and the extension's settings show `read` and `readWrite` for contacts as two separate permissions
- [ ] T059 [US4] Run [quickstart.md](quickstart.md) scenarios 18 to 22 by hand and fix what they show

**Checkpoint**: All four stories work.

---

## Phase 7: Polish & cross-cutting

- [ ] T060 [P] Check that every text of the new components exists in German and English (FR-030) and that no text is hard-coded in a component
- [ ] T061 [P] Run `pnpm --filter haex-mail test`, `pnpm exec eslint app` in `apps/haex-mail` and `pnpm --filter haex-mail build`; fix what they show
- [ ] T062 [P] Check file sizes: `MessageView.vue` is shorter than before, `ComposeDialog.vue` has grown by no more than the reset call, every new file is far below 500 lines, and no test code sits in a production file
- [ ] T063 Run all 22 scenarios of [quickstart.md](quickstart.md) once more against the merged host and SDK, and tick SC-001 to SC-009 of [spec.md](spec.md) off against what was seen
- [ ] T064 Open haex-mail's pull request (`feat(haex-mail): suggest contacts and save addresses from mails`), describe the three parts and link the host's and the SDK's pull requests; no attribution lines; merged with rebase or a merge commit

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none; T001 to T003 are independent.
- **Foundational (Phase 2)**: needs T001 and T002. Host before SDK before haex-mail: T018 to T020 (SDK tests and code) may be written while the host is built, but the SDK's pull request (T021) is merged after the host's (T017), and haex-mail's bump (end of T021) needs the release.
- **US1 (Phase 3)**: needs T003 only. It does not wait for Phase 2.
- **US2 (Phase 4)**: needs T021 and US1's store file (T027), which it extends.
- **US3 (Phase 5)**: needs US2 (the dialog, the save module, the store).
- **US4 (Phase 6)**: needs US2 (the dialog) and T016/T021 (the settings call). Its notes (T054 to T056) are built with US2 and released with it; the rest can run parallel to US3 except for edits to the same dialog file.
- **Polish (Phase 7)**: after the stories wanted.

### Within each story

- Tests first, failing, then the code that makes them pass; pure modules before the store, the store before the components, components before the by-hand scenarios.
- Tasks that edit the same file are not parallel: `stores/contacts.ts` (T027, T040, T051, T055), `contactSave.ts` (T039, T050), `SaveContactDialog.vue` (T046, T052, T056), `manifest.json` (T030, T045).

### Parallel opportunities

- T002 and T003 beside T001. In Phase 2: host tests T005, T009, T015 are independent files; the SDK's T018 and T019 can run beside the host's work.
- US1: T022, T023, T024 together; then T025 and T026 together.
- US2: T033, T034, T035 together; T037 and T038 together; T041 beside T039/T040.
- US3: T048 and T049 together.
- Different people: one on the host (T004 to T017), one on the SDK (T018 to T021), one on US1 (T022 to T032).

## Parallel example: User Story 1

```text
# Tests together:
Task: "Add recipientAt/insertRecipient/formatRecipient/isBareAddress cases to apps/haex-mail/app/lib/address.test.ts"
Task: "Create apps/haex-mail/app/lib/contactSuggest.test.ts"
Task: "Create apps/haex-mail/app/stores/contacts.test.ts"

# Then the two pure modules together:
Task: "Extend apps/haex-mail/app/lib/address.ts"
Task: "Create apps/haex-mail/app/lib/contactSuggest.ts"
```

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1.
2. Phase 3 (US1) — it needs only reading, which SDK 5.5.0 has.
3. **Stop and validate** scenarios 1 to 6; ship haex-mail with suggestions while the host and SDK parts are still in review.

### Incremental delivery

1. US1 ships (suggestions).
2. Phase 2 lands (host, SDK 5.6.0), then US2 ships (new contact from a mail) **together with the permission notes of US4 (T054 to T056)**: FR-018 to FR-020 define how the first save behaves, and a person who denied writing must find the way to the settings from the first release. The by-hand checks of US4 (T057 to T059) may follow.
3. US3 ships (add or replace); its dialog pane shows the same notes.
4. Each story adds value without breaking the earlier ones; US1 keeps working on a holzi without the new calls.

## Notes

- [P] tasks touch different files and depend on no open task.
- Write the failing test first, watch it fail, then implement.
- Commit after each task or logical group, as Conventional Commits.
- Do not hand-edit the generated parts of other repositories' release files; release-please owns the SDK's changelog and version.
- The 1002 answer cannot tell a vanished contact from a refused write; the read probe of T051 is what separates them (research R-4). Do not replace it with a guess.
