# CalDAV Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable haex-calendar to fetch and edit calendar data from external CalDAV servers.

**Architecture:** CalDAV protocol lives in the calendar extension, HTTP via Vault SDK WebAPI. Accounts stored in synced DB table, credentials included. Read-write from day one (PUT with ETag conflict detection).

**Tech Stack:** ical.js (existing), CalDAV/WebDAV (PROPFIND, REPORT, PUT), Vault SDK WebAPI, Drizzle ORM, Vue 3 + Nuxt 4

**Design Doc:** `docs/plans/2026-03-10-caldav-integration-design.md`

---

## Task 1: Extend HTTP method support (Vault + SDK)

The Rust web fetch handler and SDK type restrict HTTP methods to standard ones. CalDAV needs PROPFIND and REPORT.

**Files:**
- Modify: `/home/haex/Projekte/haex-vault/src-tauri/src/extension/web/helpers.rs:27-39`
- Modify: `/home/haex/Projekte/haex-vault-sdk/src/types.ts:362-366`

**Step 1: Fix Rust handler — replace match with `reqwest::Method::from_bytes()`**

In `helpers.rs`, replace the match block (lines 27-39) with:

```rust
let method = reqwest::Method::from_bytes(method_str.to_uppercase().as_bytes())
    .map_err(|e| ExtensionError::WebError {
        reason: format!("Invalid HTTP method '{}': {}", method_str, e),
    })?;
let mut req_builder = client.request(method, &request.url);
```

**Step 2: Widen SDK TypeScript type**

In `types.ts`, change line 363 from:
```typescript
method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
```
to:
```typescript
method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS" | "PROPFIND" | "REPORT" | (string & {});
```

The `(string & {})` allows any string while keeping autocomplete for known methods.

**Step 3: Build SDK, bump version, commit**

```bash
cd /home/haex/Projekte/haex-vault-sdk && pnpm build
npm version patch --no-git-tag-version
git add -A && git commit -m "feat: support arbitrary HTTP methods (PROPFIND, REPORT, etc.)"
git tag v$(node -p "require('./package.json').version")
git push origin main --tags
```

**Step 4: Commit vault Rust change**

```bash
cd /home/haex/Projekte/haex-vault
git add src-tauri/src/extension/web/helpers.rs
git commit -m "feat: support arbitrary HTTP methods in web fetch handler"
git push
```

---

## Task 2: Database schema — CalDAV accounts + calendar/event extensions

**Files:**
- Modify: `apps/haex-calendar/app/database/schemas/index.ts`
- Create: `apps/haex-calendar/app/database/migrations/0002_caldav.sql`
- Modify: `apps/haex-calendar/app/database/migrations/meta/_journal.json`

**Step 1: Add `caldavAccounts` table to schema**

In `schemas/index.ts`, add after the `settings` table:

```typescript
/**
 * CalDAV Accounts — connection info for external CalDAV servers (synced across devices).
 */
export const caldavAccounts = sqliteTable(
  tableName("caldav_accounts"),
  {
    id: text().primaryKey(),
    name: text().notNull(),
    serverUrl: text("server_url").notNull(),
    username: text().notNull(),
    password: text().notNull(),
    principalUrl: text("principal_url"),       // Discovered principal URL (cached)
    calendarHomeUrl: text("calendar_home_url"), // Discovered calendar home (cached)
    lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
    ...timestamps,
  }
);
export type InsertCaldavAccount = typeof caldavAccounts.$inferInsert;
export type SelectCaldavAccount = typeof caldavAccounts.$inferSelect;
```

**Step 2: Add CalDAV columns to `calendars` table**

Add these columns to the existing `calendars` table definition:

```typescript
caldavAccountId: text("caldav_account_id"),  // FK → caldav_accounts. null = local
caldavPath: text("caldav_path"),              // Calendar path on server
caldavCtag: text("caldav_ctag"),              // CTag for change detection
```

**Step 3: Add CalDAV columns to `events` table**

Add these columns to the existing `events` table definition:

```typescript
etag: text(),    // HTTP ETag for conflict detection
href: text(),    // CalDAV resource URL
```

**Step 4: Write migration SQL**

Create `0002_caldav.sql`:

```sql
CREATE TABLE IF NOT EXISTS `{prefix}_caldav_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `server_url` text NOT NULL,
  `username` text NOT NULL,
  `password` text NOT NULL,
  `principal_url` text,
  `calendar_home_url` text,
  `last_sync_at` integer,
  `created_at` integer DEFAULT (unixepoch()),
  `updated_at` integer DEFAULT (unixepoch())
);

ALTER TABLE `{prefix}_calendars` ADD COLUMN `caldav_account_id` text;
ALTER TABLE `{prefix}_calendars` ADD COLUMN `caldav_path` text;
ALTER TABLE `{prefix}_calendars` ADD COLUMN `caldav_ctag` text;

ALTER TABLE `{prefix}_events` ADD COLUMN `etag` text;
ALTER TABLE `{prefix}_events` ADD COLUMN `href` text;
```

Note: `{prefix}` must be replaced with the actual table prefix from `tableName()`. Check existing migrations for the pattern.

**Step 5: Update `_journal.json` with new migration entry**

**Step 6: Commit**

```bash
git add apps/haex-calendar/app/database/
git commit -m "feat(caldav): add database schema for CalDAV accounts and sync metadata"
```

---

## Task 3: CalDAV protocol composable (`useCaldav.ts`)

Core CalDAV protocol implementation using WebAPI as HTTP transport.

**Files:**
- Create: `apps/haex-calendar/app/composables/useCaldav.ts`

**Implementation:**

The composable provides these functions:

1. `discoverAsync(serverUrl, username, password)` — Full CalDAV discovery:
   - GET `/.well-known/caldav` (follow redirects)
   - PROPFIND for `current-user-principal`
   - PROPFIND for `calendar-home-set`
   - PROPFIND Depth:1 on calendar home → list calendars with name, color, path, ctag

2. `fetchEventsAsync(caldavPath, account, timeRange?)` — Fetch events:
   - PROPFIND on calendar → get current CTag
   - REPORT `calendar-query` with optional `time-range` filter → HREFs + ETags
   - REPORT `calendar-multiget` for changed events → ICS data

3. `putEventAsync(href, icsData, etag?, account)` — Write event:
   - PUT with `If-Match` header (if etag provided)
   - Return new ETag from response

4. `deleteEventAsync(href, etag, account)` — Delete event:
   - DELETE with `If-Match` header

Helper: `buildAuthHeaders(username, password)` — Base64-encode Basic Auth header.

All HTTP via `haexVault.client.web.fetchAsync()` with `method: "PROPFIND"` etc.

XML parsing: Use browser-native `DOMParser` for parsing CalDAV XML responses. Build XML request bodies as template strings.

**Step 1: Implement the composable with all 4 functions + helpers**

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/composables/useCaldav.ts
git commit -m "feat(caldav): add CalDAV protocol composable"
```

---

## Task 4: CalDAV accounts store (`caldavAccounts.ts`)

**Files:**
- Create: `apps/haex-calendar/app/stores/caldavAccounts.ts`

**Implementation:**

Pinia store for CRUD on `caldav_accounts` table:

- `accounts: ref<SelectCaldavAccount[]>`
- `loadAccountsAsync()` — load all accounts from DB
- `createAccountAsync(data)` — insert + reload
- `updateAccountAsync(id, data)` — update + reload
- `deleteAccountAsync(id)` — delete account + associated calendars + their events
- `getAccount(id)` — return from reactive list

**Step 1: Implement store**

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/stores/caldavAccounts.ts
git commit -m "feat(caldav): add CalDAV accounts store"
```

---

## Task 5: CalDAV sync store (`caldavSync.ts`)

**Files:**
- Create: `apps/haex-calendar/app/stores/caldavSync.ts`

**Implementation:**

Pinia store for sync orchestration:

- `isSyncing: ref<boolean>`
- `syncError: ref<string | null>`
- `syncCalendarAsync(calendarId)` — single calendar sync:
  1. Load calendar + its CalDAV account from DB
  2. CTag check (PROPFIND) — if unchanged, skip
  3. Fetch event list (REPORT calendar-query with time-range)
  4. Compare ETags with local events
  5. Fetch changed events (REPORT calendar-multiget)
  6. Parse ICS (reuse existing `parseICS`)
  7. Upsert events in DB (UID-based, update if ETag differs)
  8. Delete local events not present on server
  9. Update calendar CTag + account lastSyncAt
- `syncAllRemoteCalendarsAsync()` — sync all calendars with `caldavAccountId != null`
- `pushEventAsync(eventId)` — push single event to CalDAV server:
  1. Load event + calendar + account
  2. Generate ICS for single event
  3. PUT to server with If-Match ETag
  4. Update local ETag from response

**Step 1: Implement store**

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/stores/caldavSync.ts
git commit -m "feat(caldav): add CalDAV sync orchestration store"
```

---

## Task 6: CaldavAccountDialog component

**Files:**
- Create: `apps/haex-calendar/app/components/calendar/CaldavAccountDialog.vue`

**Implementation:**

Multi-step dialog using existing `UiDrawerModal`:

**Step 1 (Connect):**
- Fields: Name, Server URL, Username, Password
- "Connect" button → runs discovery
- Shows spinner during discovery, error on failure

**Step 2 (Select calendars):**
- List of discovered calendars with checkboxes, color dots, names
- "Subscribe" button → creates caldav_accounts entry + calendar entries for selected calendars
- Triggers initial sync after creation

i18n: German + English

**Step 1: Implement component**

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/components/calendar/CaldavAccountDialog.vue
git commit -m "feat(caldav): add CalDAV account setup dialog"
```

---

## Task 7: Update sidebar — "Add calendar" dropdown + remote calendar display

**Files:**
- Modify: `apps/haex-calendar/app/pages/index.vue`

**Changes:**

1. Replace the `+` button (line 119-125) with a `ShadcnDropdownMenu`:
   - "Lokaler Kalender" → opens existing `CreateDialog`
   - "CalDAV-Account" → opens new `CaldavAccountDialog`

2. In the calendar list: group remote calendars under their account name, show Cloud icon (from lucide: `CloudIcon`) next to remote calendar names.

3. Context menu for remote calendars: add "Jetzt synchronisieren" option.

4. Add `CaldavAccountDialog` component usage (like `ShareDialog` pattern).

5. On mount: after loading calendars, trigger `syncAllRemoteCalendarsAsync()`.

6. Add i18n strings for new UI elements.

**Step 1: Implement changes**

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/pages/index.vue
git commit -m "feat(caldav): add calendar type dropdown and remote calendar display in sidebar"
```

---

## Task 8: Update EventDrawer — push changes to CalDAV server

**Files:**
- Modify: `apps/haex-calendar/app/stores/events.ts`
- Modify: `apps/haex-calendar/app/components/calendar/EventDrawer.vue`

**Changes in events.ts:**

In `updateEventAsync`: after the DB update, check if the event's calendar has `caldavAccountId`. If so, call `caldavSync.pushEventAsync(id)`. Handle errors with toast notification.

In `createEventAsync`: if creating in a remote calendar, also push to CalDAV server.

In `deleteEventAsync`: if deleting from a remote calendar, also DELETE on CalDAV server.

**Changes in EventDrawer.vue:**

- Show toast on CalDAV push success/failure
- No visual difference for remote events (they're fully editable)

**Step 1: Implement changes**

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/stores/events.ts apps/haex-calendar/app/components/calendar/EventDrawer.vue
git commit -m "feat(caldav): push event changes to CalDAV server on save/delete"
```

---

## Task 9: Update manifest + trigger sync on range change

**Files:**
- Modify: `apps/haex-calendar/haextension/manifest.json`
- Modify: `apps/haex-calendar/app/pages/index.vue`

**Manifest changes:**

Add `web` permission to declare that the extension makes external HTTP requests:

```json
{
  "permissions": {
    "database": [],
    "filesystem": [],
    "shell": [],
    "web": []
  }
}
```

(Empty array = no pre-approved URLs, user gets prompted on first CalDAV request. Alternatively could add a wildcard or leave for runtime approval.)

**Range change sync:**

In `index.vue`, update the `watchDebounced` (line 377-381) that reacts to `visibleRange` changes: after `eventsStore.loadEventsAsync()`, also trigger `caldavSync.syncAllRemoteCalendarsAsync()` (non-blocking, in background).

**Step 1: Implement changes**

**Step 2: Commit**

```bash
git add apps/haex-calendar/haextension/manifest.json apps/haex-calendar/app/pages/index.vue
git commit -m "feat(caldav): update manifest permissions, sync on range change"
```

---

## Task 10: Final integration — update SDK dep, typecheck, commit

**Steps:**

1. Wait for SDK publish CI
2. Update SDK dep in calendar: `pnpm add @haex-space/vault-sdk@latest`
3. Run typecheck: `cd apps/haex-calendar && npx nuxt typecheck`
4. Fix any type errors
5. Final commit + push

```bash
git add -A
git commit -m "feat(caldav): complete CalDAV integration"
git push
```
