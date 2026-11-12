# Implementation Plan: haex-mail — contacts from the address book

**Branch**: `023-haex-mail-contacts` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/023-haex-mail-contacts/spec.md`

## Summary

haex-mail offers the contacts of the host's address book in two places: as **suggestions** in To, Cc and Bcc of the compose dialog, and as **"Save to contacts"** at each address of a received mail, which creates a new contact (with every field the person wants to fill in) or adds or replaces an e-mail address on an existing one. Reading and writing are two separate permissions; the save actions are always usable and bring up the host's permission dialog when write access is missing.

The work lies in three repositories, delivered in this order ([research.md](research.md) R-1):

1. **Host (`haex-space/haex-vault`, the app called holzi)**: `readWrite` becomes a valid action of the `contacts` permission (reversing a recorded decision, with an ADR), two bridge methods to create and change a contact with a deliberately smaller input than the service takes, a distinct answer for a value that is gone, and one generic call that opens an extension's own permission settings ([contracts/host-bridge.md](contracts/host-bridge.md)). The service already checks `ReadWrite` for every caller; only the way in is new.
2. **SDK (`haex-space/vault-sdk`)**: `ContactsAPI.createAsync` and `updateAsync`, `PermissionsAPI.openSettingsAsync`, types, tests, README, released as 5.6.0 ([contracts/sdk-api.md](contracts/sdk-api.md)).
3. **haex-mail (this repository, `apps/haex-mail`)**: the logic in pure modules with tests, one store, five components, the manifest ([contracts/mail-modules.md](contracts/mail-modules.md)).

Approach in haex-mail, in the order the research settles it:

- **No storage.** Nothing is kept: no table, no migration ([data-model.md](data-model.md)). The host owns the address book and haex-mail asks it per question.
- **Suggestions**: a search per pause in typing (150 ms, the newest wins), ranked and capped here, with the popover and input of the shared UI layer and the focus kept in the field (R-8, R-10). The entry the caret is in is found with the same split rules the field is parsed with, and a name with a comma is quoted on insertion (R-11).
- **Saving**: a form whose rows are shaped by the host's value kinds (text, postal address, messenger, date) (R-12); adding to an existing contact sends only the e-mail value named, on the contact's current state (R-5).
- **Permissions**: the SDK already waits for the person's answer and repeats the call on a grant, so haex-mail has no retry of its own (R-3). A refusal is told from a vanished contact by one read after the failure (R-4), and the person is led to the permission settings by the new call (R-7).

## Technical Context

**Language/Version**: haex-mail: TypeScript, Vue 3.5, Nuxt 4 (`ssr: false`, static preset), Node 22 in CI, as the app is. Host: Rust (Tauri) with a Nuxt window. SDK: TypeScript (tsup, Vitest).

**Primary Dependencies**: `@haex-space/vault-sdk` `^5.6.0` in haex-mail (a bump of `^5.5.0`), Pinia, `vue-sonner`, `packages/haex-ui` (`input`, `popover`, `dialog`, `select`, `button`). **No new third-party dependency in any of the three repositories.**

**Storage**: None in haex-mail. The host stores contacts as it does today; no schema change there either (the service and its tables are used as they are).

**Testing**: haex-mail and SDK: Vitest, tests beside the modules; the store over a typed fake of the contacts and permissions API. Host: Rust tests of the bridge and manifest mapping, its node `check:` scripts for the window part. The dialogs and the host's permission dialog by hand ([quickstart.md](quickstart.md)).

**Target Platform**: The extension frame of the host on desktop and on Android/iOS (touch: the suggestion rows are tappable, the menu at an address is reachable without hover).

**Project Type**: haextension app (static web app packaged as a signed `.xt`), plus changes in the host and the SDK.

**Performance Goals**: Suggestions within 0.3 s of the last key with 5,000 contacts (SC-001); no keystroke delayed (FR-005). Met by one host search per pause with the newest answer winning. **Not verified**: the host's search time at that size; the quickstart measures it and research R-8 names the fallback.

**Constraints**: The SDK and host decide the permission flow; haex-mail adds no wait or retry. A missing or hidden contact answers 1002 alike by the host's design, so the form needs one extra read to explain a failed change (R-4). The suggestion list never holds the whole address book.

**Scale/Scope**: haex-mail: about 6 new `lib`/store files with tests, 5 new components, edits to `ComposeDialog.vue`, `MessageView.vue`, the manifest, two package files and the locales of the new components. SDK: three files and tests. Host: the contacts bridge, the permission model and its mapping, one window route section, one ADR, tests.

## Dependencies

- **Host before SDK before haex-mail.** haex-mail's implementation starts once `@haex-space/vault-sdk` 5.6.0 is released; the host's methods must exist for the SDK's tests of the contract to mean anything, so the host's pull request is merged first. Until then a local link of the SDK serves development and is never committed.
- **Spec 022 (drafts)** also edits `ComposeDialog.vue`. This feature touches only the three recipient inputs (it replaces them), so the two merge independently; whichever lands second rebases over a small hunk.
- **The ADR** that supersedes spec 051 FR-029 of the host is a prerequisite of the host's pull request, not of this repository's.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

The repository's constitution is `.spaex/constitution.md` (`.specify/memory/constitution.md` is the unfilled template). The relevant rules and how the plan meets them:

| Rule | Status |
|------|--------|
| Work in a repository-local worktree on a topic branch; never author in the primary checkout | **Met**: `.worktrees/haex-mail-contacts`, branch `023-haex-mail-contacts`. The host and SDK changes are authored in worktrees of their own repositories, on topic branches. |
| Follow the repository's conventions (structure, naming, runtime, module system) | **Met**: `app/lib` with tests beside, `app/stores`, `app/components`, in-file `<i18n>` blocks, `*Async` naming, the Nuxt import alias; the SDK's `api/commands/types` layout; the host's `extensions/` and `contacts/` layout |
| Consult the graphify graph before authoring any new named artifact; prefer extending over a parallel implementation; state the candidates | **Met for planning**: queries and candidates in research R-16. No borderline case; `address.ts` is extended, the header block is extracted rather than copied, `command` is evaluated and rejected with a reason. Consulted again per artifact when written. |
| Tests in separate files from production code; one runnable check for every non-trivial logic module | **Met**: a `*.test.ts` beside each `lib` module and the store; Rust tests in the host's `_tests.rs` files |
| Split files clearly over 500 lines | **Met**: `ComposeDialog.vue` (541) and `MessageView.vue` (430) get smaller, not larger (R-14); every new file is far below 500 |
| Fewest files, deletion over addition, smallest diff that works; `ponytail:` on corner-cutting with its ceiling | **Met**: no dependency, no cache, no list of all contacts, values-only `update`, `command` not adopted. Ceilings recorded: values-only update (R-6), per-query search (R-8) |
| Prefer extending an existing artifact over a parallel one; abstract only when behaviour, owner and invariants are shared | **Met**: one generic settings call instead of a contacts-only one (R-7) because the behaviour is identical; the kinds table stays in haex-mail instead of a shared package for want of a second consumer (R-12) |
| A design decision that materially affects a core principle is an ADR | **Not triggered** for this repository (no constitution principle is touched). The host's reversal of its own earlier decision gets an ADR in the host's `docs/adr/`. |
| Conventional Commit messages; no reference to the authoring tooling in any artifact | **Met** |
| All work lands on `main` through a pull request; no squash merge | **Met**: three pull requests, one per repository, merged with rebase or merge commit |
| No secrets in git; no local absolute paths in committed files | **Met**: only repository-relative paths in these artifacts |
| Cross-repo references pin repository, full SHA and path | **Met**: the host and the SDK are referenced as `haex-space/haex-vault` at cc609e82dac86a7bc119db445197214052115ca4 and `haex-space/vault-sdk` at 1af55e9d95858db14603b984394e1235c145de93, with repository-relative paths |
| `/speckit-plan` checks the plan against the constitution | **Met**: this table; re-checked below after the design |

**Re-check after Phase 1**: the design added no dependency, no store beyond one, and no file over 500 lines; the contracts name only repository-relative paths. No rule is violated.

## Project Structure

### Documentation (this feature)

```text
specs/023-haex-mail-contacts/
├── plan.md              # This file
├── research.md          # Phase 0: decisions and what was found
├── data-model.md        # Phase 1: in-memory entities, no storage
├── quickstart.md        # Phase 1: manual scenarios and the commands to run
├── contracts/
│   ├── host-bridge.md   # What the host must offer (FR-023 to FR-026, FR-029)
│   ├── sdk-api.md       # What the SDK adds (FR-027, FR-029)
│   └── mail-modules.md  # The pure modules, the store and the components of haex-mail
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2: /speckit-tasks, not created here
```

### Source code

```text
apps/haex-mail/
├── haextension/
│   └── manifest.json                     # + contacts: read and readWrite for "*"
├── package.json                          # vault-sdk ^5.6.0
└── app/
    ├── lib/
    │   ├── address.ts                    # + recipientAt, insertRecipient, formatRecipient, isBareAddress
    │   ├── address.test.ts               # + the cases of contracts/mail-modules.md
    │   ├── contactSuggest.ts  (+ .test.ts)   # ranking of search hits
    │   ├── contactLookup.ts   (+ .test.ts)   # exact address match
    │   ├── contactKinds.ts    (+ .test.ts)   # kinds, labels, shapes, rowToValue
    │   └── contactSave.ts     (+ .test.ts)   # buildCreate, buildEmailChange, classifySaveError
    ├── stores/
    │   ├── contacts.ts                   # read state, searches, holders cache, saves
    │   └── contacts.test.ts              # over a fake of the SDK slice
    └── components/
        ├── RecipientInput.vue            # replaces the three recipient inputs in ComposeDialog.vue
        ├── MessageAddresses.vue          # the From/To/Cc block extracted from MessageView.vue
        ├── SaveContactDialog.vue
        ├── ContactForm.vue
        └── ContactValueRow.vue
```

In `ComposeDialog.vue` the three `UiInput` for To, Cc and Bcc become `RecipientInput`, and `contacts.resetReadState()` is called when the dialog opens. In `MessageView.vue` the From/To/Cc block moves into `MessageAddresses.vue`. No other existing file changes in this repository.

Outside this repository (their own pull requests, details in the contracts): `haex-space/haex-vault`: `src-tauri/src/extensions/permissions/{model,manifest_map}.rs` and tests, `src-tauri/src/extensions/contacts.rs` (create, update, the grants, the 1004 for `readWrite`) and its tests, `src-tauri/src/extensions/bridge/allowlist.rs`, the settings event and page section, `docs/adr/`. `haex-space/vault-sdk`: `src/api/contacts.ts`, `src/api/permissions.ts`, `src/commands/*.ts`, `src/types/contacts.ts`, `src/types.ts`, tests, `README.md`.

**Structure Decision**: haex-mail keeps its existing layout and adds files beside the modules they extend. The logic is split into small pure modules because each is what a test can fail on; the store exists because two components share the read state and the lookup cache; the extraction of `MessageAddresses.vue` is what makes room for the per-address menu without growing `MessageView.vue`.

## Complexity Tracking

No violation of the constitution. Three choices cost more than the smallest diff and are named so the reviewer can weigh them:

| Choice | Why needed | Simpler alternative rejected because |
|--------|------------|--------------------------------------|
| The host reverses its own earlier decision that extensions only read (spec 051 FR-029) | The request is to create and change contacts from haex-mail | Keeping the rule makes the feature impossible; the cost is the host's ADR, its test change and a second row in the permission model |
| The form has structured inputs for postal address, messenger and date | FR-008a asks for all other fields by hand, and the host rejects those three kinds unless the value is a JSON object of fixed parts | A single text input per row would produce values the host refuses |
| A read after a failed change to tell "switched off" from "gone" (R-4) | The host answers both 1002 by design, and the spec asks for two different messages | A new error code would leak, for contacts, a distinction the host keeps hidden elsewhere; kept for a later decision |
