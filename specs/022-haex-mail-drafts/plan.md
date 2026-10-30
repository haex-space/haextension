# Implementation Plan: haex-mail — drafts that save themselves

**Branch**: `022-haex-mail-drafts` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/022-haex-mail-drafts/spec.md`

## Summary

Every mail with content in the compose dialog of `apps/haex-mail` becomes a **draft row in the vault database of this device** within one second of the last change, with no connection and no action of the person. The dialog stops overwriting itself: a mail link (spec 063) or the compose button starts a **new** draft and leaves the open one in the list. The drafts folder view lists local drafts together with the drafts that exist only on the server; opening one continues it in the compose dialog. A **server copy** follows when the dialog closes and after 30 seconds without a change, as one message per draft that is replaced by the next version; sending or deleting the draft removes it.

Approach, in the order the research settles it ([research.md](research.md)):

- **Storage**: two device-local tables, `drafts_no_sync` and `draft_attachments_no_sync` ([data-model.md](data-model.md)). `_no_sync` is the mechanism `haex-doom` already uses; it keeps drafts out of the vault sync, so two devices never edit one row, and the server copy is the one channel between devices, as the spec assumes. Typing writes only the small draft row; attachments are written only when the set of attachments changes.
- **Saving**: a pure debounced saver (300 ms after the last change, flushed on close, on a hidden page and before the page unloads) so the bound of one second holds with margin. Content and "untouched reply" are decided by a pure function over the fields.
- **Server copy**: the SDK appends a message and returns nothing, and the host builds the Message-ID. The copy is therefore found again by the Message-ID that `buildRfc822Async` wrote into the bytes, through a search and an envelope check, and replaced by append-then-delete ([contracts/server-copy.md](contracts/server-copy.md)). Retries with the backoff helpers of `lib/pendingMoves.ts`, offline without an error.
- **List**: a local draft appears in the drafts view as a synthetic message row; server rows that are copies of a local draft are hidden. Opening a server-only draft adopts it into a local draft, so it is replaced on the next upload instead of duplicated.
- **Logic is pure and tested**: content rule, row mapping, list merge, saver, upload planning, Message-ID parsing and the draft store over an in-memory backend are `app/lib` modules with tests beside them ([contracts/draft-store.md](contracts/draft-store.md)). The dialog wiring and the real IMAP round trip are validated by hand ([quickstart.md](quickstart.md)).

## Technical Context

**Language/Version**: TypeScript, Vue 3.5, Nuxt 4 (`ssr: false`, static preset), Node 22 in CI — `apps/haex-mail` as it is

**Primary Dependencies**: `@haex-space/vault-sdk` (^5.1, `client.mail.appendMessageAsync`, `buildRfc822Async`, `searchMessagesAsync`, `fetchEnvelopesAsync`, `deleteMessagesAsync`), `drizzle-orm` for the schema and migration, Pinia, `vue-sonner`, the shared `packages/haex-ui` layer (`ShadcnDialogConfirm`). **No new third-party dependency.**

**Storage**: Tables `drafts_no_sync` and `draft_attachments_no_sync` in the extension's own vault schema, device-local, one new drizzle migration (`0005`). Nothing else in the schema changes.

**Testing**: Vitest 3, `environment: node`, `app/**/*.test.ts`, test files beside their modules — the configuration `apps/haex-mail` already has. The store runs over an in-memory backend, as the library of `haex-puzzle` does.

**Target Platform**: The extension frame of haex-vault on desktop and on Android/iOS.

**Project Type**: haextension app (single static web app packaged as a signed `.xt`).

**Performance Goals**: A draft exists ≤ 1 s after the last change (SC-001, FR-001): debounce 300 ms plus one row write. Typing in a long mail shows no delay (SC-003): one write of the draft row per pause, never per keystroke, never with the attachments. The draft list opens as fast as today's list: one extra query for the local drafts of the shown accounts.

**Constraints**: No connection needed to save (FR-003). The server copy happens at most when the dialog closes and once per 30 s of idle, never per change (FR-007). The SDK offers no UID from `append` and no header control, which the server-copy algorithm works around (R-4). Local attachments are limited to 25 MiB per draft (R-3); every hand-maintained source file stays under 500 lines (constitution), which is why the autosave logic leaves `ComposeDialog.vue`.

**Scale/Scope**: A person has some drafts, rarely more than a dozen; the list has no limit of its own (spec). About 10 new source files plus tests, and changes in five existing files.

## Dependencies

This feature changes the part of `ComposeDialog.vue` that applies a mail link (`applyPrefill`), which is added by haex-space/haextension#165 (spec 063, T017). **Implementation starts from `main` after #165 is merged**; until then the spec and plan are reviewable but the tasks cannot be applied. #165's `ponytail:` comment ("a link replaces a mail that is being written; upgrade: confirm") is removed by this feature, because the replaced mail is a draft by then.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

The repository's constitution is `.spaex/constitution.md` (`.specify/memory/constitution.md` is the unfilled template). The relevant rules, and how the plan meets them:

| Rule | Status |
|------|--------|
| Work in a repository-local worktree on a topic branch; never author in the primary checkout | **Met**: `.worktrees/022-haex-mail-drafts`, branch `022-haex-mail-drafts` |
| Follow the repository's conventions (structure, naming, runtime, module system) | **Met**: `app/lib`, `app/stores/mail`, `app/composables`, drizzle schema and migrations, `*Async` naming, imports at the top |
| Consult the graphify graph before authoring any new named artifact; prefer extending over a parallel implementation; state the candidates | **Met for planning**, with **one borderline case for the reviewer** (below). Queries run on the primary checkout's graph (the worktree has none, which the rule allows): results in research R-12. The graph is consulted again, per artifact, during implementation. |
| Tests in separate files from production code; one runnable check for every non-trivial logic module | **Met**: `*.test.ts` beside each `app/lib` module and the store |
| Split files clearly over 500 lines; do not split solely to shorten | **Planned**: the current PR version of `ComposeDialog.vue` is 541 lines. T008 moves its attachment handling into `useComposeAttachments`; the implementation must leave the dialog and composable under 500 lines. |
| Fewest files, deletion over addition, smallest diff that works; mark corner-cutting with `ponytail:` and its ceiling | **Met**: no dependency, no new queue framework; ceilings recorded for the 25 MiB attachment bound (R-3) and the unverified server copy (R-4) |
| Conventional Commit messages; no attribution of the authoring tooling in any project artifact | **Met** |
| All work lands on `main` through a pull request; no squash merge | **Met** |
| No secrets in git; no local absolute paths in committed files | **Met**: only repository-relative paths in these artifacts |
| Cross-repo references pin repository, full SHA and path | **Met**: the one reference to haex-vault (spec 063) is pinned in the spec |
| Follow the Spec Kit workflow, with the constitution checked at plan and analyze time | **Met**: specify → plan → tasks → analyze → implement |
| Phase discipline | **Met**: no later-phase work; cross-device sync of local drafts stays out |

**Borderline case (graph candidate)**: `useMoveOutbox` in `app/stores/mail/outbox.ts` has the same shape as the draft uploader: a persisted queue, a flush that folds concurrent calls, a retry timer with growing pauses, an offline guard and a "still waiting" hint (about 60 lines of control flow). The plan **reuses the pure helpers** (`retryDelayMs`, `nextRetryAt`, `MAX_MOVE_ATTEMPTS` in `lib/pendingMoves.ts`) and writes the draft flush separately, because the work per item differs (replace a server copy versus a move by UID) and extracting a shared flusher would rewrite code this feature does not need to touch. **The reviewer decides** whether to extract the shared flusher instead; it is a refactoring of working code, so the default is not to.

**Post-design re-check**: no new violation. The design adds no dependency and no permission (the mail permission `fetch` already covers append, search and delete on the account's host), and no file leaves 500 lines.

## Project Structure

### Documentation (this feature)

```text
specs/022-haex-mail-drafts/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── draft-store.md   # The store, the pure modules and their guarantees
│   └── server-copy.md   # Replacing and removing the copy in the drafts folder
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/haex-mail/
├── app/
│   ├── database/
│   │   ├── schemas/index.ts                 # + drafts, draftAttachments
│   │   └── migrations/0005_*.sql            # new, drizzle-generated
│   ├── lib/
│   │   ├── drafts.ts                        # fields, content rule, row mapping, list rows, merge
│   │   ├── drafts.test.ts
│   │   ├── draftSaver.ts                    # debounced saver with flush
│   │   ├── draftSaver.test.ts
│   │   ├── draftUpload.ts                   # which drafts are due, Message-ID of built bytes
│   │   └── draftUpload.test.ts
│   ├── stores/mail/
│   │   ├── drafts.ts                        # the draft store: save, load, remove, adopt, upload
│   │   └── drafts.test.ts                   # over an in-memory backend
│   ├── composables/
│   │   └── useDraftAutosave.ts              # wires the dialog's fields to the saver and the store
│   ├── components/
│   │   └── ComposeDialog.vue                # draft id, autosave, new draft on link, confirm on discard
│   ├── stores/mail.ts                       # drafts view merges local drafts into the list
│   ├── pages/index.vue                      # a draft row opens the dialog
│   └── locales / <i18n> blocks              # de/en texts
└── package.json                             # no change
```

**Structure Decision**: One new store module and three pure `lib` modules, as `rules` and `pendingMoves` are built (logic in `lib`, I/O in `stores/mail`). The dialog keeps its form state; the composable only observes it and writes through the store, so the dialog stays the single owner of the fields.

## Complexity Tracking

> No constitution violations to justify.
