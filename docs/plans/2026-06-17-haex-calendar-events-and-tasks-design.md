# haex-calendar: Events, Tasks, Event-Types, Reminders & Recurrence

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend haex-calendar with two distinct item kinds (Termin/event and Aufgabe/task), user-defined event types ("Termin-Arten") that carry default reminders and recurrence, multiple OS notifications per item, and full iCal RRULE recurrence — including Things-style completion advance for recurring tasks.

**Scope additions to the SDK:** A new generic `notifications` API in `haex-vault-sdk` plus matching host-side commands in `haex-vault`, designed to be reused by any extension.

**Tech Stack:** Drizzle ORM (SQLite, existing), [rrule.js](https://www.npmjs.com/package/rrule) (new dependency), `tauri-plugin-notification` (already loaded in the vault), Vue 3 + Pinia (existing).

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Termin vs Aufgabe | Same `events` table, distinguished by `kind` column (`event` / `task`) | Avoids parallel tables for largely identical iCal fields; `dtend` becomes nullable for tasks |
| Event-Type binding | Hybrid: type is the default, per-field override possible | Renaming "Geburtstag" reminders updates all birthdays without explicit override; users can still customise a single instance |
| Task completion | `completed_at` timestamp; recurring tasks advance `dtstart` to next occurrence | Things-style; no history log (YAGNI) |
| Reminder transport | OS notification via SDK call to vault → `tauri_plugin_notification` | Extensions can't fire OS notifications themselves; bridge through host |
| Reminder scheduling | In-memory min-heap, 24h lookahead, recomputed on changes | Reminders only fire while haex-vault is running (documented limitation) |
| Recurrence model | Full RFC 5545 RRULE on the master row, expanded per view | Single source of truth; no occurrence materialisation; "endless" rules work |
| View-time expansion | `RRule.between(viewStart, viewEnd)` per active view (day/week/month) | Jump 1 year ahead → all birthdays in that range materialise on the fly |
| CalDAV sync | Events + tasks sync as VEVENT/VTODO with RRULE + VALARM; types stay local | VTODO support varies by server; we attempt sync and degrade silently on 4xx |
| Type ↔ category mapping | Type name written as `CATEGORIES` on export; incoming `CATEGORIES` matched against type names on import (case-insensitive, no auto-create) | Round-trip works for users who keep type names stable; no surprise spam in the types list |
| Single recurring-instance edits | Out of scope for v1 | Requires EXDATE/RECURRENCE-ID; can be added later as `event_exceptions` table |
| Notification routing | Host-side registry binds notification → calling extension's public key; deep links can only target the same key | Extensions cannot impersonate or hijack each other's notification handlers |

---

## Data Model

All new tables use the existing `tableName()` helper from [apps/haex-calendar/app/database/schemas/index.ts](../../apps/haex-calendar/app/database/schemas/index.ts) (public-key-prefixed) and the shared `timestamps` snippet (`integer mode: "timestamp"` for `created_at` / `updated_at`).

### Migration 0005 — extend `events`

| Column | Type | Notes |
|--------|------|-------|
| `kind` | text NOT NULL DEFAULT `'event'` | `'event'` or `'task'`. Existing rows = events. |
| `event_type_id` | text NULL | FK → `event_types.id` ON DELETE SET NULL |
| `rrule` | text NULL | RFC 5545 RRULE string, e.g. `FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15` |
| `rrule_override` | integer NOT NULL DEFAULT 0 | Boolean: event's rrule overrides the type's default (even when null) |
| `color_override` | integer NOT NULL DEFAULT 0 | Boolean: event's color was set explicitly |
| `completed_at` | integer NULL `{ mode: "timestamp" }` | Tasks only; set = done |
| `dtend` | **made nullable** | Was NOT NULL; tasks store only `dtstart` (maps to VTODO `DUE`) |

SQLite can't ALTER a column's nullability in place; the migration uses drizzle-kit's standard table-recreate pattern (rename → recreate → copy → drop).

### Migration 0006 — `event_types` (local, not synced)

```ts
export const eventTypes = sqliteTable(tableName("event_types"), {
  id: text().primaryKey(),
  name: text().notNull().unique(),     // "Geburtstag", "Urlaub"
  color: text().notNull(),             // hex
  defaultRrule: text("default_rrule"), // optional default recurrence
  ...timestamps,
});
```

### Migration 0007 — `event_reminders`

```ts
export const eventReminders = sqliteTable(tableName("event_reminders"), {
  id: text().primaryKey(),
  eventId: text("event_id")
    .references(() => events.id, { onDelete: "cascade" }).notNull(),
  offsetMinutes: integer("offset_minutes").notNull(),  // 10080 = 1 week
});
```

### Migration 0008 — `event_type_reminders`

```ts
export const eventTypeReminders = sqliteTable(tableName("event_type_reminders"), {
  id: text().primaryKey(),
  eventTypeId: text("event_type_id")
    .references(() => eventTypes.id, { onDelete: "cascade" }).notNull(),
  offsetMinutes: integer("offset_minutes").notNull(),
});
```

### Override resolution (per field, not all-or-nothing)

- **Reminders:** if the event has ≥1 row in `event_reminders` → those win (no merge with type defaults). Empty → type defaults fire.
- **RRULE:** `rrule_override = 1` → `events.rrule` wins (even if null, meaning "no recurrence"). Otherwise the type's `default_rrule` is used.
- **Color:** `color_override = 1` → `events.color` wins. Otherwise the type's color, otherwise the calendar's color (existing cascade preserved).

---

## SDK Notifications API

New, generic API in `haex-vault-sdk` — designed for reuse by every extension. The Calendar is the first consumer.

### TypeScript shape — `haex-vault-sdk/src/api/notifications.ts`

```ts
export type DeepLink = {
  // Extension-internal route, e.g. "/event/abc-123" or "/inbox/msg/xyz".
  // The notification is pinned to the calling extension's public key by the
  // host; clicks can only route to webviews with that same public key.
  path: string;
};

export type NotificationAction = {
  id: string;        // stable id, returned in click event
  label: string;     // button text (caller localises)
  deepLink: DeepLink;
};

export type NotificationOptions = {
  title: string;
  body?: string;
  icon?: string;            // optional override; default = extension's manifest icon
  primary?: DeepLink;       // click on notification body → navigate here
  actions?: NotificationAction[];  // up to 3 buttons (platform-dependent, degrades silently)
  tag?: string;             // dedupe key — same tag replaces previous notification
};

export class NotificationsAPI {
  /** Show a notification. Returns its id so it can be dismissed later. */
  show(opts: NotificationOptions): Promise<{ id: string }>;
  
  /** Dismiss a previously shown notification (only own notifications). */
  dismiss(id: string): Promise<void>;
  
  /**
   * Listen for clicks on this extension's notifications.
   * Useful when the extension is already open and wants to react in-app
   * instead of going through routing.
   */
  onClick(handler: (e: { notificationId: string; actionId?: string }) => void): () => void;
}
```

### Identity & security

- **Public key is host-assigned.** The extension never supplies or sees its public key in this API. On every `show()` call, the host reads the calling extension's public key from the authenticated SDK request context and stores it alongside the notification in the in-memory registry.
- **Deep links can only target the same public key.** When the OS reports a click, the host looks up the notification in the registry by id, reads the pinned public key, locates the extension's webview, and posts `{ type: "haex:deepLink", path }` to it. If no matching extension is loaded, the click is a no-op.
- **No cross-extension deep links.** `DeepLink` has no `extensionId` field — not now, not as a future permission. Cross-extension cooperation must use a different, explicit channel.
- **Dismiss is scoped:** an extension may only dismiss notifications whose stored public key matches its own.

### Host implementation

- New module `haex-vault/src-tauri/src/extension/notifications/` with `mod.rs`, `commands.rs`, `types.rs`.
- In-memory registry keyed by `notificationId`, value `{ publicKey, primary, actions[], tag }`. Session-lifetime only — clicks on notifications from previous sessions become no-ops (acceptable and even desirable across upgrades).
- Tauri's `Notification::extra` carries `notificationId` so the OS-click callback can correlate.
- New permission scope `notifications.show`. Extensions request it at first use; the existing SDK auto-retry path handles the prompt.

### Example usage — Calendar reminder

```ts
sdk.notifications.show({
  title: "🎂 Maxes Geburtstag",
  body: "In 1 Tag — 18.06.2026",
  primary: { path: `/event/${eventId}` },
  actions: [
    { id: "snooze", label: "1h später",
      deepLink: { path: `/event/${eventId}?action=snooze` } },
  ],
  tag: `reminder:${eventId}:1d`,  // re-firing this exact reminder replaces
});
```

### Example usage — hypothetical Mail extension

```ts
sdk.notifications.show({
  title: "Neue E-Mail von Anna",
  body: "Re: Sync-Server Refactor",
  primary: { path: `/inbox/${messageId}` },
  actions: [
    { id: "reply", label: "Antworten",
      deepLink: { path: `/compose?replyTo=${messageId}` } },
    { id: "archive", label: "Archivieren",
      deepLink: { path: `/inbox?action=archive&id=${messageId}` } },
  ],
});
```

### Platform reality (document in the permissions UI)

- **Linux:** body click + up to 3 action buttons — full support.
- **macOS:** body click reliable; action buttons via Notification Center, degraded UX.
- **Windows:** body click + action buttons via Toast XML.
- When actions are unsupported, the primary deep link still works; buttons are silently dropped.

---

## Reminder Scheduler

A new composable `composables/useReminderScheduler.ts`, owned by `pages/index.vue` (started on app open, torn down on unmount).

**Algorithm:**

1. On app start and after every event / event-type / reminder mutation: walk all visible events, compute effective reminders (own list OR type defaults), expand recurring events via `RRule.between(now, now + 24h)`, and load the resulting `{ fireAt, eventId, offsetMinutes }` entries into an in-memory min-heap.
2. `setTimeout` on the head of the heap.
3. On fire: call `sdk.notifications.show({ ... })`, pop the head, recompute the head's timeout.
4. Every 30 minutes (or earlier on mutation): refill the heap so reminders that crossed into the 24h window are picked up.

**Why 24h:** anything further is wasted work because mutations constantly invalidate the heap. We're not trying to materialise all reminders forever — only the imminent ones.

**Known limitation:** reminders fire only while haex-vault is running. Persistent OS scheduled notifications (so reminders work with the app closed) would require a host-side background service. Out of scope; tracked separately if needed.

---

## Recurrence Handling

- **Storage:** master row only, with `events.rrule` carrying the RRULE string. No materialised occurrences.
- **Display:** `stores/events.ts` exposes a computed `expandedEventsInRange(start, end)` that filters non-recurring events into the range and expands recurring ones via `RRule.between(start, end, inc=true)`. MonthView / WeekView / DayView / EventPreview all consume this instead of the raw `events` list.
- **Editor:** a new `components/calendar/RecurrenceEditor.vue` builds the RRULE string from a structured form (frequency, interval, BYDAY/BYMONTHDAY/BYSETPOS as relevant, end condition: never / after N / until date) and renders a live preview ("Next 5 occurrences: 17.06., 24.06., …") via `rrule.js`.
- **Single-instance edits:** out of scope. Users may "end the recurrence and create a single new event" as a manual workaround. A future `event_exceptions` table will hold EXDATE + RECURRENCE-ID overrides.

---

## Task Completion

Checkbox left of the title in the editor and in all views (where space allows).

- **Non-recurring task:** click → `completed_at = now()`. Existing setting `showCompletedTasks` decides whether completed tasks remain visible.
- **Recurring task:** click → compute next RRULE occurrence relative to current `dtstart`. Set `dtstart = nextOccurrence`, leave `completed_at` null. If no further occurrences exist (UNTIL / COUNT exhausted): set `completed_at = now()`, clear `rrule`. Task is done.
- **No history log.** A future `task_completions` table can be added if stats are wanted later.

---

## Event-Types CRUD (UI)

- New tab "Termin-Arten" in `pages/settings.vue`.
- New component `components/calendar/EventTypesSettings.vue`: list of types with colour swatch, name, short preview ("🔔 1w, 1d · 🔁 yearly"). Buttons: + New / Edit / Delete.
- Form (Drawer or Dialog): **Name**, **Colour** (hex picker — same one used in `CreateDialog.vue`), **Reminders** (list with `+` button; row UI accepts weeks/days/hours/minutes, stored as minutes), **Recurrence** (uses `RecurrenceEditor.vue`).
- **Delete:** confirmation dialog with affected event count. `ON DELETE SET NULL` keeps events; their existing overrides remain visible, non-overridden fields fall back to "no type".
- **No built-in types** on install. Pure user-defined. A "Vorlagen hinzufügen" button (Geburtstag / Feiertag / Urlaub presets) can come later if asked for.

---

## Editor Changes (`EventDrawer.vue`)

- **Toggle at top:** "Termin | Aufgabe" → sets `kind`. Task mode hides `dtend` and the end-time controls; shows a completion checkbox in the title row.
- **Type combobox:** choose an `event_type`. When chosen, the type's default reminders and recurrence appear with a small "(geerbt)" badge. Editing either flips it to "(überschrieben)" with a "Auf Default zurücksetzen" button that clears the override (deletes own reminder rows, sets `rrule_override = 0`).
- **Reminders block:** list of reminders with `+ Erinnerung`, each row offers a unit dropdown (Minuten/Stunden/Tage/Wochen) and a number.
- **Recurrence block:** mounts `RecurrenceEditor.vue`.

---

## CalDAV Sync Mapping

[composables/useIcal.ts](../../apps/haex-calendar/app/composables/useIcal.ts) and [stores/caldavSync.ts](../../apps/haex-calendar/app/stores/caldavSync.ts) extended:

**Export (vault → server):**
- `kind = 'event'` → VEVENT (current behaviour).
- `kind = 'task'` → VTODO. `dtstart` → `DUE`. No `DTEND`.
- Effective reminders → `VALARM` blocks with `TRIGGER:-PT{minutes}M` (or hour/day units when cleaner).
- Effective RRULE → `RRULE:…` line.
- Effective event-type name → written into `CATEGORIES` (overwrites the existing free-text categories field at this position).
- Effective colour → existing `COLOR` field is populated.

**Import (server → vault):**
- `VTODO` → row with `kind = 'task'`, `dtend = null`, `completed_at = null` (or set if iCal `COMPLETED` is present).
- `VALARM` entries → `event_reminders` rows. If the resulting reminder set differs from the matched type's defaults, that's automatically an override by the "any rows = override" rule.
- `RRULE` → `events.rrule`. Set `rrule_override = 1` if the value differs from the matched type's `default_rrule`.
- `CATEGORIES` → matched (case-insensitive) against `event_types.name`. Hit → set `event_type_id`. Miss → leave null (no auto-create, to avoid spamming the types list from third-party data).

**Round-trip stability:** intentional — if a user creates a birthday in Apple Calendar with category "Geburtstag", it imports as a typed event in haex-vault. Editing it in haex-vault and re-exporting preserves the same `CATEGORIES`, `RRULE`, and `VALARM` blocks.

---

## Rollout (8 steps; each independently mergeable, app stays functional throughout)

1. **SDK Notifications API** (`haex-vault-sdk` + `haex-vault` host):
   - `haex-vault-sdk/src/api/notifications.ts`, `haex-vault-sdk/src/commands/notifications.ts`
   - Register in `haex-vault-sdk/src/commands/index.ts` and `haex-vault-sdk/src/client.ts` (analogous to `passwords`).
   - `haex-vault/src-tauri/src/extension/notifications/` with `mod.rs`, `commands.rs`, `types.rs`.
   - Register command in `haex-vault/src-tauri/src/lib.rs`. New permission scope `notifications.show`.
   - Webview deep-link postMessage handler on the host side.

2. **DB migrations 0005–0008** (extend `events`; create `event_types`, `event_reminders`, `event_type_reminders`).

3. **Event-Types CRUD** — `components/calendar/EventTypesSettings.vue`, `stores/eventTypes.ts`, new tab in `pages/settings.vue`.

4. **Editor extensions** — [EventDrawer.vue](../../apps/haex-calendar/app/components/calendar/EventDrawer.vue): kind toggle, type combobox with inheritance UI, reminders list, mount `RecurrenceEditor.vue`.

5. **Recurrence expansion in views** — `expandedEventsInRange` computed in [stores/events.ts](../../apps/haex-calendar/app/stores/events.ts); MonthView/WeekView/DayView/EventPreview consume it.

6. **Reminder scheduler** — `composables/useReminderScheduler.ts`, started from `pages/index.vue`, fires via SDK from step 1.

7. **Task completion** — checkbox component, advance logic in events store, respect `showCompletedTasks` setting.

8. **CalDAV sync mapping** — extend `useIcal.ts` + `stores/caldavSync.ts` for VTODO, RRULE, VALARM, CATEGORIES ↔ event_type round-trip.

---

## Out of Scope for v1 (documented limitations)

- Editing a single instance of a recurring event (EXDATE / RECURRENCE-ID).
- Reminders firing while haex-vault is closed (would need a host background service).
- History / stats for completed tasks.
- Built-in event-type templates (Geburtstag / Feiertag / Urlaub) on install.
- Cross-extension deep links from notifications.
