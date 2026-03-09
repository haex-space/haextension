# CalDAV Integration Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable haex-calendar to fetch and edit calendar data from external CalDAV servers.

**Architecture:** CalDAV protocol implementation lives entirely in the calendar extension. HTTP requests go through the Vault SDK's WebAPI (`web.fetchAsync()`) to bypass CORS. Account configuration syncs across devices, credentials included (encrypted in sync payload).

**Tech Stack:** ical.js (existing), CalDAV/WebDAV protocol (PROPFIND, REPORT, PUT), Vault SDK WebAPI

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sync direction | Read-write, designed for full bidirectional later | Immediate PUT on edit, no offline queue yet |
| HTTP transport | Vault SDK `web.fetchAsync()` | CORS-free, no new vault code needed |
| Authentication | Basic Auth | Covers Nextcloud, Radicale, Baikal, SOGo. Cloud providers via app-passwords. OAuth deferred. |
| Credential storage | `caldav_accounts` table (synced) | Vault encrypts sync payloads, so password in plaintext in DB is fine |
| Data model | Calendar-level linkage | `caldavAccountId` on calendars table. Events inherit remote status from their calendar. |
| Sync trigger | On open + on date range change + manual | No interval timer (iframe reloads on open anyway) |
| Editability | Full edit if server allows | PUT with If-Match ETag. 403 = no permission, 412 = conflict. Server is source of truth. |

---

## Data Model

### New table: `caldav_accounts` (synced)

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| `name` | text | Display name (e.g. "Nextcloud Work") |
| `server_url` | text | CalDAV principal URL |
| `username` | text | Basic Auth username |
| `password` | text | Basic Auth password |
| `last_sync_at` | integer, nullable | Timestamp of last sync |
| `created_at` | integer | Timestamp |

### Extended: `calendars` table

| New Column | Type | Description |
|------------|------|-------------|
| `caldav_account_id` | text, nullable | FK → caldav_accounts. null = local, non-null = remote |
| `caldav_path` | text, nullable | Calendar path on server (e.g. `/dav/calendars/user/personal/`) |
| `caldav_ctag` | text, nullable | Collection CTag for change detection |

### Extended: `events` table

| New Column | Type | Description |
|------------|------|-------------|
| `etag` | text, nullable | HTTP ETag for conflict detection |
| `href` | text, nullable | CalDAV resource URL |

---

## CalDAV Protocol Flow

### Discovery (once per account)

1. `GET /.well-known/caldav` → follow redirect to CalDAV root
2. `PROPFIND` on root with `current-user-principal` → user's principal path
3. `PROPFIND` on principal with `calendar-home-set` → calendar container
4. `PROPFIND` on calendar home with Depth 1 → list all calendars (name, color, CTag)

### Sync Flow (on open + range change)

1. **CTag check**: `PROPFIND` on calendar → current CTag. If unchanged → done (1 request).
2. **List changes**: `REPORT calendar-query` with `time-range` filter → event HREFs + ETags
3. **Delta**: Compare ETags with local. Only fetch changed/new events.
4. **Fetch**: `REPORT calendar-multiget` for changed HREFs → ICS data
5. **Upsert**: Parse ICS (existing `parseICS`), upsert events by UID, remove deleted events
6. **Update CTag**: Store new CTag locally

### Write Flow (on event save)

1. Generate ICS from event data (existing `generateICS` adapted for single event)
2. `PUT` to `href` with `If-Match: <etag>` header
3. On success: store new ETag from response
4. On `412 Precondition Failed`: re-fetch server version, notify user
5. On `403 Forbidden`: show "no permission" error
6. New events: `PUT` to `{caldav_path}/{uid}.ics` (no If-Match)

---

## Architecture Components

### New files

| File | Responsibility |
|------|---------------|
| `composables/useCaldav.ts` | CalDAV protocol: discovery, PROPFIND, REPORT, PUT. Uses `web.fetchAsync()` as transport. |
| `stores/caldavAccounts.ts` | CRUD for CalDAV accounts in DB |
| `stores/caldavSync.ts` | Sync orchestration: CTag check, delta sync, event upsert, event push |
| `components/calendar/CaldavAccountDialog.vue` | UI: add account (URL + credentials), calendar discovery, calendar selection |
| `database/migrations/0002_caldav.sql` | Schema migration |

### Modified files

| File | Change |
|------|--------|
| `database/schemas/index.ts` | Add `caldavAccounts` table + new columns on `calendars` and `events` |
| `stores/events.ts` | After DB query: trigger CalDAV sync for visible remote calendars |
| `stores/calendars.ts` | Deleting a remote calendar = remove subscription (not server delete) |
| `components/calendar/EventDrawer.vue` | On save: if event belongs to remote calendar, PUT to CalDAV server |
| Calendar sidebar (CalendarList or similar) | "Add calendar" becomes dropdown: "Local calendar" / "CalDAV account". Remote calendars show cloud icon, grouped by account. |

---

## UI Flow

### Adding a calendar

1. "Add calendar" button → dropdown: "Local calendar" | "CalDAV account"
2. "CalDAV account" → dialog: Name, Server URL, Username, Password
3. Click "Connect" → discovery runs (well-known → principal → calendar home → list)
4. On error: show message in dialog
5. On success: list of discovered calendars with checkboxes, name, color from server
6. User selects calendars, clicks "Subscribe"
7. Selected calendars appear in sidebar with cloud icon
8. First sync starts immediately in background

### Calendar sidebar

- Local calendars: color dot + name (as before)
- Remote calendars: color dot + name + cloud icon, grouped under account name
- Context menu on account: "Manage calendars", "Edit account", "Remove account"
- Context menu on remote calendar: "Sync now", "Remove subscription"

### Sync feedback

- During sync: spinner icon on account/calendar
- On sync error: red warning icon on account, tooltip with error message

### Event editing (remote)

- Remote events fully editable in EventDrawer
- On save: immediate PUT to CalDAV server
- On error: toast notification, local change discarded (server = source of truth)
