---

description: "Task list for haex-mail drafts that save themselves"
---

# Tasks: haex-mail — drafts that save themselves

**Input**: Design documents from `specs/022-haex-mail-drafts/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Start condition**: haex-space/haextension#165 (spec 063, T017) is merged to `main`. Several tasks change `applyPrefill` in `ComposeDialog.vue`, which exists only there. Create the worktree from `origin/main` after the merge.

**Tests**: Included. The repository's constitution requires a runnable check for every non-trivial logic module, in a separate test file beside it (`*.test.ts`, Vitest, `environment: node`). The dialog, the page and the real IMAP round trip are validated by hand with [quickstart.md](quickstart.md) instead of mocks.

**Organization**: Tasks are grouped by user story. Paths are relative to the repository root; `APP` stands for `apps/haex-mail`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story of [spec.md](spec.md) (US1 … US5)

## Rules for every task

- Work in a worktree of `haex-space/haextension` on a topic branch, never in the primary checkout.
- Before authoring a new named artifact (function, module, composable, store), run `graphify query "<intent>"` and evaluate what it returns; extend an existing artifact when one fits. The candidates already evaluated are in [research.md](research.md) R-12; do not repeat those queries.
- Comments, commit messages and file contents name no authoring tool or model. Commits follow Conventional Commits (`feat(haex-mail): …`). A reference to a holzi spec is `haex-space/haex-vault@<full sha>:<path>`.
- Keep each source file under 500 lines. Mark a deliberate corner cut with a `ponytail:` comment naming its ceiling and upgrade path.
- Imports at the top of the file. Async functions are named `…Async`, as in the rest of the app.
- Before handing over, run `pnpm --filter haex-mail test`, `pnpm --filter haex-mail exec vue-tsc --noEmit` and `pnpm --filter haex-mail build`, and report what ran.

## Phase 1: Foundational (blocking prerequisites)

**Purpose**: the tables, the pure modules and the store that every story uses. Nothing is visible to the person yet.

- [x] T001 [P] (FR-015) Add `drafts` (`drafts_no_sync`) and `draftAttachments` (`draft_attachments_no_sync`) to `APP/app/database/schemas/index.ts` with the columns of [data-model.md](data-model.md), exporting the `Insert…`/`Select…` types like the other tables; then run `pnpm --filter haex-mail db:generate` to create `APP/app/database/migrations/0005_*.sql` and check that it contains only the two new tables. No `index` beyond the primary keys.
- [x] T002 [P] (FR-002, FR-004, FR-010) Create `APP/app/lib/drafts.ts` with `DraftFields`, `draftHasContent`, `toDraftRow`, `fromDraftRow`, `draftListRow`, `isDraftRowId` and `mergeDraftRows` as in [contracts/draft-store.md](contracts/draft-store.md); reuse `parseAddressList`/`formatAddressList` from `APP/app/lib/address.ts` and `bodyToText` from `APP/app/lib/composeBody.ts`. Tests in `APP/app/lib/drafts.test.ts`: content rule (blank fields, attachment only, whitespace only, untouched reply versus touched reply, a link prefill as no baseline), row round trip for every field including an empty body, `draftListRow` shape and id prefix, `mergeDraftRows` listing a draft once with and without its server row and ordering by `internalDate`.
- [x] T003 [P] (FR-001, FR-003, SC-003) Create `APP/app/lib/draftSaver.ts` (`createDraftSaver`, timers injected) as in the contract. Tests in `APP/app/lib/draftSaver.test.ts` with fake timers: one write per pause with the latest fields, restart on each change, `flush` writes at once and resolves after the write, a change during a write is written once after it, writes never overlap, a failing write rejects `flush` and keeps the fields pending, `cancel` drops them.
- [x] T004 [P] (FR-008, FR-009) Create `APP/app/lib/draftUpload.ts` (`dueDrafts`, `nextDueAt`, `withMessageId`, `messageIdOf`, `sameMessageId`) as in the contract, importing `MAX_MOVE_ATTEMPTS`/`retryDelayMs` from `APP/app/lib/pendingMoves.ts` instead of repeating them. Tests in `APP/app/lib/draftUpload.test.ts`: due times and the attempt limit, `force`, rows with only `previous_message_ids_json` set, `withMessageId` replacing an existing header (also a folded one), adding one when absent, leaving body bytes and other headers unchanged, producing valid base64 (decode and compare), `messageIdOf` round trip, `sameMessageId` with and without angle brackets and `null`.
- [x] T005 (FR-001, FR-002, FR-004, FR-015) Create `APP/app/stores/mail/drafts.ts`: `createDraftStore(backend, deps)` with `saveAsync`, `loadAsync`, `listRowsAsync`, `removeAsync` ([contracts/draft-store.md](contracts/draft-store.md); the upload and adoption parts come in US4 and US3), and `useDrafts()` that builds the backend from `useHaexVaultStore().orm` (reads through the Drizzle `orm`; every write that touches more than one row runs as one `client.database.transaction([{ sql, params }])` with the SQL from the query builders' `.toSQL()`, see [research.md](research.md) R-3b; a conflict target is a plain column name, as in `outbox.ts`). The attachment bound of 25 MiB lives here (`ponytail:` comment with the chunking upgrade). Tests in `APP/app/stores/mail/drafts.test.ts` over an in-memory backend: a save with content writes the row and sets `upload_due_at`, a save without content removes the row, attachments are rewritten only when the set changed, `removeAsync` deletes a draft without a server copy at once and marks one with a copy, a save writes the row and its attachments in one transaction call (a fake `transaction` that throws leaves the old state), the 25 MiB bound keeps the rest and reports the overflow once, `listRowsAsync` returns only the drafts of the asked accounts and skips `removed_at` rows.
- [x] T006 (FR-009) Add the shared texts (de/en) to `APP/app/locales/de.json` and `en.json` under `mail.drafts`: `uploaded` ("Draft saved"), `noDraftsFolder`, `uploadFailed`, `attachmentsTooLarge`, `waiting`. Move nothing out of the dialog's own `<i18n>` block that it still uses.

**Checkpoint**: `pnpm --filter haex-mail test` passes with the new modules; nothing in the app calls them yet.

---

## Phase 2: User Story 1 — Nothing I type is ever lost (P1) 🎯 MVP

**Goal**: A mail with content is a local draft one second after the last change; a lost window or a crash leaves it.

**Independent Test**: Quickstart scenarios 1, 2, 3 and 10.

- [ ] T007 [US1] (FR-001, FR-002) Create `APP/app/composables/useDraftAutosave.ts` ([contracts/draft-store.md](contracts/draft-store.md)): watches the dialog's fields (deeply), feeds `createDraftSaver`, keeps `draftId`, writes through `useDrafts().saveAsync`, and flushes on `visibilitychange` (hidden) and `pagehide`. Expose `begin`, `flushAsync`, `discardAsync`, `sent`. `begin` starts a draft on the first content (a link prefill counts as content at once). Test in `APP/app/composables/useDraftAutosave.test.ts` with a fake store and fake timers: a first change with content creates the id, emptying the fields removes the draft, an untouched baseline creates none, `flushAsync` writes pending text, `begin` flushes the previous draft before starting the next.
- [ ] T008 [US1] (FR-001, FR-004) Change `APP/app/components/ComposeDialog.vue` to use the composable: the fields stay the dialog's; `open` → `begin`; `reset()` no longer drops text that is a draft (it ends the draft after a flush); `applyReplyTo` and `applyPrefill` pass their state as the baseline (reply) or none (link). The account comes from `props.account` (single view) or the "From" select (unified view) and is part of the draft fields. Threading (`inReplyTo`, `references`) is kept in the draft fields and used when sending and uploading, not read from `props.replyTo`, so a reply that is continued from the list stays a reply. The current PR version is already 541 lines, so move the attachment code (`fileToBase64`, `addFilesAsync`, `onFilesPicked`, `removeAttachment`, sizes) to `APP/app/composables/useComposeAttachments.ts` as part of this task and leave both files under 500 lines.
- [ ] T009 [US1] (FR-001, FR-013) Replace the close behaviour in `APP/app/components/ComposeDialog.vue`: `closeAsync` flushes the local save and closes; it no longer calls `saveDraftAsync` and can no longer keep the dialog open (the draft is safe locally). Remove `saveDraftAsync`, `isSavingDraft` and the draft-related error texts that nothing uses any more (`noDraftsFolder`, `draftFailed`, `draftSaved` move to the store's texts of T006). Remove the replace question of #165 in the same commit, because its "save and open" button uses `saveDraftAsync`: `confirmReplaceOpen`, `keepCurrentDraft`, `saveDraftAndApplyPrefillAsync`, the `ShadcnAlertDialog` block in the template and the `replaceConfirm.*` texts of the dialog's `<i18n>` block. **T009 and T012 land in one commit**, since without the question and without T012 a link would replace the open mail unasked. Keep the message-building step of the old function by adding `outgoingFromDraft(fields, account)` to `APP/app/lib/outgoing.ts` (it wraps `buildOutgoingMessage` with the `subject || t("noSubject")` rule) with a test in `APP/app/lib/outgoing.test.ts`; US4 uses it.
- [ ] T010 [US1] (FR-013) Add the discard question to `APP/app/components/ComposeDialog.vue` with `ShadcnDialogConfirm` (`packages/haex-ui/components/shadcn/dialog/Confirm.vue`): "Discard" on a mail with content asks once, "yes" calls `discardAsync` and closes, "no" changes nothing; a mail without content closes without asking. Texts in the dialog's `<i18n>` block (de/en).
- [ ] T011 [US1] (SC-001) Run quickstart scenarios 1, 2, 3 and 10 against `pnpm --filter haex-mail dev` in a holzi build; fix what they show. Record the result in the PR description.

**Checkpoint**: No typed mail is lost; the draft cannot yet be found in the list (US3).

---

## Phase 3: User Story 2 — A new mail never replaces the one I am writing (P1)

**Goal**: A mail link, the compose button and "new mail" start a second draft and leave the open one.

**Independent Test**: Quickstart scenario 4.

- [ ] T012 [US2] (FR-005, FR-006) In `APP/app/components/ComposeDialog.vue` change `applyPrefill` (from #165): it no longer checks `isDirty` or asks (the question is removed in T009); it calls `begin(prefillFields, null)`, which flushes and keeps the open draft and starts a new one. Keep the guard that runs it when the dialog is created already open. Do the same for the compose button of `APP/app/pages/index.vue` and `MailSidebar.vue`: starting a new mail while one is open goes through `begin` (the button must not just re-open the dialog on the same fields). Land it with T009.
- [ ] T013 [US2] (FR-005, FR-006, SC-002) Add the "link while a mail is open" cases to `APP/app/composables/useDraftAutosave.test.ts`: the earlier row keeps its full text, a second row exists, a second link starts a third; and a link while the dialog is closed starts one. Behaviour 4 of [contracts/draft-store.md](contracts/draft-store.md).
- [ ] T014 [US2] (SC-002) Run quickstart scenario 4 (link and button) by hand; record the result.

**Checkpoint**: US1 and US2 together remove the loss that raised the feature.

---

## Phase 4: User Story 3 — Find my drafts and continue them (P1)

**Goal**: The drafts view lists local and server-only drafts; opening one continues it; deleting one removes it.

**Independent Test**: Quickstart scenarios 5, 6 and 11.

- [ ] T015 [US3] (FR-010) In `APP/app/stores/mail.ts` (and `stores/mail/sync.ts` where the list is loaded) merge the local drafts into the drafts view: for `selectedRole === "drafts"` (one account or the unified view) call `useDrafts().listRowsAsync` and `mergeDraftRows` after the cached server rows, in `loadMessagesAsync` and `loadUnifiedMessagesAsync`, and reload when a draft is saved or removed. Test the merge call through `mergeDraftRows` (T002) and add a store-level case if the loaders can be called over a fake orm; otherwise validate by quickstart 5.
- [ ] T016 [US3] (FR-010) Guard every code path that takes a message id from the list against `draft::` ids so a draft row never reaches an IMAP call: selection and bulk actions (`stores/mail/bulk.ts`, `stores/mail/outbox.ts` `enqueueMovesAsync`, `stores/mail/changes.ts`, `useBulkMailActions`), mark read/flag, move. A draft row supports exactly open and delete; the toolbar hides the other actions when only draft rows are selected. Tests where the paths are pure (`parseMessageId` in `APP/app/tools/context.ts` must not accept a `draft::` id); the rest by quickstart 5 and 9.
- [ ] T017 [US3] (FR-011, SC-004) In `APP/app/pages/index.vue` open the compose dialog instead of the reading pane when the selected row is a draft (`isDraftRowId`): `ui.openDraft = <id>` (a new field of `APP/app/stores/ui/index.ts`), the dialog takes it as it takes `composePrefill`, calls `loadAsync` and `begin(fields, null, id)`. A server-only row in the drafts view takes the adoption path of T018.
- [ ] T018 [US3] (FR-010, FR-011) Add `adoptServerDraftAsync` to `APP/app/stores/mail/drafts.ts`: reads the body and attachments of the server message with `getBodyContextAsync` and `fetchAttachmentBase64Async` (`APP/app/stores/mail/reply.ts`), creates the local draft with `server_message_id` set to the message's own Message-ID (no angle brackets); a message without one becomes a new local draft and the original stays on the server ([research.md](research.md) R-7). Test with a fake message source: the adopted draft equals the server draft, a missing Message-ID gives a new local draft with `server_message_id` empty, attachments that fail to load are reported once and the rest is kept.
- [ ] T019 [US3] (FR-012) Add the delete action for draft rows in the list and in the reading toolbar: `removeAsync(id)` and a reload; it reaches the server copy only after US4/US5 exist, so for now it removes the local draft. Check scenario 9 for a never-uploaded draft.
- [ ] T020 [US3] (SC-004) Run quickstart scenarios 5, 6 and 11 (11 needs T018 and a second mail program) and record the results.

**Checkpoint**: Drafts can be found, continued and deleted; the server still sees only what the old close button put there (nothing, now: US4 follows).

---

## Phase 5: User Story 4 — The server's drafts folder holds my drafts too (P2)

**Goal**: One copy per draft in the drafts folder, replaced by later saves; offline without errors.

**Independent Test**: Quickstart scenarios 7 and 8.

- [ ] T021 [US4] (FR-008) **Probe** (needs a real account and the holzi opener build; the operator provides the account): a throwaway script or a temporary button in the dev build appends a message with a self-chosen Message-ID, calls `searchMessagesAsync({ text: id })`, `fetchEnvelopesAsync` with the hits and `deleteMessagesAsync` by UID, and prints each result. Record the outcome in [research.md](research.md) R-4 ("Not verified" becomes a fact). If the search by Message-ID does not find the message, switch `withMessageId` to also write `X-Haex-Draft: <uuid>` and search for that token, as R-4 names; if neither works, stop and ask the operator. **Do not start T022 before this is answered.** Remove the probe code before the PR.
- [ ] T022 [US4] (FR-007, FR-008, FR-009) Add `flushUploadsAsync`, `scheduleUploadNow` and the lookup/replace/remove steps of [contracts/server-copy.md](contracts/server-copy.md) to `APP/app/stores/mail/drafts.ts`: one flush at a time (calls fold into one more run, as `flushPendingMovesAsync`), `online` event forces, a timer set to `nextDueAt`, offline counts no attempt, `retryDelayMs`/`MAX_MOVE_ATTEMPTS` from `lib/pendingMoves.ts`, `previous_message_ids_json` bookkeeping, the `edited_at` check of step 5, a missing drafts folder kept local with one toast. Tests over the in-memory backend and a fake mail client: first upload sets the id and clears `upload_due_at`; a second upload appends first and deletes the old copy after; a failed delete keeps the old id for the next flush; a change during the upload keeps `upload_due_at`; offline does nothing and counts nothing; exhausted attempts stop retrying until the next change; removal finds and deletes every id, and "not found" counts as gone; a missing drafts folder uploads nothing and toasts once.
- [ ] T023 [US4] (FR-007, FR-009) Wire it up: `saveAsync` arms the 30 s timer, `closeAsync` of the dialog calls `scheduleUploadNow(id)`, `APP/app/plugins/drafts.client.ts` (new, pattern of `agent-tools.client.ts`: read `$haexVault?.client` directly, retry on `app:mounted`) calls `flushUploadsAsync()` once at start, after the vault is initialised (a crash may have left drafts due), and registers the `online` listener. The "Draft saved" toast shows once per upload that a close started, not for each pause upload.
- [ ] T024 [US4] (SC-006) Run quickstart scenarios 7 and 8 with the second mail program; record the results.

**Checkpoint**: The draft is on the server after closing and after a pause, and replaced, not duplicated.

---

## Phase 6: User Story 5 — Sending closes the books (P2)

**Goal**: Sending or deleting a draft removes it locally and from the server.

**Independent Test**: Quickstart scenario 9.

- [ ] T025 [US5] (FR-014) In `APP/app/components/ComposeDialog.vue` call `sent()` of the composable after `sendMessageAsync` succeeded (before the dialog closes): it calls `removeAsync` and `flushUploadsAsync`, so the server copy is deleted. A failed send touches nothing. Test in `APP/app/composables/useDraftAutosave.test.ts`: `sent` removes the draft; a send that threw leaves it.
- [ ] T026 [US5] (FR-012, FR-014) Make `discardAsync` and the list delete of T019 end in `removeAsync` followed by a flush when a copy exists; add the case "delete while offline keeps `removed_at` and removes the copy after the connection returns" to `APP/app/stores/mail/drafts.test.ts` (it exercises the T022 removal path).
- [ ] T027 [US5] (SC-005) Run quickstart scenario 9 and 10 once more and record the results.

---

## Phase 7: Polish & cross-cutting

- [ ] T028 (FR-004) Remove the drafts (and their attachments) of an account when the account is removed (`APP/app/stores/accounts.ts`, in the same operation that clears its cache); no server call is made. Test over the in-memory backend.
- [ ] T029 [P] Update the documentation that names the old behaviour: the haex-mail section of the repository's docs or README if it mentions draft saving (`grep -rn -i "draft" README.md docs apps/haex-mail --include=*.md`), and add the new tables to the schema notes if any exist. Cite the holzi spec as `haex-space/haex-vault@<sha>:<path>`.
- [ ] T030 (FR-015) Run the full checks: `pnpm --filter haex-mail test`, `pnpm --filter haex-mail exec vue-tsc --noEmit`, `pnpm --filter haex-mail build`, `node scripts/extensions.js --check haex-mail`, `wc -l` of `ComposeDialog.vue`, `useDraftAutosave.ts`, `useComposeAttachments.ts` and `stores/mail/drafts.ts` (each under 500), a grep that both new tables in the schema and the migration end in `_no_sync` (FR-015), and walk [quickstart.md](quickstart.md) once from 1 to 12 on a clean vault; fix what it shows and list what was run and what was skipped in the PR description.
- [ ] T031 Run `/speckit-analyze` over spec, plan and tasks before the PR is marked ready and fix the findings it reports.

---

## Dependencies & execution order

- **Phase 1** blocks everything. T001–T004 are independent files and run in parallel; T005 needs T001–T004; T006 is independent.
- **US1** needs Phase 1. Inside it T007 → T008 → T009 → T010 → T011 (the dialog file is touched by T008–T010 in turn).
- **US2** needs US1 (it changes how `begin` is called).
- **US3** needs US1 (drafts exist) and can start in parallel with US2 except for the shared dialog edits (T017 touches the dialog and the page).
- **US4** needs Phase 1 and T021 (the probe) before T022; T023 needs US1.
- **US5** needs US4 for the server removal (T026), and US1 for T025.
- **Polish** last; T028 and T029 can run at any time after Phase 1.

## Parallel examples

```text
Phase 1:  T001 ∥ T002 ∥ T003 ∥ T004 ∥ T006, then T005
After US1: US2 (T012–T014) ∥ US3's T015, T016, T018 (different files from the dialog)
US4:      T021 (probe) first; T022 then T023
```

## Implementation strategy

- **MVP** is Phase 1 plus US1 and US2: nothing typed is lost and a link no longer replaces a mail. The drafts are not yet listed (US3), which makes the MVP half useful; US3 is next because a draft that cannot be found is of little use.
- Deliver as **one pull request** with the stages as separate commits. The stages must not be merged apart: US1 switches the close button's append to the server off, and only US4 puts the server copy back, so a merge between them would stop saving drafts on the server for a while.
- The probe T021 is the one step that needs the operator. If it cannot be done early, do US1–US3 first; they do not depend on it.
