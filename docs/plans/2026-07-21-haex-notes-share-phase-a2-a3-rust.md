# haex-notes Sharing — Phase A2/A3 (haex-vault Rust) — Next-Session Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This is Rust work with a cold `cargo build` — run it in a session with budget.

**Goal:** In haex-vault, (A2) stamp `haex_shared_space_sync` rows with the sharer's space-specific DID on assign, and (A3) add an `extension_space_get_members` Tauri command — so the SDK's `authoredByDid` and `getMembersAsync` return real data.

## Where you are (already done — DO NOT redo)

- **Worktree (work here):** `/home/haex/Projekte/haex-vault-notes-sharing`, branch `feat/notes-sharing` (based on haex-vault `main`). `node_modules` already installed.
- **A1 committed** (`e9eb13c0`): `authored_by_did` (nullable text) added to `haex_shared_space_sync` — in `src/database/tableNames.json`, `src/database/schemas/spaces.ts`, migration `src-tauri/database/migrations/0009_nasty_logan.sql` (`ALTER TABLE ... ADD authored_by_did text`), and `src-tauri/src/database/generated.rs` regenerated.
- **SDK done** (repo `/home/haex/Projekte/haex-vault-sdk`, branch `feat/notes-sharing`, `7bba3f4`): `SpaceAssignment.authoredByDid?`, `SPACE_COMMANDS.getMembers = "extension_space_get_members"`, `getMembersAsync(spaceId): Promise<SpaceMember[]>`, `SpaceMember = { did, label, isSelf }`.
- **Security already implemented — no work:** `src/stores/sync/orchestrator/pull/apply.ts` `verifyPulledChangesAsync` verifies every change's Ed25519 signature and requires the signer's `space/write` UCAN; read-only members' changes (incl. assignments) are rejected on ingest. `haex_shared_space_sync` travels member-to-member over cloud sync.

## Key mechanism you must know

`crate::table_names::COL_SHARED_SPACE_SYNC_*` and `TABLE_SHARED_SPACE_SYNC` are **generated at cargo-build time** by `src-tauri/build.rs` (`generator::table_names::generate_table_names()`) from `src/database/tableNames.json`; exposed via `pub mod table_names` in `src-tauri/src/lib.rs:93`. Because A1 added the JSON entry, **`COL_SHARED_SPACE_SYNC_AUTHORED_BY_DID` is auto-generated on the next `cargo build`** — you do NOT hand-write it. (It won't grep in committed source; it only exists in the build output.)

**First step of the session:** confirm this. From the worktree:
```bash
cd /home/haex/Projekte/haex-vault-notes-sharing/src-tauri
cargo build 2>&1 | tail -20   # cold build — slow (Tauri). Establishes baseline + generates table_names.
grep -rn "SHARED_SPACE_SYNC_AUTHORED_BY_DID" target/ 2>/dev/null | head   # should now exist
```
If the constant is NOT generated, inspect `build.rs` / the `generator::table_names` crate to see why the new column didn't flow through, and fix that before A2.

---

## Task A2: Populate `authored_by_did` on assign

**Files:**
- `src-tauri/src/extension/spaces/queries.rs`
- `src-tauri/src/extension/spaces/commands.rs`

**Step 1 — extend the INSERT** (`queries.rs`, `SQL_INSERT_SHARED_SPACE_SYNC`): add `COL_SHARED_SPACE_SYNC_AUTHORED_BY_DID` to the column list and a `?10` placeholder. Also add it to the import list from `crate::table_names` at the top of the file (alongside `COL_SHARED_SPACE_SYNC_LABEL` etc.).

**Step 2 — add the own-DID resolver** (`queries.rs`, new `lazy_static`):
```rust
// The vault's own identity that is a member of this space (private_key IS NOT NULL).
// One per space (the identity the user joined under) — matches the push signer.
pub static ref SQL_SELECT_OWN_DID_FOR_SPACE: String = format!(
    "SELECT i.{COL_IDENTITIES_DID} FROM {TABLE_SPACE_MEMBERS} m \
     JOIN {TABLE_IDENTITIES} i ON i.{COL_IDENTITIES_ID} = m.{COL_SPACE_MEMBERS_IDENTITY_ID} \
     WHERE m.{COL_SPACE_MEMBERS_SPACE_ID} = ?1 AND i.{COL_IDENTITIES_PRIVATE_KEY} IS NOT NULL LIMIT 1"
);
```
Confirm the exact `COL_IDENTITIES_*` / `COL_SPACE_MEMBERS_*` / `TABLE_*` constant names exist in `crate::table_names` (grep the build output or `tableNames.json`). Mirror the join at `src-tauri/src/space_delivery/local/dos_defence/contacts.rs:134-142`.

**Step 3 — resolve + pass the DID** (`commands.rs`, `extension_space_assign`, ~L91-183): the insert loop calls `core::execute_with_crdt(SQL_INSERT_SHARED_SPACE_SYNC.clone(), vec![...])`. Before the loop, resolve the DID per distinct `space_id` (cache in a `HashMap<String, Option<String>>`) via `core::select_with_crdt(SQL_SELECT_OWN_DID_FOR_SPACE.clone(), vec![Value::String(space_id)], &state.db)` (same helper style as commands.rs:311/387). Append the resolved DID as the 10th param:
```rust
match own_did.as_deref() {
    Some(did) => serde_json::Value::String(did.to_string()),
    None => serde_json::Value::Null,   // local space w/o membership row → NULL is fine
}
```

**Step 4 — return it on read** so the SDK's `getAssignmentsAsync` exposes `authoredByDid`:
- `queries.rs` `SQL_SHARED_SPACE_SYNC_SELECT_COLS`: add `COL_SHARED_SPACE_SYNC_AUTHORED_BY_DID`.
- `commands.rs` `SpaceAssignmentRow` (~L42-54): add `authored_by_did: Option<String>`.
- `commands.rs` `extension_space_get_assignments` mapping (~L314-328): map it into the returned JSON as **`authoredByDid`** (camelCase — must match SDK `SpaceAssignment.authoredByDid`).

**Step 5 — build + test:**
```bash
cd /home/haex/Projekte/haex-vault-notes-sharing/src-tauri
cargo build 2>&1 | tail -20                 # must compile
cargo test extension_space_assign 2>&1 | tail -30
```
Add a `#[cfg(test)]` test: seed a vault DB (`seed_vault_db()` helper, see `src-tauri/src/space_delivery/local/owner_sync_integration_tests/helpers.rs`) with a space + an own identity (private_key set) as member; run the assign path; assert the inserted `haex_shared_space_sync` row's `authored_by_did` == that identity's DID.

**Step 6 — commit:** `git add src-tauri/src/extension/spaces/` then `git commit -m "feat(spaces): stamp assignments with the sharer's space-specific DID"`.

---

## Task A3: Add `extension_space_get_members` command

**Files:** `src-tauri/src/extension/spaces/commands.rs`, `src-tauri/src/extension/spaces/queries.rs`, `src-tauri/src/lib.rs`.

**Step 1 — SELECT** (`queries.rs`, new `lazy_static`), mirroring `getSpaceMembers` (`src/stores/spaces/members.ts:106-118`):
```rust
pub static ref SQL_SELECT_SPACE_MEMBERS_WITH_IDENTITY: String = format!(
    "SELECT i.{COL_IDENTITIES_DID}, i.{COL_IDENTITIES_NAME}, (i.{COL_IDENTITIES_PRIVATE_KEY} IS NOT NULL) AS is_self \
     FROM {TABLE_SPACE_MEMBERS} m JOIN {TABLE_IDENTITIES} i ON i.{COL_IDENTITIES_ID} = m.{COL_SPACE_MEMBERS_IDENTITY_ID} \
     WHERE m.{COL_SPACE_MEMBERS_SPACE_ID} = ?1"
);
```

**Step 2 — command** (`commands.rs`): mirror `extension_space_list` (~L370-425) for the `resolve_extension_id` → `check_spaces_permission(&state, &Principal::Extension(id), SpaceAction::Read)` → `prompt_on_err(&app_handle, perm_result)?` scaffolding.
```rust
#[derive(serde::Serialize)]
struct SpaceMemberOut {
    did: String,
    label: String,                                   // haex_identities.name
    #[serde(rename = "isSelf")] is_self: bool,        // private_key IS NOT NULL
}

#[tauri::command]
pub async fn extension_space_get_members(
    app_handle: tauri::AppHandle,
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
    space_id: String,
    public_key: Option<String>,
    name: Option<String>,
) -> Result<Vec<SpaceMemberOut>, ExtensionError> {
    // resolve_extension_id + check_spaces_permission(Read) + prompt_on_err  (copy from extension_space_list)
    let rows = core::select_with_crdt(
        SQL_SELECT_SPACE_MEMBERS_WITH_IDENTITY.clone(),
        vec![serde_json::Value::String(space_id.clone())],
        &state.db,
    )?;
    Ok(rows.into_iter().map(|r| SpaceMemberOut {
        did: /* r[0] as str */, label: /* r[1] as str */, is_self: /* r[2] != 0 */,
    }).collect())
}
```

**Step 3 — register** in `src-tauri/src/lib.rs` `tauri::generate_handler![...]` next to the other `extension::spaces::commands::*` entries (~L515-524):
```rust
        extension::spaces::commands::extension_space_get_members,
```
No TS host change needed — `extensionMessageHandler.ts` routes `extension_space_*` by prefix and `handlers/spaces.ts` forwards verbatim (injecting `publicKey`/`name`).

**Step 4 — build + test:**
```bash
cd /home/haex/Projekte/haex-vault-notes-sharing/src-tauri
cargo build 2>&1 | tail -20
cargo test extension_space_get_members 2>&1 | tail -30
```
Test: seed a space with two members (one own identity w/ private_key, one contact w/o) and assert `get_members` returns both with correct `is_self` and labels.

**Step 5 — commit:** `git add src-tauri/src/extension/spaces/ src-tauri/src/lib.rs` then `git commit -m "feat(spaces): add extension_space_get_members command"`.

---

## After A2/A3 (handoff to the rest)

1. **Push + PR** the haex-vault `feat/notes-sharing` branch (if not already) and merge to `main` when reviewed.
2. **SDK publish (A6, human/CI):** merge the SDK `feat/notes-sharing` → `main`; release-please opens a release PR (minor bump 3.3.0 → 3.4.0); merge it → npm publishes.
3. **haex-notes B8 + C10** (plan `2026-07-21-haex-notes-share-phase-b-notes.md`): bump `@haex-space/vault-sdk` in haex-notes to the published version, then implement recipient read-only + author badge (uses `getMembersAsync` + `authoredByDid`) and the import-as-copy UI (C9 helper `app/utils/importPages.ts` already committed).

## Verify (Phase A2/A3 done)

- `cargo build` green in the worktree.
- After `assignAsync`, the `haex_shared_space_sync` row has `authored_by_did` = the sharer's space DID (== the `signedBy` push uses).
- `extension_space_get_members` returns members with correct `isSelf`; non-member/permission-denied handled like `extension_space_list`.
- Existing ingest (`verifyPulledChangesAsync`) untouched — read-only members still can't inject assignments.
