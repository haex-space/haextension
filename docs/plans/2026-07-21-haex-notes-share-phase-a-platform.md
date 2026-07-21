# haex-notes Sharing — Phase A: Platform (Author Attribution) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose the author of a shared-space assignment to extensions, so a recipient extension can show "shared by {name}" and detect read-only (not-mine) content. Add `authored_by_did` to `haex_shared_space_sync` (populated with the sharer's space-specific DID) and a new `getMembersAsync(spaceId)` SDK method (member DID + label + `isSelf`).

**Architecture:** Sharing itself already works: assignments drive a cloud-sync INNER-JOIN push of extension rows to the space's server backend; every synced change (incl. `haex_shared_space_sync`) is Ed25519-signed on push and UCAN-`space/write`-verified on pull ([`pull/apply.ts:48-163`](../../haex-vault/src/stores/sync/orchestrator/pull/apply.ts)). So the security model (read-only members can't inject assignments) is DONE. This phase only adds the extension-visible author carrier: a signed column value + an SDK members lookup for DID→name. No changes to the sync/verification pipeline.

**Tech Stack:** haex-vault (Nuxt 4 + Tauri 2 + Rust + Drizzle/SQLite, vitest 4), haex-vault-sdk (TypeScript, tsup, vitest, release-please).

**Repos:**
- `/home/haex/Projekte/haex-vault` — host (schema, Rust commands)
- `/home/haex/Projekte/haex-vault-sdk` — SDK (`@haex-space/vault-sdk`)

**Order:** Part 1 (haex-vault Rust/schema) → Part 2 (SDK types/method + publish) → then Phase B consumes the published SDK. Part 1 and Part 2 are code-independent but Part 2's `getMembersAsync` only returns data once Part 1's command exists.

---

## Part 1 — haex-vault: `authored_by_did` on assignments + `get_members` command

### Task 1: Add `authored_by_did` to the `haex_shared_space_sync` schema

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src/database/tableNames.json` (`shared_space_sync.columns`)
- Modify: `/home/haex/Projekte/haex-vault/src/database/schemas/spaces.ts` (`haexSharedSpaceSync`, ~line 178)

**Step 1: Add the column mapping to tableNames.json**

In `shared_space_sync.columns` (currently lines ~183-197), add before `"createdAt"`:
```json
        "label": "label",
        "authoredByDid": "authored_by_did",
        "createdAt": "created_at"
```

**Step 2: Add the column to the Drizzle schema**

In `spaces.ts`, in `haexSharedSpaceSync`, after the `label` column (line 178), add:
```ts
    label: text(tableNames.haex.shared_space_sync.columns.label),
    authoredByDid: text(tableNames.haex.shared_space_sync.columns.authoredByDid),
    createdAt: text(tableNames.haex.shared_space_sync.columns.createdAt).default(
      sql`(CURRENT_TIMESTAMP)`,
    ),
```
(Nullable text — existing rows will read NULL. `InsertHaexSharedSpaceSync`/`SelectHaexSharedSpaceSync` update automatically.)

**Step 3: Generate the migration + Rust type bindings**

```bash
cd /home/haex/Projekte/haex-vault
pnpm drizzle:generate       # emits src-tauri/database/migrations/0009_*.sql + meta/_journal.json
pnpm generate:rust-types    # regenerates crate::table_names (adds COL_SHARED_SPACE_SYNC_AUTHORED_BY_DID)
```

**Step 4: Verify the generated SQL**

Open the new `src-tauri/database/migrations/0009_*.sql`. Expected: a simple
```sql
ALTER TABLE `haex_shared_space_sync` ADD `authored_by_did` text;
```
If drizzle instead emitted the 12-step table-rebuild (because of the existing CHECK/composite-FK on this table), read it carefully and confirm the `INSERT ... SELECT` copies all existing columns — the rebuild is acceptable as long as it preserves data. If in doubt, hand-write the simple `ADD COLUMN` as a `migrations-manual/` entry instead and revert the drizzle file.

**Step 5: Commit**
```bash
git add src/database/tableNames.json src/database/schemas/spaces.ts src-tauri/database/migrations/ src-tauri/src/table_names* 
git commit -m "feat(spaces): add authored_by_did column to shared_space_sync"
```

---

### Task 2: Populate `authored_by_did` on assign (Rust)

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src-tauri/src/extension/spaces/queries.rs`
- Modify: `/home/haex/Projekte/haex-vault/src-tauri/src/extension/spaces/commands.rs` (`extension_space_assign`, L91-183)

**Step 1: Extend the INSERT SQL** (`queries.rs`, `SQL_INSERT_SHARED_SPACE_SYNC`, L40-48)

Add the new column + a `?10` placeholder:
```rust
pub static ref SQL_INSERT_SHARED_SPACE_SYNC: String = format!(
    "INSERT OR IGNORE INTO {TABLE_SHARED_SPACE_SYNC} \
     ({COL_ID}, {COL_TABLE_NAME}, {COL_ROW_PKS}, {COL_SPACE_ID}, \
      {COL_EXTENSION_PUBLIC_KEY}, {COL_EXTENSION_NAME}, \
      {COL_GROUP_ID}, {COL_TYPE}, {COL_LABEL}, {COL_AUTHORED_BY_DID}) \
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
);
```
(Use the exact `COL_SHARED_SPACE_SYNC_*` constant names now generated in `crate::table_names` — `COL_SHARED_SPACE_SYNC_AUTHORED_BY_DID`.)

**Step 2: Add a resolver for the space-specific own DID** (`queries.rs`, new constant)

```rust
// Returns the DID of THIS vault's own identity that is a member of the space.
// Own identities have a non-null private_key. One per space (the identity the
// user joined the space under) — matches the push signer (backend.identity_id).
pub static ref SQL_SELECT_OWN_DID_FOR_SPACE: String = format!(
    "SELECT i.{COL_IDENTITIES_DID} FROM {TABLE_SPACE_MEMBERS} m \
     JOIN {TABLE_IDENTITIES} i ON i.{COL_IDENTITIES_ID} = m.{COL_SPACE_MEMBERS_IDENTITY_ID} \
     WHERE m.{COL_SPACE_MEMBERS_SPACE_ID} = ?1 AND i.{COL_IDENTITIES_PRIVATE_KEY} IS NOT NULL \
     LIMIT 1"
);
```
(Confirm the exact identities/space_members column constants exist in `crate::table_names`; mirror the join used at `src-tauri/src/space_delivery/local/dos_defence/contacts.rs:134-142`.)

**Step 3: Resolve + pass the DID in `extension_space_assign`**

In `commands.rs` `extension_space_assign` (the loop at ~L144-179), before the insert loop resolve the DID per distinct `space_id` (cache in a `HashMap<String,Option<String>>` to avoid re-querying):
```rust
// pseudo — mirror the existing core::select_with_crdt usage at commands.rs:311/387
let own_did: Option<String> = {
    let rows = core::select_with_crdt(
        SQL_SELECT_OWN_DID_FOR_SPACE.clone(),
        vec![serde_json::Value::String(assignment.space_id.clone())],
        &state.db,
    )?;
    rows.get(0).and_then(|r| r.get(0)).and_then(|v| v.as_str()).map(String::from)
};
```
Then append it as the 10th param in the `core::execute_with_crdt(SQL_INSERT_SHARED_SPACE_SYNC.clone(), vec![...])` call:
```rust
    match &own_did {
        Some(did) => serde_json::Value::String(did.clone()),
        None => serde_json::Value::Null,
    },
```
(NULL is acceptable for local spaces with no membership row; the extension treats NULL author as "unknown".)

**Step 4: Include the column in the assignments SELECT** (`queries.rs` `SQL_SHARED_SPACE_SYNC_SELECT_COLS` L23-30 + `commands.rs` `SpaceAssignmentRow` L42-54 + the mapping in `extension_space_get_assignments` L314-328)

Add `authored_by_did` to the SELECT column list, add `authored_by_did: Option<String>` to `SpaceAssignmentRow`, and map it into the returned JSON as `authoredByDid` (camelCase, to match the SDK field).

**Step 5: Build**
```bash
cd /home/haex/Projekte/haex-vault/src-tauri && cargo build 2>&1 | tail -20
```
Expected: compiles. Fix any missing-constant errors (they indicate `generate:rust-types` from Task 1 didn't run or the JSON key was misspelled).

**Step 6: Rust unit test** (mirror `src-tauri/src/**/command_validation_tests.rs` + `seed_vault_db()` helpers)

Write a `#[cfg(test)]` test that: seeds a vault DB with a space + own identity (private_key set) as member, calls the assign path, and asserts the inserted `haex_shared_space_sync` row's `authored_by_did` equals that identity's DID. Run:
```bash
cd /home/haex/Projekte/haex-vault/src-tauri && cargo test extension_space_assign 2>&1 | tail -30
```
Expected: PASS.

**Step 7: Commit**
```bash
git add src-tauri/src/extension/spaces/
git commit -m "feat(spaces): stamp assignments with the sharer's space-specific DID"
```

---

### Task 3: Add the `extension_space_get_members` command (Rust)

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src-tauri/src/extension/spaces/commands.rs`
- Modify: `/home/haex/Projekte/haex-vault/src-tauri/src/lib.rs` (`generate_handler!`, ~L515)

**Step 1: Add the command** — mirror `extension_space_list` (commands.rs L370-425) exactly for the permission + prompt scaffolding:
```rust
#[derive(serde::Serialize)]
struct SpaceMemberOut {
    did: String,
    label: String,     // haex_identities.name
    #[serde(rename = "isSelf")]
    is_self: bool,      // haex_identities.private_key IS NOT NULL
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
    // 1. resolve_extension_id(...) — copy from extension_space_list
    // 2. check_spaces_permission(&state, &Principal::Extension(id), SpaceAction::Read)
    //    then prompt_on_err(&app_handle, perm_result)?
    // 3. query members ⋈ identities for this space:
    let rows = core::select_with_crdt(
        SQL_SELECT_SPACE_MEMBERS_WITH_IDENTITY.clone(), // SELECT i.did, i.name, i.private_key IS NOT NULL
        vec![serde_json::Value::String(space_id.clone())],
        &state.db,
    )?;
    Ok(rows.into_iter().map(|r| SpaceMemberOut {
        did: /* r[0] */, label: /* r[1] */, is_self: /* r[2] != 0 */,
    }).collect())
}
```
Add `SQL_SELECT_SPACE_MEMBERS_WITH_IDENTITY` to `queries.rs`:
```sql
SELECT i.did, i.name, (i.private_key IS NOT NULL) AS is_self
FROM haex_space_members m JOIN haex_identities i ON i.id = m.identity_id
WHERE m.space_id = ?1
```
(Use the `crate::table_names` constants, not literals. This mirrors `getSpaceMembers` in `src/stores/spaces/members.ts:106-118`.)

**Step 2: Register the command** in `lib.rs` `tauri::generate_handler![...]` next to the other `extension::spaces::commands::*` entries (~L515-524):
```rust
        extension::spaces::commands::extension_space_get_members,
```

**Step 3: Build + verify no TS host change needed** — the TS router matches `extension_space_*` by prefix ([`extensionMessageHandler.ts:117`](../../haex-vault/src/composables/handlers/extensionMessageHandler.ts)) and `handlers/spaces.ts` forwards verbatim, so the new command routes automatically.
```bash
cd /home/haex/Projekte/haex-vault/src-tauri && cargo build 2>&1 | tail -20
```

**Step 4: Rust test** — seed a space with two members (one own identity w/ private_key, one contact), assert `get_members` returns both with correct `is_self`. Run `cargo test extension_space_get_members`.

**Step 5: Commit**
```bash
git add src-tauri/src/extension/spaces/ src-tauri/src/lib.rs
git commit -m "feat(spaces): add extension_space_get_members command"
```

---

## Part 2 — SDK (@haex-space/vault-sdk): types + `getMembersAsync`

### Task 4: Add `authoredByDid` to `SpaceAssignment` + `getMembers` command

**Files:**
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/api/spaces.ts` (`SpaceAssignment` L12-25)
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/commands/spaces.ts` (`SPACE_COMMANDS` L12-25)

**Step 1: Add the optional field** to `SpaceAssignment` (after `label?`, spaces.ts:24):
```ts
    /** Optional display label (e.g. "Personal", "Team Q1") */
    label?: string;
    /** DID of the member who created this assignment (did:key:z...). Undefined for local/legacy rows. */
    authoredByDid?: string;
```

**Step 2: Add the command constant** to `SPACE_COMMANDS` (spaces.ts:12-25):
```ts
  /** Get members of a shared space */
  getMembers: "extension_space_get_members",
```

**Step 3: Commit**
```bash
cd /home/haex/Projekte/haex-vault-sdk
git add src/api/spaces.ts src/commands/spaces.ts
git commit -m "feat(spaces): add authoredByDid field and getMembers command constant"
```

---

### Task 5: Add the `SpaceMember` type + `getMembersAsync` method (TDD)

**Files:**
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/types/spaces.ts` (new interface near L14)
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/api/spaces.ts` (import + method after L119)
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/index.ts` (re-export, L168-176)
- Test: `/home/haex/Projekte/haex-vault-sdk/src/api/__tests__/spaces.test.ts` (new)

**Step 1: Write the failing test** (mirror `src/api/__tests__/web.test.ts` fake-client pattern):
```ts
import { describe, it, expect } from "vitest";
import { SpacesAPI } from "../spaces";
import { SPACE_COMMANDS } from "~/commands";
import type { HaexVaultSdk } from "~/client";

function makeSpacesApi(returnValue: unknown) {
  const calls: Array<{ command: string; args: unknown }> = [];
  const fakeClient = {
    request: async (command: string, args: unknown) => {
      calls.push({ command, args });
      return returnValue;
    },
  } as unknown as HaexVaultSdk;
  return { spaces: new SpacesAPI(fakeClient), calls };
}

describe("SpacesAPI.getMembersAsync", () => {
  it("calls extension_space_get_members with the spaceId", async () => {
    const members = [{ did: "did:key:zA", label: "Anna", isSelf: false }];
    const { spaces, calls } = makeSpacesApi(members);
    const result = await spaces.getMembersAsync("space-1");
    expect(calls[0]).toEqual({ command: SPACE_COMMANDS.getMembers, args: { spaceId: "space-1" } });
    expect(result).toEqual(members);
  });
});
```

**Step 2: Run it, expect FAIL**
```bash
cd /home/haex/Projekte/haex-vault-sdk
pnpm exec vitest run src/api/__tests__/spaces.test.ts
```
Expected: FAIL — `getMembersAsync` is not a function.

**Step 3: Add the type** in `src/types/spaces.ts` (near L14):
```ts
export interface SpaceMember {
  /** DID of this member (did:key:z...) */
  did: string
  /** Display label (identity name) */
  label: string
  /** True if this member is one of the current vault's own identities */
  isSelf: boolean
}
```

**Step 4: Add the method + import** in `src/api/spaces.ts`. Add to the type import at top (L2):
```ts
import type { DecryptedSpace, SpaceMember } from "~/types/spaces";
```
Add after `listSpacesAsync` (L119):
```ts
  /**
   * List members of a shared space (DID + label), flagging the current user.
   * Used to resolve assignment authors to names and to detect own vs shared-in content.
   */
  async getMembersAsync(spaceId: string): Promise<SpaceMember[]> {
    return this.client.request<SpaceMember[]>(SPACE_COMMANDS.getMembers, { spaceId });
  }
```

**Step 5: Re-export the type** in `src/index.ts` (L168-176 block):
```ts
  type DecryptedSpace,
  type SpaceMember,
  type SyncBackendInfo,
```

**Step 6: Run test + typecheck, expect PASS**
```bash
pnpm exec vitest run src/api/__tests__/spaces.test.ts
pnpm typecheck
```
Expected: PASS, no type errors.

**Step 7: Commit**
```bash
git add src/types/spaces.ts src/api/spaces.ts src/index.ts src/api/__tests__/spaces.test.ts
git commit -m "feat(spaces): add getMembersAsync and SpaceMember type"
```

---

### Task 6: Build + publish the SDK

**Step 1: Full build + tests**
```bash
cd /home/haex/Projekte/haex-vault-sdk
pnpm build && pnpm test && pnpm typecheck
```
Expected: all green; `dist/index.d.ts` contains `getMembersAsync` and `authoredByDid`.

**Step 2: Publish via release-please** — do NOT bump `package.json` manually. The `feat(spaces): ...` commits on `main` make release-please open a release PR (minor bump 3.3.0 → 3.4.0). Merging it tags `v3.4.0` and the `release.yml` workflow publishes to npm. Confirm the published version, then Phase B pins `@haex-space/vault-sdk` to it.

---

## Verification (Phase A end-to-end)

- `pnpm drizzle:generate` produced a migration adding `authored_by_did`; app starts and the Rust runner applies it (no migration error in logs).
- On the sharer's device, after `sdk.spaces.assignAsync(...)`, the `haex_shared_space_sync` rows have `authored_by_did` = the sharer's space DID (= the `signedBy` used by push).
- `sdk.spaces.getAssignmentsAsync(table)` returns objects including `authoredByDid`.
- `sdk.spaces.getMembersAsync(spaceId)` returns members with correct `isSelf`.
- Existing sign+UCAN ingest is UNCHANGED — a read-only member still cannot push valid assignments (rejected by `verifyPulledChangesAsync`).

## Notes / Non-goals

- **No changes** to `pull/apply.ts`, `push.ts` signing, or the UCAN check — the security requirement (signed + capability-gated assignments) is already satisfied there. This phase only surfaces the author to extensions.
- `authored_by_did` is a convenience/display carrier. Its trust derives from the existing signed+authorized ingest (a read-only member can't get an assignment accepted at all). We do not additionally cross-check `authored_by_did == signedBy` server-side; a write-capable member could in theory mislabel authorship, which is out of scope for this feature.
- QUIC/P2P delivery of extension data is out of scope — sharing is online-space-only by design.
