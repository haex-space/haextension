# Shared Space Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable row-level data sharing between users via Shared Spaces — extensions decide which rows sync to which spaces via a system mapping table, the sync engine filters accordingly.

**Architecture:** A system table `haex_shared_space_sync` maps (table_name, row_pks, space_id). The table scanner JOINs against this table when pushing to space backends. Extensions manage assignments through namespace-scoped SDK methods routed via Tauri commands. Personal backends continue to sync everything unchanged.

**Tech Stack:** Rust (Tauri commands), TypeScript (vault sync engine, SDK), SQLite (system table), Drizzle ORM (schema)

**Repos:**
- `haex-vault` — system table, scanner, push logic, Tauri commands
- `haex-vault-sdk` — SDK API for extensions
- `haextension/apps/haex-calendar` — first consumer

---

## Task 1: System Table Schema + Migration

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src/database/tableNames.json` (after line 186, inside `"haex"` object)
- Modify: `/home/haex/Projekte/haex-vault/src/database/schemas/haex.ts` (after line 363)
- Create: `/home/haex/Projekte/haex-vault/src-tauri/database/migrations/0002_shared_space_sync.sql`
- Modify: `/home/haex/Projekte/haex-vault/src-tauri/database/migrations/meta/_journal.json` (add idx 2)

### Step 1: Add table names to tableNames.json

In `/home/haex/Projekte/haex-vault/src/database/tableNames.json`, add after the `"storage_backends"` entry (after line 186), still inside the `"haex"` object:

```json
    "shared_space_sync": {
      "name": "haex_shared_space_sync",
      "columns": {
        "tableName": "table_name",
        "rowPks": "row_pks",
        "spaceId": "space_id"
      }
    }
```

### Step 2: Add Drizzle schema definition

In `/home/haex/Projekte/haex-vault/src/database/schemas/haex.ts`, after line 363:

```typescript
// ---------------------------------------------------------------------------
// Shared Space Sync — maps rows to shared spaces for space-backend filtering
// ---------------------------------------------------------------------------

export const haexSharedSpaceSync = sqliteTable(
  tableNames.haex.shared_space_sync.name,
  {
    tableName: text(tableNames.haex.shared_space_sync.columns.tableName).notNull(),
    rowPks: text(tableNames.haex.shared_space_sync.columns.rowPks).notNull(),
    spaceId: text(tableNames.haex.shared_space_sync.columns.spaceId).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tableName, table.rowPks, table.spaceId] }),
  ],
)

export type InsertHaexSharedSpaceSync = typeof haexSharedSpaceSync.$inferInsert
export type SelectHaexSharedSpaceSync = typeof haexSharedSpaceSync.$inferSelect
```

Note: import `primaryKey` from `drizzle-orm/sqlite-core` if not already imported. Check existing imports at top of file.

### Step 3: Create migration SQL

Create `/home/haex/Projekte/haex-vault/src-tauri/database/migrations/0002_shared_space_sync.sql`:

```sql
CREATE TABLE IF NOT EXISTS `haex_shared_space_sync` (
	`table_name` text NOT NULL,
	`row_pks` text NOT NULL,
	`space_id` text NOT NULL,
	PRIMARY KEY(`table_name`, `row_pks`, `space_id`)
);
```

### Step 4: Update migration journal

In `/home/haex/Projekte/haex-vault/src-tauri/database/migrations/meta/_journal.json`, add to the `entries` array:

```json
{
  "idx": 2,
  "version": "7",
  "when": 1741545600000,
  "tag": "0002_shared_space_sync",
  "breakpoints": true
}
```

### Step 5: Commit

```bash
cd /home/haex/Projekte/haex-vault
git add src/database/tableNames.json src/database/schemas/haex.ts src-tauri/database/migrations/
git commit -m "feat: add haex_shared_space_sync system table"
```

---

## Task 2: Tauri Command Handlers (Rust)

**Files:**
- Create: `/home/haex/Projekte/haex-vault/src-tauri/src/extension/spaces/mod.rs`
- Create: `/home/haex/Projekte/haex-vault/src-tauri/src/extension/spaces/commands.rs`
- Modify: `/home/haex/Projekte/haex-vault/src-tauri/src/extension/mod.rs` (add `pub mod spaces;`)
- Modify: `/home/haex/Projekte/haex-vault/src-tauri/src/lib.rs` (register commands)

These commands validate that the requested `table_name` starts with the calling extension's `{publicKey}__{name}__` prefix before allowing any operation.

### Step 1: Create the spaces module

Create `/home/haex/Projekte/haex-vault/src-tauri/src/extension/spaces/mod.rs`:

```rust
pub mod commands;
```

### Step 2: Create the command handlers

Create `/home/haex/Projekte/haex-vault/src-tauri/src/extension/spaces/commands.rs`:

```rust
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::database::AppDatabase;
use crate::extension::utils::{resolve_extension_id, get_extension_table_prefix};
use crate::extension::core::state::ExtensionWebviewManager;

#[derive(Debug, Deserialize)]
pub struct SpaceAssignment {
    pub table_name: String,
    pub row_pks: String,
    pub space_id: String,
}

#[derive(Debug, Serialize)]
pub struct SpaceAssignmentResult {
    pub table_name: String,
    pub row_pks: String,
    pub space_id: String,
}

fn validate_table_prefix(table_name: &str, prefix: &str) -> Result<(), String> {
    if !table_name.starts_with(prefix) {
        return Err(format!(
            "Table '{}' does not belong to this extension (expected prefix '{}')",
            table_name, prefix
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn extension_space_assign(
    window: tauri::Window,
    db: State<'_, AppDatabase>,
    webview_manager: State<'_, ExtensionWebviewManager>,
    public_key: Option<String>,
    name: Option<String>,
    assignments: Vec<SpaceAssignment>,
) -> Result<usize, String> {
    let ext_id = resolve_extension_id(&window, &webview_manager, public_key, name)?;
    let prefix = get_extension_table_prefix(&ext_id.public_key, &ext_id.name);

    for a in &assignments {
        validate_table_prefix(&a.table_name, &prefix)?;
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut count = 0;
    for a in &assignments {
        conn.execute(
            "INSERT OR IGNORE INTO haex_shared_space_sync (table_name, row_pks, space_id) VALUES (?1, ?2, ?3)",
            rusqlite::params![a.table_name, a.row_pks, a.space_id],
        ).map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(count)
}

#[tauri::command]
pub async fn extension_space_unassign(
    window: tauri::Window,
    db: State<'_, AppDatabase>,
    webview_manager: State<'_, ExtensionWebviewManager>,
    public_key: Option<String>,
    name: Option<String>,
    assignments: Vec<SpaceAssignment>,
) -> Result<usize, String> {
    let ext_id = resolve_extension_id(&window, &webview_manager, public_key, name)?;
    let prefix = get_extension_table_prefix(&ext_id.public_key, &ext_id.name);

    for a in &assignments {
        validate_table_prefix(&a.table_name, &prefix)?;
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut count = 0;
    for a in &assignments {
        let deleted = conn.execute(
            "DELETE FROM haex_shared_space_sync WHERE table_name = ?1 AND row_pks = ?2 AND space_id = ?3",
            rusqlite::params![a.table_name, a.row_pks, a.space_id],
        ).map_err(|e| e.to_string())?;
        count += deleted;
    }

    Ok(count)
}

#[tauri::command]
pub async fn extension_space_get_assignments(
    window: tauri::Window,
    db: State<'_, AppDatabase>,
    webview_manager: State<'_, ExtensionWebviewManager>,
    public_key: Option<String>,
    name: Option<String>,
    table_name: String,
    row_pks: Option<String>,
) -> Result<Vec<SpaceAssignmentResult>, String> {
    let ext_id = resolve_extension_id(&window, &webview_manager, public_key, name)?;
    let prefix = get_extension_table_prefix(&ext_id.public_key, &ext_id.name);
    validate_table_prefix(&table_name, &prefix)?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let results = if let Some(ref pks) = row_pks {
        let mut stmt = conn.prepare(
            "SELECT table_name, row_pks, space_id FROM haex_shared_space_sync WHERE table_name = ?1 AND row_pks = ?2"
        ).map_err(|e| e.to_string())?;
        stmt.query_map(rusqlite::params![table_name, pks], |row| {
            Ok(SpaceAssignmentResult {
                table_name: row.get(0)?,
                row_pks: row.get(1)?,
                space_id: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect()
    } else {
        let mut stmt = conn.prepare(
            "SELECT table_name, row_pks, space_id FROM haex_shared_space_sync WHERE table_name = ?1"
        ).map_err(|e| e.to_string())?;
        stmt.query_map(rusqlite::params![table_name], |row| {
            Ok(SpaceAssignmentResult {
                table_name: row.get(0)?,
                row_pks: row.get(1)?,
                space_id: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect()
    };

    Ok(results)
}
```

**Important:** Check the exact types and function signatures in:
- `/home/haex/Projekte/haex-vault/src-tauri/src/extension/utils.rs` for `resolve_extension_id` and `get_extension_table_prefix`
- `/home/haex/Projekte/haex-vault/src-tauri/src/extension/database/commands.rs` for how `AppDatabase`, `State`, and `ExtensionWebviewManager` are used
- Adapt struct names and imports as needed to match the actual codebase

### Step 3: Register module

In `/home/haex/Projekte/haex-vault/src-tauri/src/extension/mod.rs`, add:

```rust
pub mod spaces;
```

### Step 4: Register commands in lib.rs

In `/home/haex/Projekte/haex-vault/src-tauri/src/lib.rs`, add to the `invoke_handler![]` macro (around line 219):

```rust
extension::spaces::commands::extension_space_assign,
extension::spaces::commands::extension_space_unassign,
extension::spaces::commands::extension_space_get_assignments,
```

### Step 5: Verify it compiles

```bash
cd /home/haex/Projekte/haex-vault && cargo check --manifest-path src-tauri/Cargo.toml
```

### Step 6: Commit

```bash
git add src-tauri/src/extension/spaces/ src-tauri/src/extension/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for space row assignments"
```

---

## Task 3: Internal Scanner for Space-Filtered Rows

The vault's own sync engine also needs to query `haex_shared_space_sync` when pushing to space backends. This does NOT go through the extension API — it's internal vault logic.

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src/stores/sync/tableScanner.ts`

### Step 1: Add a space-filtered scan function

Add a new exported function `scanTableForSpaceChangesAsync` that wraps the existing scanner with a subquery filter. Add after the existing `scanTableForChangesAsync` function:

```typescript
/**
 * Scan a table for changes that are assigned to a specific space.
 * Returns only rows that have an entry in haex_shared_space_sync for the given spaceId.
 * If the table has no assignments for this space at all, returns empty array.
 */
export async function scanTableForSpaceChangesAsync(
  tableName: string,
  spaceId: string,
  lastPushHlcTimestamp: string | null,
  vaultKey: Uint8Array,
  batchId: string,
  deviceId: string,
): Promise<Omit<ColumnChange, 'batchSeq' | 'batchTotal'>[]> {
  // First check if this table has ANY assignments for this space
  const assignmentCheck = await invoke<unknown[][]>('sql_select', {
    sql: `SELECT 1 FROM haex_shared_space_sync WHERE table_name = ? AND space_id = ? LIMIT 1`,
    params: [tableName, spaceId],
  })

  if (!assignmentCheck || assignmentCheck.length === 0) {
    return []
  }

  // Get table schema
  const schema = await getTableSchemaAsync(tableName)
  const pkColumns = schema.filter(c => c.isPk).map(c => c.name)
  const dataColumns = schema
    .filter(c => !c.isPk)
    .map(c => c.name)
    .filter(c =>
      c !== CRDT_COLUMNS.haexTimestamp
      && c !== CRDT_COLUMNS.haexColumnHlcs
      && !SYNC_METADATA_COLUMNS.includes(c)
    )

  if (dataColumns.length === 0) return []

  // Build PK expression for JOIN: json_object('id', t.id) for single PK
  // or json_object('col1', t.col1, 'col2', t.col2) for composite
  const pkJsonParts = pkColumns.map(pk => `'${pk}', t."${pk}"`).join(', ')
  const pkJsonExpr = `json_object(${pkJsonParts})`

  // Build query with JOIN against assignment table
  const allColumns = [...pkColumns, ...dataColumns, CRDT_COLUMNS.haexTimestamp, CRDT_COLUMNS.haexColumnHlcs]
  const selectCols = allColumns.map(c => `t."${c}"`).join(', ')

  const whereClause = lastPushHlcTimestamp
    ? `AND t."${CRDT_COLUMNS.haexTimestamp}" > ?`
    : ''

  const params: unknown[] = [tableName, spaceId]
  if (lastPushHlcTimestamp) params.push(lastPushHlcTimestamp)

  const query = `
    SELECT ${selectCols}
    FROM "${tableName}" t
    INNER JOIN haex_shared_space_sync a
      ON a.table_name = ? AND a.space_id = ? AND a.row_pks = ${pkJsonExpr}
    WHERE 1=1 ${whereClause}
    ORDER BY t."${CRDT_COLUMNS.haexTimestamp}" ASC
  `

  const rows = await invoke<unknown[][]>('sql_select', { sql: query, params })
  if (!rows || rows.length === 0) return []

  // Process rows identically to scanTableForChangesAsync
  // (extract column HLCs, encrypt changed columns, build ColumnChange objects)
  // ... reuse the same row-processing logic from the existing function
```

**Implementation note:** The row-processing logic (lines ~140-210 in the existing `scanTableForChangesAsync`) should be extracted into a shared helper function to avoid duplication. Both `scanTableForChangesAsync` and `scanTableForSpaceChangesAsync` call it.

### Step 2: Extract shared row-processing helper

Refactor: extract the loop body of `scanTableForChangesAsync` (the part that processes each row, reads HLCs, encrypts columns) into a reusable helper:

```typescript
async function processScannedRowsAsync(
  rows: unknown[][],
  tableName: string,
  pkColumns: string[],
  dataColumns: string[],
  allColumns: string[],
  lastPushHlcTimestamp: string | null,
  vaultKey: Uint8Array,
  batchId: string,
  deviceId: string,
): Promise<Omit<ColumnChange, 'batchSeq' | 'batchTotal'>[]>
```

Both scan functions call this helper with their respective query results.

### Step 3: Commit

```bash
git add src/stores/sync/tableScanner.ts
git commit -m "feat: add space-filtered table scanner with shared row processing"
```

---

## Task 4: Push Logic — Use Space Scanner for Space Backends

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src/stores/sync/orchestrator/push.ts` (lines 104-109 TODO, line 135 loop)

### Step 1: Import the new scanner

Add import at top of push.ts:

```typescript
import { scanTableForSpaceChangesAsync } from '../tableScanner'
```

### Step 2: Replace TODO with space filtering in `pushToBackendAsync`

At line 104-109, replace the TODO comment block. In the `for` loop at line 135, use the space scanner when `isSpaceBackend`:

```typescript
// In the for loop, replace the scanTableForChangesAsync call:
const changes = isSpaceBackend
  ? await scanTableForSpaceChangesAsync(
      tableName, backend.spaceId!, lastPushHlc, encryptionKey, batchId, deviceId,
    )
  : await scanTableForChangesAsync(
      tableName, lastPushHlc, encryptionKey, batchId, deviceId,
    )
```

### Step 3: Apply same filter in `pushAllDataToBackendAsync`

In the full-push function (around line 451), apply the same branching:

```typescript
const changes = isSpaceBackend
  ? await scanTableForSpaceChangesAsync(
      tableName, backend.spaceId!, null, encryptionKey, batchId, deviceId,
    )
  : await scanTableForChangesAsync(
      tableName, null, encryptionKey, batchId, deviceId,
    )
```

### Step 4: Fix cleanup in `pushAllDataToBackendAsync`

The cleanup loop (around line 520) clears ALL dirty tables. For space backends, this is wrong — it would clear dirty entries for tables the space never synced. Fix:

For space backends, do NOT clear dirty tables in `pushAllDataToBackendAsync`. Only the personal backend should clear them. The space backend piggybacks on dirty-table entries that the personal backend manages.

### Step 5: Verify typecheck

```bash
cd /home/haex/Projekte/haex-vault && npx nuxi typecheck
```

### Step 6: Commit

```bash
git add src/stores/sync/orchestrator/push.ts
git commit -m "feat: space backends push only assigned rows"
```

---

## Task 5: SDK Command Constants + API Module

**Files:**
- Create: `/home/haex/Projekte/haex-vault-sdk/src/commands/spaces.ts`
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/commands/index.ts` (add export)
- Create: `/home/haex/Projekte/haex-vault-sdk/src/api/spaces.ts`
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/client.ts` (add `spaces` property)
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/index.ts` (export new types)

### Step 1: Create command constants

Create `/home/haex/Projekte/haex-vault-sdk/src/commands/spaces.ts`:

```typescript
export const SPACE_COMMANDS = {
  assign: 'extension_space_assign',
  unassign: 'extension_space_unassign',
  getAssignments: 'extension_space_get_assignments',
} as const
```

### Step 2: Export from commands index

In `/home/haex/Projekte/haex-vault-sdk/src/commands/index.ts`, add:

```typescript
export { SPACE_COMMANDS } from './spaces'
```

### Step 3: Create API module

Create `/home/haex/Projekte/haex-vault-sdk/src/api/spaces.ts`:

```typescript
import { SPACE_COMMANDS } from '../commands/spaces'
import type { HaexVaultSdk } from '../client'

export interface SpaceAssignment {
  tableName: string
  rowPks: string
  spaceId: string
}

export class SpacesAPI {
  constructor(private client: HaexVaultSdk) {}

  /**
   * Assign rows to a shared space. Only tables owned by this extension are allowed.
   * @param assignments - Array of { tableName, rowPks (JSON), spaceId }
   * @returns Number of assignments created
   */
  async assignAsync(assignments: SpaceAssignment[]): Promise<number> {
    return this.client.request<number>(SPACE_COMMANDS.assign, {
      assignments: assignments.map(a => ({
        table_name: a.tableName,
        row_pks: a.rowPks,
        space_id: a.spaceId,
      })),
    })
  }

  /**
   * Remove rows from a shared space.
   * @param assignments - Array of { tableName, rowPks (JSON), spaceId }
   * @returns Number of assignments removed
   */
  async unassignAsync(assignments: SpaceAssignment[]): Promise<number> {
    return this.client.request<number>(SPACE_COMMANDS.unassign, {
      assignments: assignments.map(a => ({
        table_name: a.tableName,
        row_pks: a.rowPks,
        space_id: a.spaceId,
      })),
    })
  }

  /**
   * Get space assignments for a table (optionally filtered by row).
   * Only returns assignments for tables owned by this extension.
   */
  async getAssignmentsAsync(
    tableName: string,
    rowPks?: string,
  ): Promise<SpaceAssignment[]> {
    const results = await this.client.request<Array<{
      table_name: string
      row_pks: string
      space_id: string
    }>>(SPACE_COMMANDS.getAssignments, {
      table_name: tableName,
      row_pks: rowPks ?? null,
    })
    return results.map(r => ({
      tableName: r.table_name,
      rowPks: r.row_pks,
      spaceId: r.space_id,
    }))
  }

  /**
   * Convenience: assign a single row to a space.
   */
  async assignRowAsync(tableName: string, rowPks: string, spaceId: string): Promise<void> {
    await this.assignAsync([{ tableName, rowPks, spaceId }])
  }

  /**
   * Convenience: remove a single row from a space.
   */
  async unassignRowAsync(tableName: string, rowPks: string, spaceId: string): Promise<void> {
    await this.unassignAsync([{ tableName, rowPks, spaceId }])
  }
}
```

### Step 4: Add to client class

In `/home/haex/Projekte/haex-vault-sdk/src/client.ts`:

Add import:
```typescript
import { SpacesAPI } from './api/spaces'
```

Add property alongside the other API namespaces (around line 85):
```typescript
public readonly spaces: SpacesAPI;
```

Initialize in constructor (alongside the other `this.X = new XApi(this)` calls):
```typescript
this.spaces = new SpacesAPI(this);
```

### Step 5: Export types from index

In `/home/haex/Projekte/haex-vault-sdk/src/index.ts`, add:

```typescript
export { SpacesAPI, type SpaceAssignment } from './api/spaces'
```

### Step 6: Also add to iframe message handler in vault

In `/home/haex/Projekte/haex-vault/src/composables/extensionMessageHandler.ts`, add routing for the new commands. Find the switch/if chain and add handlers that forward to Tauri invoke, similar to `handleDatabaseMethodAsync`.

### Step 7: Build + typecheck

```bash
cd /home/haex/Projekte/haex-vault-sdk && pnpm build && npx tsc --noEmit
```

### Step 8: Commit

```bash
cd /home/haex/Projekte/haex-vault-sdk
git add src/commands/spaces.ts src/commands/index.ts src/api/spaces.ts src/client.ts src/index.ts
git commit -m "feat: add spaces API for row-to-space assignments"
```

---

## Task 6: Vault iframe Handler for Space Commands

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src/composables/extensionMessageHandler.ts`
- Create: `/home/haex/Projekte/haex-vault/src/composables/handlers/spaces.ts`

### Step 1: Create handler

Create `/home/haex/Projekte/haex-vault/src/composables/handlers/spaces.ts`, following the pattern from `handlers/database.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core'
import type { SelectHaexExtensions } from '@/database/schemas/haex'

export async function handleSpacesMethodAsync(
  request: { method: string; params: Record<string, unknown> },
  extension: SelectHaexExtensions,
) {
  const params = {
    ...request.params,
    publicKey: extension.publicKey,
    name: extension.name,
  }
  return invoke(request.method, params)
}
```

### Step 2: Register in message handler

In `extensionMessageHandler.ts`, add:
- Import `handleSpacesMethodAsync`
- Add case for `extension_space_*` methods in the routing switch

### Step 3: Commit

```bash
cd /home/haex/Projekte/haex-vault
git add src/composables/handlers/spaces.ts src/composables/extensionMessageHandler.ts
git commit -m "feat: route space assignment commands for iframe extensions"
```

---

## Task 7: Calendar Integration — Share Dialog + Assignments

**Files:**
- Modify: `/home/haex/Projekte/haextension/apps/haex-calendar/app/stores/calendars.ts`
- Modify: `/home/haex/Projekte/haextension/apps/haex-calendar/app/stores/events.ts`
- Create: `/home/haex/Projekte/haextension/apps/haex-calendar/app/components/calendar/ShareDialog.vue`
- Modify: `/home/haex/Projekte/haextension/apps/haex-calendar/app/components/calendar/Sidebar.vue` (wire share button)

### Step 1: Add share/unshare methods to calendars store

In `calendars.ts`, add methods that:
1. Call `haexVault.client.spaces.assignAsync()` for the calendar row
2. Call `haexVault.client.spaces.assignAsync()` for ALL events in that calendar
3. Store the `spaceId` on the calendar's `space_id` field (existing column)

```typescript
async function shareCalendarWithSpaceAsync(calendarId: string, spaceId: string) {
  const calendar = calendars.value.find(c => c.id === calendarId)
  if (!calendar) throw new Error('Calendar not found')

  // Get all events for this calendar
  const allEvents = await db.select().from(events).where(eq(events.calendarId, calendarId))

  // Build assignments
  const assignments: SpaceAssignment[] = [
    { tableName: CALENDARS_TABLE, rowPks: JSON.stringify({ id: calendarId }), spaceId },
    ...allEvents.map(e => ({
      tableName: EVENTS_TABLE,
      rowPks: JSON.stringify({ id: e.id }),
      spaceId,
    })),
  ]

  await haexVault.client.spaces.assignAsync(assignments)

  // Update calendar's space_id (for UI indicator)
  await db.update(calendarsTable).set({ spaceId }).where(eq(calendarsTable.id, calendarId))
}
```

### Step 2: Auto-assign new events

In `events.ts`, when creating a new event in a shared calendar, also assign it:

```typescript
async function createEventAsync(eventData: NewEvent) {
  // ... existing insert logic ...

  // If calendar is shared, assign new event to same spaces
  const assignments = await haexVault.client.spaces.getAssignmentsAsync(
    CALENDARS_TABLE,
    JSON.stringify({ id: eventData.calendarId }),
  )

  if (assignments.length > 0) {
    await haexVault.client.spaces.assignAsync(
      assignments.map(a => ({
        tableName: EVENTS_TABLE,
        rowPks: JSON.stringify({ id: newEventId }),
        spaceId: a.spaceId,
      })),
    )
  }
}
```

### Step 3: Create ShareDialog.vue

A dialog that:
1. Lists available shared spaces (fetched from vault)
2. Shows which spaces this calendar is already shared with
3. Toggle to add/remove space assignments
4. Calls `shareCalendarWithSpaceAsync` / `unshareCalendarFromSpaceAsync`

Implementation details depend on the UI framework (shadcn/Nuxt UI). Follow existing dialog patterns in the calendar codebase.

### Step 4: Wire share button in Sidebar

Replace the `console.log("Share not yet implemented")` placeholder with opening the ShareDialog.

### Step 5: Commit

```bash
cd /home/haex/Projekte/haextension
git add apps/haex-calendar/
git commit -m "feat: calendar sharing via shared spaces"
```

---

## Task 8: Publish + Release

### Step 1: Publish vault-sdk

```bash
cd /home/haex/Projekte/haex-vault-sdk
pnpm build && pnpm version patch --no-git-tag-version
git add -A && git commit -m "feat: spaces API for row assignments"
git push origin main && git tag v2.5.X && git push origin v2.5.X
```

### Step 2: Update vault dependency + release

```bash
cd /home/haex/Projekte/haex-vault
pnpm update @haex-space/vault-sdk
npx nuxi typecheck
git add -A && git commit -m "feat: shared space sync with row-level filtering"
npm version patch --no-git-tag-version && git add package.json
git commit -m "chore: bump version" && git push origin main
git tag v1.5.X && git push origin v1.5.X
```

### Step 3: Update calendar SDK dependency + release

```bash
cd /home/haex/Projekte/haextension
pnpm update @haex-space/vault-sdk --filter haex-calendar
git add -A && git commit -m "feat: calendar sharing via shared spaces"
```

---

## Open Questions / Future Work

1. **Pull-side for space members:** When a user joins a space, they need an initial pull of all data from the space backend into their local DB. The current `performInitialPullAsync` is personal-vault-specific.

2. **Realtime for spaces:** Supabase Realtime subscription doesn't cover space backends yet. Space members currently rely on periodic polling (5 min fallback) to get updates.

3. **Delete propagation:** When a row is deleted locally (soft-delete via `haex_tombstone`), the tombstone pushes to the space. But what about removing from the mapping table?

4. **Space key generation > 1:** Currently hardcoded to `generation=1`. Key rotation needs wiring.

5. **Viewer role enforcement:** The server rejects pushes from viewers, but the client doesn't prevent attempting it. UI should hide editing for viewer-role spaces.
