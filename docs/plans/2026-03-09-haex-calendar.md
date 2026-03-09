# haex-calendar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CalDAV-oriented calendar extension for HaexSpace with Month/Week/Day views, Drag & Drop, iCal import/export, and Shared Spaces support for calendar sharing.

**Architecture:** Single-page Nuxt 4 extension with Drizzle ORM (2 tables: calendars + events), 3 Pinia stores (calendars, events, calendarView), composables for DnD/iCal/TimeGrid. Shared calendars map 1:1 to Spaces — sharing a calendar creates a Space, joining a Space pulls a calendar. UI follows Google Calendar patterns.

**Tech Stack:** Nuxt 4, Vue 3, Drizzle ORM (SQLite), Pinia, @vue-dnd-kit, ical.js, @vueuse/core, Shadcn-vue, Tailwind CSS 4, lucide-vue-next

---

## Task 1: Project Scaffolding

**Files:**
- Create: `apps/haex-calendar/nuxt.config.ts`
- Create: `apps/haex-calendar/package.json`
- Create: `apps/haex-calendar/drizzle.config.ts`
- Create: `apps/haex-calendar/tsconfig.json`
- Create: `apps/haex-calendar/haextension.config.json`
- Create: `apps/haex-calendar/haextension/manifest.json`
- Create: `apps/haex-calendar/components.json`
- Create: `apps/haex-calendar/app/app.vue`
- Create: `apps/haex-calendar/app/layouts/default.vue`
- Create: `apps/haex-calendar/app/lib/utils.ts`
- Create: `apps/haex-calendar/app/assets/css/tailwind.css`

**Context:** Copy structure from haex-files, adjust for haex-calendar. The extension runs as a Nuxt 4 SPA in a sandboxed iframe/WebView inside haex-vault. Key differences: no filesystem permissions needed, different port (3002), new publicKey needed.

**Step 1: Create package.json**

```json
{
  "name": "haex-calendar",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "nuxt build --preset static",
    "dev": "nuxt dev",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "ext:dev": "haex dev"
  },
  "dependencies": {
    "@haex-space/vault-sdk": "^2.5.105",
    "@nuxt/eslint": "^1.12.1",
    "@nuxt/icon": "^2.1.1",
    "@nuxtjs/i18n": "^10.2.1",
    "@pinia/nuxt": "^0.11.3",
    "@vueuse/core": "^14.1.0",
    "@vue-dnd-kit/core": "latest",
    "@vue-dnd-kit/utilities": "latest",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "drizzle-orm": "^0.45.1",
    "ical.js": "^2.1.0",
    "lucide-vue-next": "^0.562.0",
    "nuxt": "^4.2.2",
    "reka-ui": "^2.6.1",
    "shadcn-nuxt": "2.3.2",
    "tailwind-merge": "^3.4.0",
    "tw-animate-css": "^1.4.0",
    "vaul-vue": "^0.4.1",
    "vue": "^3.5.26",
    "vue-router": "^4.6.4",
    "vue-sonner": "^2.0.9"
  },
  "devDependencies": {
    "@nuxtjs/color-mode": "^4.0.0",
    "@tailwindcss/vite": "^4.1.18",
    "drizzle-kit": "^0.31.8",
    "eslint": "^9.39.2",
    "tailwindcss": "^4.1.18"
  }
}
```

**Step 2: Create nuxt.config.ts**

```typescript
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },

  extends: ["../../packages/haex-ui"],

  vue: {
    runtimeCompiler: false,
  },

  modules: [
    "@nuxt/eslint",
    "shadcn-nuxt",
    "@nuxtjs/i18n",
    "@pinia/nuxt",
    "@nuxtjs/color-mode",
    "@nuxt/icon",
    "@haex-space/vault-sdk/nuxt",
  ],

  colorMode: {
    classSuffix: "",
  },

  css: ["~/assets/css/tailwind.css"],

  ssr: false,

  imports: {
    dirs: [
      "composables/**",
      "stores/**",
      "components/**",
      "pages/**",
      "types/**",
    ],
  },

  i18n: {
    strategy: "prefix_and_default",
    defaultLocale: "de",

    locales: [
      { code: "de", language: "de-DE", isCatchallLocale: true },
      { code: "en", language: "en-EN" },
    ],

    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "i18n_redirected",
      redirectOn: "root",
    },
    types: "composition",
  },

  router: {
    options: {
      hashMode: true,
    },
  },

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ["@vueuse/core"],
    },
  },
});
```

**Step 3: Create remaining config files**

`drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./app/database/schemas/index.ts",
  out: "./app/database/migrations",
  dialect: "sqlite",
  verbose: true,
  strict: true,
});
```

`tsconfig.json`:
```json
{
  "extends": "./.nuxt/tsconfig.json"
}
```

`haextension.config.json`:
```json
{
  "dev": {
    "port": 3002,
    "host": "localhost"
  },
  "build": {
    "distDir": "dist"
  }
}
```

`haextension/manifest.json` (publicKey will be generated later — use placeholder):
```json
{
  "publicKey": "TODO_GENERATE_PUBLIC_KEY",
  "signature": "",
  "permissions": {
    "database": [],
    "filesystem": [],
    "shell": []
  },
  "singleInstance": true,
  "displayMode": "auto",
  "description": "CalDAV-oriented calendar with sharing via Shared Spaces"
}
```

`components.json`:
```json
{
  "$schema": "https://shadcn-vue.com/schema.json",
  "style": "new-york",
  "typescript": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "assets/css/tailwind.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "composables": "@/composables"
  },
  "registries": {}
}
```

**Step 4: Create app shell files**

`app/app.vue`:
```vue
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

`app/layouts/default.vue`:
```vue
<template>
  <div class="min-h-screen bg-background">
    <slot />
  </div>
</template>
```

`app/lib/utils.ts`:
```typescript
import type { ClassValue } from "clsx"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

`app/assets/css/tailwind.css`: Copy exact contents from haex-files (same OKLCH color system, same dark mode variables).

**Step 5: Install dependencies and verify**

Run: `cd apps/haex-calendar && pnpm install`
Run: `pnpm dev` — verify Nuxt starts without errors on port 3002.

**Step 6: Commit**

```bash
git add apps/haex-calendar/
git commit -m "feat(haex-calendar): scaffold extension project"
```

---

## Task 2: Database Schema

**Files:**
- Create: `apps/haex-calendar/app/database/schemas/index.ts`
- Create: `apps/haex-calendar/app/database/index.ts`

**Context:** Two tables — `calendars` and `events`. Events follow CalDAV/iCalendar (RFC 5545) property naming. Table names are prefixed with `{publicKey}__{extensionName}__` via `getTableName()` from vault-sdk.

**Step 1: Create the schema**

`app/database/schemas/index.ts`:
```typescript
import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../../haextension/manifest.json";
import packageJson from "../../../package.json";

// Helper function to create prefixed table names
const extensionName = (manifest as { name?: string }).name || packageJson.name;
const tableName = (name: string) => getTableName(manifest.publicKey, extensionName, name);

// Reusable timestamp columns
const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
};

/**
 * Calendars — each calendar is either personal (spaceId=null) or shared (spaceId=Space UUID).
 * A shared calendar IS a Space (1:1 mapping).
 */
export const calendars = sqliteTable(
  tableName("calendars"),
  {
    id: text().primaryKey(),
    name: text().notNull(),
    color: text().notNull().default("#3b82f6"), // Default blue
    spaceId: text("space_id"), // null = personal, non-null = shared Space
    visible: integer({ mode: "boolean" }).notNull().default(true),
    ...timestamps,
  }
);
export type InsertCalendar = typeof calendars.$inferInsert;
export type SelectCalendar = typeof calendars.$inferSelect;

/**
 * Events — CalDAV/iCalendar (RFC 5545) oriented VEVENT properties.
 * Each event belongs to one calendar.
 */
export const events = sqliteTable(
  tableName("events"),
  {
    id: text().primaryKey(),
    calendarId: text("calendar_id")
      .references((): AnySQLiteColumn => calendars.id, { onDelete: "cascade" })
      .notNull(),

    // CalDAV core properties
    uid: text().notNull().unique(),          // UID — global iCal identifier (uuid@haex-calendar)
    summary: text().notNull(),               // SUMMARY — event title
    description: text(),                     // DESCRIPTION
    location: text(),                        // LOCATION

    // Date/time (ISO 8601 strings for direct iCal compatibility)
    dtstart: text().notNull(),               // DTSTART — "2026-03-09T14:00:00"
    dtend: text().notNull(),                 // DTEND — "2026-03-09T15:00:00"
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    timezone: text().notNull().default("Europe/Berlin"), // TZID

    // CalDAV metadata
    status: text().notNull().default("CONFIRMED"), // STATUS: CONFIRMED, TENTATIVE, CANCELLED
    sequence: integer().notNull().default(0),       // SEQUENCE — change counter for sync conflicts
    url: text(),                              // URL
    categories: text(),                       // CATEGORIES — comma-separated tags
    color: text(),                            // COLOR — overrides calendar color

    ...timestamps,
  }
);
export type InsertEvent = typeof events.$inferInsert;
export type SelectEvent = typeof events.$inferSelect;
```

`app/database/index.ts`:
```typescript
export * from "./schemas";
```

**Step 2: Generate initial migration**

Run: `cd apps/haex-calendar && pnpm db:generate`
Expected: Migration SQL file created in `app/database/migrations/`

**Step 3: Verify migration SQL**

Read the generated `.sql` file in `app/database/migrations/` — confirm it creates two tables with correct column names.

**Step 4: Commit**

```bash
git add apps/haex-calendar/app/database/
git commit -m "feat(haex-calendar): add CalDAV-oriented database schema"
```

---

## Task 3: HaexVault Store (SDK Integration)

**Files:**
- Create: `apps/haex-calendar/app/stores/haexvault.ts`
- Create: `apps/haex-calendar/app/stores/ui/index.ts`

**Context:** This store initializes the vault-sdk connection, registers migrations, and provides the Drizzle ORM instance. Copy pattern from haex-files but remove master key logic (calendar doesn't need file encryption — space encryption is handled by the sync layer). Keep permission handling.

**Step 1: Create UI store**

`app/stores/ui/index.ts`:
```typescript
export const useUiStore = defineStore("ui", () => {
  const context = ref<any>(null);
  const currentThemeName = ref<"dark" | "light">("dark");

  return {
    context,
    currentThemeName,
  };
});
```

**Step 2: Create haexvault store**

`app/stores/haexvault.ts`:
```typescript
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "~/database/schemas";
import {
  isPermissionPromptError,
  isPermissionDeniedError,
  type PermissionPromptError,
  type PermissionDeniedError,
} from "@haex-space/vault-sdk";

const migrationFiles = import.meta.glob("../database/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

export { isPermissionPromptError, isPermissionDeniedError, type PermissionPromptError, type PermissionDeniedError };

export const useHaexVaultStore = defineStore("haexvault", () => {
  const nuxtApp = useNuxtApp();

  const isInitialized = ref(false);
  const orm = shallowRef<SqliteRemoteDatabase<typeof schema> | null>(null);

  // Permission prompt state (code 1004)
  const pendingPermission = ref<PermissionPromptError | null>(null);
  const pendingRetryFn = shallowRef<(() => Promise<void>) | null>(null);

  // Permission denied state (code 1002)
  const deniedPermission = ref<PermissionDeniedError | null>(null);

  const { currentThemeName, context } = storeToRefs(useUiStore());
  const { defaultLocale, locales, setLocale } = useI18n();

  const getHaexVault = () => {
    const haexVault = nuxtApp.$haexVault;
    if (!haexVault) {
      throw new Error("HaexVault plugin not available.");
    }
    return haexVault;
  };

  const runMigrationsAsync = async () => {
    const haexVault = getHaexVault();
    const migrations = Object.entries(migrationFiles).map(([path, content]) => ({
      name: path.split("/").pop()?.replace(".sql", "") || "",
      sql: content as string,
    }));

    console.log(`[haex-calendar] Registering ${migrations.length} migration(s)`);
    const result = await haexVault.client.registerMigrationsAsync(
      haexVault.client.extensionInfo!.version,
      migrations
    );
    console.log(`[haex-calendar] Migrations: ${result.appliedCount} applied, ${result.alreadyAppliedCount} already applied`);
  };

  const initializeAsync = async () => {
    if (isInitialized.value) return;
    const haexVault = getHaexVault();

    console.log("[haex-calendar] Initializing HaexVault SDK");
    haexVault.client.onSetup(runMigrationsAsync);
    orm.value = haexVault.client.initializeDatabase(schema);
    await haexVault.client.setupComplete();
    console.log("[haex-calendar] Setup complete");

    // Context watcher (theme, locale)
    watch(
      () => haexVault.state.value.context,
      (newContext) => {
        if (!newContext) return;
        context.value = newContext;
        currentThemeName.value = newContext.theme || "dark";
        const locale = locales.value.find((l) => l.code === newContext.locale)?.code || defaultLocale;
        setLocale(locale);
      },
      { immediate: true }
    );

    isInitialized.value = true;
  };

  const isReady = computed(() => isInitialized.value && orm.value !== null);

  const setPermissionPrompt = (error: PermissionPromptError, retryFn: () => Promise<void>) => {
    pendingPermission.value = error;
    pendingRetryFn.value = retryFn;
  };
  const clearPermissionPrompt = () => {
    pendingPermission.value = null;
    pendingRetryFn.value = null;
  };
  const retryAfterPermissionAsync = async () => {
    const retryFn = pendingRetryFn.value;
    if (retryFn) {
      clearPermissionPrompt();
      await retryFn();
    }
  };
  const setPermissionDenied = (error: PermissionDeniedError) => { deniedPermission.value = error; };
  const clearPermissionDenied = () => { deniedPermission.value = null; };

  return {
    get client() { return getHaexVault().client; },
    get state() { return getHaexVault().state; },
    orm,
    isReady,
    initializeAsync,
    pendingPermission: computed(() => pendingPermission.value),
    setPermissionPrompt,
    clearPermissionPrompt,
    retryAfterPermissionAsync,
    deniedPermission: computed(() => deniedPermission.value),
    setPermissionDenied,
    clearPermissionDenied,
  };
});
```

**Step 3: Verify**

Run: `pnpm dev` — ensure no TypeScript errors.

**Step 4: Commit**

```bash
git add apps/haex-calendar/app/stores/
git commit -m "feat(haex-calendar): add haexvault and ui stores"
```

---

## Task 4: Calendars Store

**Files:**
- Create: `apps/haex-calendar/app/stores/calendars.ts`

**Context:** Manages calendar CRUD and visibility toggles. Personal calendars have `spaceId=null`, shared calendars have `spaceId` set to a Space UUID.

**Step 1: Create calendars store**

`app/stores/calendars.ts`:
```typescript
import { eq } from "drizzle-orm";
import { calendars, type InsertCalendar, type SelectCalendar } from "~/database/schemas";

export const useCalendarsStore = defineStore("calendars", () => {
  const haexVault = useHaexVaultStore();

  const allCalendars = ref<SelectCalendar[]>([]);
  const isLoading = ref(false);

  // Only calendars marked as visible
  const visibleCalendarIds = computed(() =>
    allCalendars.value.filter((c) => c.visible).map((c) => c.id)
  );

  async function loadCalendarsAsync() {
    if (!haexVault.orm) return;
    isLoading.value = true;
    try {
      allCalendars.value = await haexVault.orm.select().from(calendars);
    } finally {
      isLoading.value = false;
    }
  }

  async function createCalendarAsync(data: { name: string; color: string; spaceId?: string }) {
    if (!haexVault.orm) return;
    const id = crypto.randomUUID();
    const entry: InsertCalendar = {
      id,
      name: data.name,
      color: data.color,
      spaceId: data.spaceId ?? null,
    };
    await haexVault.orm.insert(calendars).values(entry);
    await loadCalendarsAsync();
    return id;
  }

  async function updateCalendarAsync(id: string, data: Partial<Pick<InsertCalendar, "name" | "color" | "visible">>) {
    if (!haexVault.orm) return;
    await haexVault.orm.update(calendars).set(data).where(eq(calendars.id, id));
    await loadCalendarsAsync();
  }

  async function deleteCalendarAsync(id: string) {
    if (!haexVault.orm) return;
    await haexVault.orm.delete(calendars).where(eq(calendars.id, id));
    await loadCalendarsAsync();
  }

  async function toggleVisibilityAsync(id: string) {
    const cal = allCalendars.value.find((c) => c.id === id);
    if (!cal) return;
    await updateCalendarAsync(id, { visible: !cal.visible });
  }

  function getCalendar(id: string) {
    return allCalendars.value.find((c) => c.id === id);
  }

  return {
    calendars: allCalendars,
    visibleCalendarIds,
    isLoading,
    loadCalendarsAsync,
    createCalendarAsync,
    updateCalendarAsync,
    deleteCalendarAsync,
    toggleVisibilityAsync,
    getCalendar,
  };
});
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/stores/calendars.ts
git commit -m "feat(haex-calendar): add calendars store with CRUD and visibility"
```

---

## Task 5: Events Store

**Files:**
- Create: `apps/haex-calendar/app/stores/events.ts`

**Context:** Manages event CRUD and queries events by visible date range + visible calendars. Uses `watchDebounced` from @vueuse/core so rapid navigation doesn't spam DB queries.

**Step 1: Create events store**

`app/stores/events.ts`:
```typescript
import { and, gte, lte, inArray, eq } from "drizzle-orm";
import { events, type InsertEvent, type SelectEvent } from "~/database/schemas";

export type { SelectEvent, InsertEvent };

export const useEventsStore = defineStore("events", () => {
  const haexVault = useHaexVaultStore();
  const calendarsStore = useCalendarsStore();
  const calendarView = useCalendarViewStore();

  const visibleEvents = ref<SelectEvent[]>([]);
  const isLoading = ref(false);

  /**
   * Load events for the current visible range and visible calendars.
   * Called reactively when visibleRange or visibleCalendarIds change.
   */
  async function loadEventsAsync() {
    if (!haexVault.orm) return;
    const { start, end } = calendarView.visibleRange;
    const calendarIds = calendarsStore.visibleCalendarIds;
    if (calendarIds.length === 0) {
      visibleEvents.value = [];
      return;
    }

    isLoading.value = true;
    try {
      visibleEvents.value = await haexVault.orm
        .select()
        .from(events)
        .where(
          and(
            lte(events.dtstart, end),   // Event starts before range ends
            gte(events.dtend, start),   // Event ends after range starts
            inArray(events.calendarId, calendarIds)
          )
        );
    } finally {
      isLoading.value = false;
    }
  }

  async function createEventAsync(data: Omit<InsertEvent, "id" | "uid" | "createdAt" | "updatedAt">) {
    if (!haexVault.orm) return;
    const id = crypto.randomUUID();
    const uid = `${id}@haex-calendar`;

    await haexVault.orm.insert(events).values({
      ...data,
      id,
      uid,
    });
    await loadEventsAsync();
    return id;
  }

  async function updateEventAsync(id: string, data: Partial<Omit<InsertEvent, "id" | "uid">>) {
    if (!haexVault.orm) return;

    // Increment SEQUENCE on every update (CalDAV standard)
    const existing = visibleEvents.value.find((e) => e.id === id);
    const newSequence = (existing?.sequence ?? 0) + 1;

    await haexVault.orm
      .update(events)
      .set({ ...data, sequence: newSequence })
      .where(eq(events.id, id));
    await loadEventsAsync();
  }

  async function deleteEventAsync(id: string) {
    if (!haexVault.orm) return;
    await haexVault.orm.delete(events).where(eq(events.id, id));
    await loadEventsAsync();
  }

  function getEvent(id: string) {
    return visibleEvents.value.find((e) => e.id === id);
  }

  return {
    events: visibleEvents,
    isLoading,
    loadEventsAsync,
    createEventAsync,
    updateEventAsync,
    deleteEventAsync,
    getEvent,
  };
});
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/stores/events.ts
git commit -m "feat(haex-calendar): add events store with CalDAV SEQUENCE support"
```

---

## Task 6: Calendar View Store

**Files:**
- Create: `apps/haex-calendar/app/stores/calendarView.ts`

**Context:** Manages the current view mode (month/week/day), current date, and computes the visible date range. The events store watches this to reload events.

**Step 1: Create calendarView store**

`app/stores/calendarView.ts`:
```typescript
export type ViewMode = "month" | "week" | "day";

/**
 * Get the start of the week (Monday) for a given date.
 */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday = 1
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * For month view: extend range to fill the grid (start from Monday of first week,
 * end on Sunday of last week).
 */
function getMonthGridRange(date: Date): { start: string; end: string } {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  return {
    start: gridStart.toISOString(),
    end: gridEnd.toISOString(),
  };
}

function getWeekRange(date: Date): { start: string; end: string } {
  return {
    start: startOfWeek(date).toISOString(),
    end: endOfWeek(date).toISOString(),
  };
}

function getDayRange(date: Date): { start: string; end: string } {
  return {
    start: startOfDay(date).toISOString(),
    end: endOfDay(date).toISOString(),
  };
}

export const useCalendarViewStore = defineStore("calendarView", () => {
  const viewMode = ref<ViewMode>("month");
  const currentDate = ref(new Date());

  const visibleRange = computed(() => {
    switch (viewMode.value) {
      case "month":
        return getMonthGridRange(currentDate.value);
      case "week":
        return getWeekRange(currentDate.value);
      case "day":
        return getDayRange(currentDate.value);
    }
  });

  /**
   * Title for the toolbar (e.g., "März 2026", "KW 10, 2026", "9. März 2026")
   */
  const title = computed(() => {
    const d = currentDate.value;
    const formatter = new Intl.DateTimeFormat("de-DE", {
      month: "long",
      year: "numeric",
    });

    switch (viewMode.value) {
      case "month":
        return formatter.format(d);
      case "week": {
        const weekStart = startOfWeek(d);
        const weekEnd = endOfWeek(d);
        const startStr = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(weekStart);
        const endStr = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" }).format(weekEnd);
        return `${startStr} – ${endStr}`;
      }
      case "day":
        return new Intl.DateTimeFormat("de-DE", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(d);
    }
  });

  function next() {
    const d = new Date(currentDate.value);
    switch (viewMode.value) {
      case "month":
        d.setMonth(d.getMonth() + 1);
        break;
      case "week":
        d.setDate(d.getDate() + 7);
        break;
      case "day":
        d.setDate(d.getDate() + 1);
        break;
    }
    currentDate.value = d;
  }

  function prev() {
    const d = new Date(currentDate.value);
    switch (viewMode.value) {
      case "month":
        d.setMonth(d.getMonth() - 1);
        break;
      case "week":
        d.setDate(d.getDate() - 7);
        break;
      case "day":
        d.setDate(d.getDate() - 1);
        break;
    }
    currentDate.value = d;
  }

  function today() {
    currentDate.value = new Date();
  }

  /**
   * Navigate to a specific day (e.g., clicking a date in month view → switch to day view)
   */
  function goToDay(date: Date) {
    currentDate.value = date;
    viewMode.value = "day";
  }

  return {
    viewMode,
    currentDate,
    visibleRange,
    title,
    next,
    prev,
    today,
    goToDay,
  };
});
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/stores/calendarView.ts
git commit -m "feat(haex-calendar): add calendarView store with month/week/day navigation"
```

---

## Task 7: iCal Composable (Import/Export)

**Files:**
- Create: `apps/haex-calendar/app/composables/useIcal.ts`

**Context:** Uses `ical.js` (Mozilla project) for RFC 5545 compliant parsing and generation. Import uses UID-based upsert with SEQUENCE comparison. Export generates valid `.ics` files.

**Step 1: Create useIcal composable**

`app/composables/useIcal.ts`:
```typescript
import ICAL from "ical.js";
import type { InsertEvent, SelectEvent } from "~/database/schemas";

export interface ParsedEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  dtstart: string;
  dtend: string;
  allDay: boolean;
  timezone: string;
  status: string;
  sequence: number;
  url: string | null;
  categories: string | null;
  color: string | null;
}

/**
 * Parse a .ics file string into an array of events.
 */
export function parseICS(icsString: string): ParsedEvent[] {
  const jcal = ICAL.parse(icsString);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");

  return vevents.map((vevent: any) => {
    const event = new ICAL.Event(vevent);
    const startDate = event.startDate;
    const endDate = event.endDate;

    return {
      uid: event.uid,
      summary: event.summary || "Untitled",
      description: event.description || null,
      location: event.location || null,
      dtstart: startDate.toString(),
      dtend: endDate.toString(),
      allDay: startDate.isDate,
      timezone: startDate.zone?.tzid || "UTC",
      status: vevent.getFirstPropertyValue("status") || "CONFIRMED",
      sequence: vevent.getFirstPropertyValue("sequence") || 0,
      url: vevent.getFirstPropertyValue("url") || null,
      categories: vevent.getFirstPropertyValue("categories")?.toString() || null,
      color: vevent.getFirstPropertyValue("color") || null,
    };
  });
}

/**
 * Generate a .ics file string from an array of events.
 */
export function generateICS(eventList: SelectEvent[], calendarName: string): string {
  const comp = new ICAL.Component(["vcalendar", [], []]);
  comp.updatePropertyWithValue("prodid", "-//haex-calendar//NONSGML v1.0//EN");
  comp.updatePropertyWithValue("version", "2.0");
  comp.updatePropertyWithValue("calscale", "GREGORIAN");
  comp.updatePropertyWithValue("x-wr-calname", calendarName);

  for (const event of eventList) {
    const vevent = new ICAL.Component("vevent");
    vevent.updatePropertyWithValue("uid", event.uid);
    vevent.updatePropertyWithValue("summary", event.summary);
    vevent.updatePropertyWithValue("sequence", event.sequence);
    vevent.updatePropertyWithValue("status", event.status);

    if (event.allDay) {
      const dtstart = ICAL.Time.fromDateString(event.dtstart.split("T")[0]);
      vevent.updatePropertyWithValue("dtstart", dtstart);
      const dtend = ICAL.Time.fromDateString(event.dtend.split("T")[0]);
      vevent.updatePropertyWithValue("dtend", dtend);
    } else {
      vevent.updatePropertyWithValue("dtstart", ICAL.Time.fromString(event.dtstart));
      vevent.updatePropertyWithValue("dtend", ICAL.Time.fromString(event.dtend));
    }

    if (event.description) vevent.updatePropertyWithValue("description", event.description);
    if (event.location) vevent.updatePropertyWithValue("location", event.location);
    if (event.url) vevent.updatePropertyWithValue("url", event.url);
    if (event.categories) vevent.updatePropertyWithValue("categories", event.categories);
    if (event.color) vevent.updatePropertyWithValue("color", event.color);

    if (event.createdAt) {
      vevent.updatePropertyWithValue("created", ICAL.Time.fromJSDate(new Date(event.createdAt * 1000), false));
    }
    if (event.updatedAt) {
      vevent.updatePropertyWithValue("last-modified", ICAL.Time.fromJSDate(new Date(event.updatedAt * 1000), false));
    }

    comp.addSubcomponent(vevent);
  }

  return comp.toString();
}

/**
 * Composable wrapping import/export with store integration.
 */
export function useIcal() {
  const eventsStore = useEventsStore();
  const haexVault = useHaexVaultStore();

  /**
   * Import a .ics file into a calendar.
   * Uses UID-based upsert: if event with same UID exists and incoming SEQUENCE is higher, update it.
   */
  async function importFileAsync(file: File, calendarId: string): Promise<{ imported: number; updated: number; skipped: number }> {
    const text = await file.text();
    const parsed = parseICS(text);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    if (!haexVault.orm) throw new Error("Database not initialized");

    for (const event of parsed) {
      // Check if event with this UID already exists
      const existing = await haexVault.orm
        .select()
        .from(events)
        .where(eq(events.uid, event.uid))
        .limit(1);

      if (existing.length > 0) {
        // Update only if incoming SEQUENCE is higher
        if (event.sequence > (existing[0]?.sequence ?? 0)) {
          await eventsStore.updateEventAsync(existing[0]!.id, {
            summary: event.summary,
            description: event.description,
            location: event.location,
            dtstart: event.dtstart,
            dtend: event.dtend,
            allDay: event.allDay,
            timezone: event.timezone,
            status: event.status,
            sequence: event.sequence,
            url: event.url,
            categories: event.categories,
            color: event.color,
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await eventsStore.createEventAsync({
          calendarId,
          summary: event.summary,
          description: event.description,
          location: event.location,
          dtstart: event.dtstart,
          dtend: event.dtend,
          allDay: event.allDay,
          timezone: event.timezone,
          status: event.status,
          sequence: event.sequence,
          url: event.url,
          categories: event.categories,
          color: event.color,
        });
        imported++;
      }
    }

    return { imported, updated, skipped };
  }

  /**
   * Export a calendar's events as a .ics file download.
   */
  async function exportCalendarAsync(calendarId: string, calendarName: string) {
    if (!haexVault.orm) throw new Error("Database not initialized");

    const allEvents = await haexVault.orm
      .select()
      .from(events)
      .where(eq(events.calendarId, calendarId));

    const icsString = generateICS(allEvents, calendarName);
    const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${calendarName.replace(/\s+/g, "_")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    parseICS,
    generateICS,
    importFileAsync,
    exportCalendarAsync,
  };
}
```

Note: The `eq` import from `drizzle-orm` and `events` from schema need to be imported at the top of the file:
```typescript
import { eq } from "drizzle-orm";
import { events } from "~/database/schemas";
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/composables/useIcal.ts
git commit -m "feat(haex-calendar): add iCal import/export composable with UID upsert"
```

---

## Task 8: Time Grid Composable

**Files:**
- Create: `apps/haex-calendar/app/composables/useTimeGrid.ts`

**Context:** Calculates event positioning (top, height) for the week/day time grid. Hours 0–23 are mapped to pixel positions. Handles overlapping events by assigning columns.

**Step 1: Create useTimeGrid composable**

`app/composables/useTimeGrid.ts`:
```typescript
import type { SelectEvent } from "~/database/schemas";

export interface PositionedEvent {
  event: SelectEvent;
  top: number;      // Percentage from top (0-100)
  height: number;   // Percentage height
  left: number;     // Percentage from left within the day column (0-100)
  width: number;    // Percentage width within the day column
}

const HOURS_IN_DAY = 24;
const MINUTES_IN_DAY = HOURS_IN_DAY * 60;

/**
 * Convert a datetime string to minutes since midnight.
 */
function toMinutesSinceMidnight(dtstring: string): number {
  const date = new Date(dtstring);
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Get the date string (YYYY-MM-DD) from a datetime string.
 */
export function toDateKey(dtstring: string): string {
  return dtstring.split("T")[0] ?? dtstring.slice(0, 10);
}

/**
 * Position events in a single day column, handling overlaps.
 * Returns positioned events with top/height/left/width as percentages.
 */
export function positionEventsInDay(dayEvents: SelectEvent[]): PositionedEvent[] {
  if (dayEvents.length === 0) return [];

  // Sort by start time, then by duration (longer first)
  const sorted = [...dayEvents].sort((a, b) => {
    const startDiff = toMinutesSinceMidnight(a.dtstart) - toMinutesSinceMidnight(b.dtstart);
    if (startDiff !== 0) return startDiff;
    // Longer events first
    const aDuration = toMinutesSinceMidnight(a.dtend) - toMinutesSinceMidnight(a.dtstart);
    const bDuration = toMinutesSinceMidnight(b.dtend) - toMinutesSinceMidnight(b.dtstart);
    return bDuration - aDuration;
  });

  // Assign columns for overlapping events
  const columns: { end: number; event: SelectEvent }[][] = [];

  for (const event of sorted) {
    const startMin = toMinutesSinceMidnight(event.dtstart);
    const endMin = Math.max(toMinutesSinceMidnight(event.dtend), startMin + 15); // Minimum 15min display

    let placed = false;
    for (const col of columns) {
      const lastInCol = col[col.length - 1];
      if (lastInCol && lastInCol.end <= startMin) {
        col.push({ end: endMin, event });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([{ end: endMin, event }]);
    }
  }

  const totalColumns = columns.length;

  // Build positioned events
  const result: PositionedEvent[] = [];
  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    for (const { event } of columns[colIndex]!) {
      const startMin = toMinutesSinceMidnight(event.dtstart);
      const endMin = Math.max(toMinutesSinceMidnight(event.dtend), startMin + 15);

      result.push({
        event,
        top: (startMin / MINUTES_IN_DAY) * 100,
        height: ((endMin - startMin) / MINUTES_IN_DAY) * 100,
        left: (colIndex / totalColumns) * 100,
        width: (1 / totalColumns) * 100,
      });
    }
  }

  return result;
}

/**
 * Group events by date key for the week/day grid.
 */
export function groupEventsByDay(eventList: SelectEvent[]): Map<string, SelectEvent[]> {
  const map = new Map<string, SelectEvent[]>();
  for (const event of eventList) {
    if (event.allDay) continue; // All-day events handled separately
    const key = toDateKey(event.dtstart);
    const existing = map.get(key) ?? [];
    existing.push(event);
    map.set(key, existing);
  }
  return map;
}

/**
 * Filter all-day events from a list.
 */
export function getAllDayEvents(eventList: SelectEvent[]): SelectEvent[] {
  return eventList.filter((e) => e.allDay);
}

/**
 * Composable for time grid calculations.
 */
export function useTimeGrid() {
  return {
    positionEventsInDay,
    groupEventsByDay,
    getAllDayEvents,
    toDateKey,
    toMinutesSinceMidnight,
  };
}
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/composables/useTimeGrid.ts
git commit -m "feat(haex-calendar): add time grid composable for event positioning"
```

---

## Task 9: Main Page Layout & Toolbar

**Files:**
- Create: `apps/haex-calendar/app/pages/index.vue`

**Context:** The main page with Google Calendar-style layout: toolbar on top, sidebar with calendar list on the left, main area with the active view. This task creates the layout shell and toolbar — the actual view components come in later tasks.

**Step 1: Create main page**

`app/pages/index.vue`:
```vue
<template>
  <div class="h-screen flex flex-col bg-background text-foreground">
    <!-- Toolbar -->
    <header class="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
      <!-- Navigation -->
      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors"
        :title="t('toolbar.today')"
        @click="calendarView.today()"
      >
        <CalendarDays class="w-5 h-5" />
      </button>

      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors"
        @click="calendarView.prev()"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>
      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors"
        @click="calendarView.next()"
      >
        <ChevronRight class="w-5 h-5" />
      </button>

      <h1 class="text-lg font-semibold min-w-48">
        {{ calendarView.title }}
      </h1>

      <div class="flex-1" />

      <!-- View Mode Toggle -->
      <div class="flex bg-muted rounded-md p-0.5 gap-0.5">
        <button
          v-for="mode in viewModes"
          :key="mode.value"
          :class="[
            'px-3 py-1 text-sm rounded-sm transition-colors',
            calendarView.viewMode === mode.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="calendarView.viewMode = mode.value"
        >
          {{ mode.label }}
        </button>
      </div>
    </header>

    <!-- Body -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <aside class="w-56 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto shrink-0">
        <!-- Calendar list -->
        <div class="space-y-1">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {{ t('sidebar.calendars') }}
            </span>
            <button
              class="p-1 rounded hover:bg-muted transition-colors"
              :title="t('sidebar.addCalendar')"
              @click="showCreateCalendar = true"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>

          <label
            v-for="cal in calendarsStore.calendars"
            :key="cal.id"
            class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer group"
          >
            <input
              type="checkbox"
              :checked="cal.visible"
              :style="{ accentColor: cal.color }"
              class="rounded"
              @change="calendarsStore.toggleVisibilityAsync(cal.id)"
            />
            <span
              class="w-2.5 h-2.5 rounded-full shrink-0"
              :style="{ backgroundColor: cal.color }"
            />
            <span class="text-sm truncate flex-1">{{ cal.name }}</span>
            <span
              v-if="cal.spaceId"
              class="text-xs text-muted-foreground"
              :title="t('sidebar.shared')"
            >
              <Users class="w-3.5 h-3.5" />
            </span>
          </label>
        </div>

        <div class="border-t border-border pt-3 space-y-1 mt-auto">
          <button
            class="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-sm transition-colors"
            @click="handleImport"
          >
            <Upload class="w-4 h-4" />
            {{ t('sidebar.import') }}
          </button>
        </div>
      </aside>

      <!-- Main content area -->
      <main class="flex-1 overflow-hidden">
        <CalendarMonthView v-if="calendarView.viewMode === 'month'" />
        <CalendarWeekView v-else-if="calendarView.viewMode === 'week'" />
        <CalendarDayView v-else-if="calendarView.viewMode === 'day'" />
      </main>
    </div>

    <!-- Create Calendar Dialog -->
    <CalendarCreateDialog
      v-model:open="showCreateCalendar"
    />

    <!-- Event Detail Drawer -->
    <CalendarEventDrawer
      v-model:open="showEventDrawer"
      :event-id="selectedEventId"
    />

    <!-- Hidden file input for import -->
    <input
      ref="fileInput"
      type="file"
      accept=".ics,.ical"
      class="hidden"
      @change="onFileSelected"
    />
  </div>
</template>

<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Upload,
  Users,
} from "lucide-vue-next";
import { watchDebounced } from "@vueuse/core";

const { t } = useI18n();

const calendarView = useCalendarViewStore();
const calendarsStore = useCalendarsStore();
const eventsStore = useEventsStore();
const haexVault = useHaexVaultStore();

const showCreateCalendar = ref(false);
const showEventDrawer = ref(false);
const selectedEventId = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const viewModes = computed(() => [
  { value: "month" as const, label: t("toolbar.month") },
  { value: "week" as const, label: t("toolbar.week") },
  { value: "day" as const, label: t("toolbar.day") },
]);

// Initialize on mount
onMounted(async () => {
  await haexVault.initializeAsync();
  await calendarsStore.loadCalendarsAsync();
  await eventsStore.loadEventsAsync();
});

// Reload events when view range or visible calendars change
watchDebounced(
  () => [calendarView.visibleRange, calendarsStore.visibleCalendarIds] as const,
  () => eventsStore.loadEventsAsync(),
  { debounce: 100, deep: true }
);

// Provide event selection to child components
function openEventDrawer(eventId: string) {
  selectedEventId.value = eventId;
  showEventDrawer.value = true;
}

// iCal import
function handleImport() {
  fileInput.value?.click();
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const { importFileAsync } = useIcal();
  // Import into first calendar (or show picker if multiple)
  const firstCalendar = calendarsStore.calendars[0];
  if (!firstCalendar) return;

  const result = await importFileAsync(file, firstCalendar.id);
  console.log(`[haex-calendar] Import: ${result.imported} new, ${result.updated} updated, ${result.skipped} skipped`);

  // Reset file input
  input.value = "";
}

// Provide openEventDrawer to child components
provide("openEventDrawer", openEventDrawer);
</script>

<i18n lang="yaml">
de:
  toolbar:
    today: Heute
    month: Monat
    week: Woche
    day: Tag
  sidebar:
    calendars: Kalender
    addCalendar: Kalender erstellen
    shared: Geteilt
    import: Importieren (.ics)
en:
  toolbar:
    today: Today
    month: Month
    week: Week
    day: Day
  sidebar:
    calendars: Calendars
    addCalendar: Create calendar
    shared: Shared
    import: Import (.ics)
</i18n>
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/pages/index.vue
git commit -m "feat(haex-calendar): add main page with toolbar, sidebar, and view switching"
```

---

## Task 10: Month View Component

**Files:**
- Create: `apps/haex-calendar/app/components/calendar/MonthView.vue`

**Context:** Google Calendar-style month grid. 7 columns (Mon–Sun), 5–6 rows. Each cell shows the day number and up to 3 event chips. Click on a day number → switch to day view. Click on empty space → quick create popover. Click on event → open event drawer.

**Step 1: Create MonthView component**

`app/components/calendar/MonthView.vue`:
```vue
<template>
  <div class="h-full flex flex-col">
    <!-- Day headers -->
    <div class="grid grid-cols-7 border-b border-border">
      <div
        v-for="day in weekDayNames"
        :key="day"
        class="text-center text-xs font-medium text-muted-foreground py-2"
      >
        {{ day }}
      </div>
    </div>

    <!-- Grid -->
    <div class="flex-1 grid grid-cols-7 auto-rows-fr">
      <div
        v-for="(cell, index) in gridCells"
        :key="index"
        :class="[
          'border-b border-r border-border p-1 min-h-0 overflow-hidden cursor-pointer',
          'hover:bg-muted/50 transition-colors',
          !cell.isCurrentMonth && 'opacity-40',
          cell.isToday && 'bg-primary/5',
        ]"
        @click="onCellClick(cell, $event)"
      >
        <!-- Day number -->
        <button
          :class="[
            'text-xs font-medium w-6 h-6 rounded-full flex items-center justify-center mb-0.5',
            cell.isToday ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
          ]"
          @click.stop="calendarView.goToDay(cell.date)"
        >
          {{ cell.dayNumber }}
        </button>

        <!-- Event chips -->
        <div class="space-y-0.5">
          <div
            v-for="event in cell.events.slice(0, 3)"
            :key="event.id"
            :class="[
              'text-xs px-1.5 py-0.5 rounded truncate cursor-pointer',
              'hover:opacity-80 transition-opacity',
            ]"
            :style="{
              backgroundColor: getEventColor(event) + '20',
              color: getEventColor(event),
              borderLeft: `3px solid ${getEventColor(event)}`,
            }"
            @click.stop="openEventDrawer(event.id)"
          >
            <span v-if="!event.allDay" class="font-medium">
              {{ formatTime(event.dtstart) }}
            </span>
            {{ event.summary }}
          </div>
          <div
            v-if="cell.events.length > 3"
            class="text-xs text-muted-foreground px-1.5"
          >
            +{{ cell.events.length - 3 }}
          </div>
        </div>
      </div>
    </div>

    <!-- Quick create popover -->
    <CalendarQuickCreate
      v-if="quickCreateDate"
      :date="quickCreateDate"
      :position="quickCreatePosition"
      @close="quickCreateDate = null"
      @created="quickCreateDate = null"
    />
  </div>
</template>

<script setup lang="ts">
import type { SelectEvent } from "~/database/schemas";
import { toDateKey } from "~/composables/useTimeGrid";

const calendarView = useCalendarViewStore();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();

const openEventDrawer = inject<(id: string) => void>("openEventDrawer")!;

const quickCreateDate = ref<Date | null>(null);
const quickCreatePosition = ref({ x: 0, y: 0 });

const { t } = useI18n();

const weekDayNames = computed(() => {
  const formatter = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
  const days = [];
  // Start from Monday
  const baseDate = new Date(2024, 0, 1); // Monday
  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    days.push(formatter.format(d));
  }
  return days;
});

interface GridCell {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: SelectEvent[];
}

const gridCells = computed((): GridCell[] => {
  const current = calendarView.currentDate;
  const year = current.getFullYear();
  const month = current.getMonth();

  // First day of the month
  const firstDay = new Date(year, month, 1);
  // Start from Monday of the first week
  const startDay = firstDay.getDay(); // 0=Sun
  const offset = startDay === 0 ? -6 : 1 - startDay; // Adjust to Monday start
  const gridStart = new Date(year, month, 1 + offset);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Build event map by date
  const eventsByDate = new Map<string, SelectEvent[]>();
  for (const event of eventsStore.events) {
    const key = toDateKey(event.dtstart);
    const list = eventsByDate.get(key) ?? [];
    list.push(event);
    eventsByDate.set(key, list);
  }

  // Generate 42 cells (6 weeks)
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    cells.push({
      date: new Date(d),
      dayNumber: d.getDate(),
      isCurrentMonth: d.getMonth() === month,
      isToday: dateKey === todayKey,
      events: eventsByDate.get(dateKey) ?? [],
    });
  }

  return cells;
});

function getEventColor(event: SelectEvent): string {
  if (event.color) return event.color;
  const cal = calendarsStore.getCalendar(event.calendarId);
  return cal?.color ?? "#3b82f6";
}

function formatTime(dtstart: string): string {
  const date = new Date(dtstart);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function onCellClick(cell: GridCell, mouseEvent: MouseEvent) {
  quickCreateDate.value = cell.date;
  quickCreatePosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY };
}
</script>
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/components/calendar/MonthView.vue
git commit -m "feat(haex-calendar): add month view with event chips and quick create"
```

---

## Task 11: Week View Component

**Files:**
- Create: `apps/haex-calendar/app/components/calendar/WeekView.vue`

**Context:** Google Calendar-style week view. 7 day columns with a vertical time axis (00:00–23:00). Timed events are positioned absolutely based on start/end. All-day events shown in a header row. This is the most complex view.

**Step 1: Create WeekView component**

`app/components/calendar/WeekView.vue`:
```vue
<template>
  <div class="h-full flex flex-col">
    <!-- Day headers with all-day events -->
    <div class="border-b border-border shrink-0">
      <!-- Day names -->
      <div class="grid grid-cols-[3.5rem_repeat(7,1fr)]">
        <div /> <!-- Time gutter spacer -->
        <div
          v-for="day in weekDays"
          :key="day.key"
          :class="[
            'text-center py-1.5 border-l border-border',
            day.isToday && 'bg-primary/5',
          ]"
        >
          <div class="text-xs text-muted-foreground">{{ day.weekday }}</div>
          <button
            :class="[
              'text-lg font-semibold w-8 h-8 rounded-full flex items-center justify-center mx-auto',
              day.isToday ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            ]"
            @click="calendarView.goToDay(day.date)"
          >
            {{ day.dayNumber }}
          </button>
        </div>
      </div>

      <!-- All-day events row -->
      <div
        v-if="allDayEvents.length > 0"
        class="grid grid-cols-[3.5rem_repeat(7,1fr)] border-t border-border"
      >
        <div class="text-xs text-muted-foreground p-1 text-right">{{ t('allDay') }}</div>
        <div
          v-for="day in weekDays"
          :key="day.key"
          class="border-l border-border p-0.5 space-y-0.5"
        >
          <div
            v-for="event in getAllDayForDate(day.key)"
            :key="event.id"
            :class="['text-xs px-1.5 py-0.5 rounded truncate cursor-pointer']"
            :style="{
              backgroundColor: getEventColor(event),
              color: 'white',
            }"
            @click="openEventDrawer(event.id)"
          >
            {{ event.summary }}
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable time grid -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto">
      <div class="grid grid-cols-[3.5rem_repeat(7,1fr)] relative" :style="{ height: `${HOUR_HEIGHT * 24}px` }">
        <!-- Time labels -->
        <div class="relative">
          <div
            v-for="hour in 24"
            :key="hour"
            class="absolute text-xs text-muted-foreground text-right pr-2 w-full -translate-y-1/2"
            :style="{ top: `${(hour - 1) * HOUR_HEIGHT}px` }"
          >
            {{ String(hour - 1).padStart(2, '0') }}:00
          </div>
        </div>

        <!-- Day columns -->
        <div
          v-for="day in weekDays"
          :key="day.key"
          class="relative border-l border-border"
          @click="onColumnClick(day.date, $event)"
        >
          <!-- Hour lines -->
          <div
            v-for="hour in 24"
            :key="hour"
            class="absolute w-full border-t border-border/50"
            :style="{ top: `${hour * HOUR_HEIGHT}px` }"
          />

          <!-- Current time indicator -->
          <div
            v-if="day.isToday"
            class="absolute w-full z-10 pointer-events-none"
            :style="{ top: `${currentTimePosition}px` }"
          >
            <div class="flex items-center">
              <div class="w-2.5 h-2.5 rounded-full bg-destructive -ml-1" />
              <div class="flex-1 h-0.5 bg-destructive" />
            </div>
          </div>

          <!-- Positioned events -->
          <div
            v-for="pe in getPositionedEvents(day.key)"
            :key="pe.event.id"
            class="absolute rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity text-xs border"
            :style="{
              top: `${(pe.top / 100) * HOUR_HEIGHT * 24}px`,
              height: `${(pe.height / 100) * HOUR_HEIGHT * 24}px`,
              left: `${pe.left}%`,
              width: `${pe.width}%`,
              backgroundColor: getEventColor(pe.event) + '20',
              borderColor: getEventColor(pe.event),
              color: getEventColor(pe.event),
            }"
            @click.stop="openEventDrawer(pe.event.id)"
          >
            <div class="font-medium truncate">{{ pe.event.summary }}</div>
            <div class="truncate">
              {{ formatTime(pe.event.dtstart) }} – {{ formatTime(pe.event.dtend) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <CalendarQuickCreate
      v-if="quickCreateDate"
      :date="quickCreateDate"
      :time="quickCreateTime"
      :position="quickCreatePosition"
      @close="quickCreateDate = null"
      @created="quickCreateDate = null"
    />
  </div>
</template>

<script setup lang="ts">
import type { SelectEvent } from "~/database/schemas";
import {
  positionEventsInDay,
  groupEventsByDay,
  getAllDayEvents,
  toDateKey,
} from "~/composables/useTimeGrid";

const { t } = useI18n();
const calendarView = useCalendarViewStore();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();
const openEventDrawer = inject<(id: string) => void>("openEventDrawer")!;

const scrollContainer = ref<HTMLElement | null>(null);
const quickCreateDate = ref<Date | null>(null);
const quickCreateTime = ref<string | null>(null);
const quickCreatePosition = ref({ x: 0, y: 0 });

const HOUR_HEIGHT = 60; // px per hour

// Scroll to 7am on mount
onMounted(() => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 7 * HOUR_HEIGHT;
  }
});

const weekDays = computed(() => {
  const range = calendarView.visibleRange;
  const start = new Date(range.start);
  const today = new Date();
  const todayKey = toDateKey(today.toISOString());
  const formatter = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = toDateKey(d.toISOString());
    days.push({
      date: new Date(d),
      key,
      weekday: formatter.format(d),
      dayNumber: d.getDate(),
      isToday: key === todayKey,
    });
  }
  return days;
});

// Current time indicator position
const currentTimePosition = computed(() => {
  const now = new Date();
  return (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT;
});

const eventsByDay = computed(() => groupEventsByDay(eventsStore.events));
const allDayEvents = computed(() => getAllDayEvents(eventsStore.events));

function getPositionedEvents(dateKey: string) {
  const dayEvents = eventsByDay.value.get(dateKey) ?? [];
  return positionEventsInDay(dayEvents);
}

function getAllDayForDate(dateKey: string) {
  return allDayEvents.value.filter((e) => toDateKey(e.dtstart) === dateKey);
}

function getEventColor(event: SelectEvent): string {
  if (event.color) return event.color;
  const cal = calendarsStore.getCalendar(event.calendarId);
  return cal?.color ?? "#3b82f6";
}

function formatTime(dt: string): string {
  const d = new Date(dt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function onColumnClick(date: Date, event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const relativeY = event.clientY - rect.top + (scrollContainer.value?.scrollTop ?? 0);
  const hour = Math.floor(relativeY / HOUR_HEIGHT);
  const minutes = Math.round(((relativeY % HOUR_HEIGHT) / HOUR_HEIGHT) * 60 / 15) * 15; // Snap to 15min

  quickCreateDate.value = date;
  quickCreateTime.value = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  quickCreatePosition.value = { x: event.clientX, y: event.clientY };
}
</script>

<i18n lang="yaml">
de:
  allDay: Ganztägig
en:
  allDay: All day
</i18n>
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/components/calendar/WeekView.vue
git commit -m "feat(haex-calendar): add week view with time grid and positioned events"
```

---

## Task 12: Day View Component

**Files:**
- Create: `apps/haex-calendar/app/components/calendar/DayView.vue`

**Context:** Identical to week view but with a single day column. Reuses the same time grid composable.

**Step 1: Create DayView component**

`app/components/calendar/DayView.vue`:
```vue
<template>
  <div class="h-full flex flex-col">
    <!-- All-day events -->
    <div
      v-if="allDayEventsForDay.length > 0"
      class="border-b border-border p-2 space-y-1 shrink-0"
    >
      <div class="text-xs text-muted-foreground mb-1">{{ t('allDay') }}</div>
      <div
        v-for="event in allDayEventsForDay"
        :key="event.id"
        class="text-xs px-2 py-1 rounded cursor-pointer"
        :style="{ backgroundColor: getEventColor(event), color: 'white' }"
        @click="openEventDrawer(event.id)"
      >
        {{ event.summary }}
      </div>
    </div>

    <!-- Scrollable time grid -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto">
      <div class="grid grid-cols-[3.5rem_1fr] relative" :style="{ height: `${HOUR_HEIGHT * 24}px` }">
        <!-- Time labels -->
        <div class="relative">
          <div
            v-for="hour in 24"
            :key="hour"
            class="absolute text-xs text-muted-foreground text-right pr-2 w-full -translate-y-1/2"
            :style="{ top: `${(hour - 1) * HOUR_HEIGHT}px` }"
          >
            {{ String(hour - 1).padStart(2, '0') }}:00
          </div>
        </div>

        <!-- Single day column -->
        <div
          class="relative border-l border-border"
          @click="onColumnClick($event)"
        >
          <!-- Hour lines -->
          <div
            v-for="hour in 24"
            :key="hour"
            class="absolute w-full border-t border-border/50"
            :style="{ top: `${hour * HOUR_HEIGHT}px` }"
          />

          <!-- Current time indicator -->
          <div
            v-if="isToday"
            class="absolute w-full z-10 pointer-events-none"
            :style="{ top: `${currentTimePosition}px` }"
          >
            <div class="flex items-center">
              <div class="w-2.5 h-2.5 rounded-full bg-destructive -ml-1" />
              <div class="flex-1 h-0.5 bg-destructive" />
            </div>
          </div>

          <!-- Positioned events -->
          <div
            v-for="pe in positionedEvents"
            :key="pe.event.id"
            class="absolute rounded-md px-2 py-1 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity text-sm border"
            :style="{
              top: `${(pe.top / 100) * HOUR_HEIGHT * 24}px`,
              height: `${(pe.height / 100) * HOUR_HEIGHT * 24}px`,
              left: `${pe.left}%`,
              width: `${pe.width}%`,
              backgroundColor: getEventColor(pe.event) + '20',
              borderColor: getEventColor(pe.event),
              color: getEventColor(pe.event),
            }"
            @click.stop="openEventDrawer(pe.event.id)"
          >
            <div class="font-medium">{{ pe.event.summary }}</div>
            <div>
              {{ formatTime(pe.event.dtstart) }} – {{ formatTime(pe.event.dtend) }}
            </div>
            <div v-if="pe.event.location" class="text-xs opacity-75 truncate">
              {{ pe.event.location }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <CalendarQuickCreate
      v-if="quickCreateDate"
      :date="quickCreateDate"
      :time="quickCreateTime"
      :position="quickCreatePosition"
      @close="quickCreateDate = null"
      @created="quickCreateDate = null"
    />
  </div>
</template>

<script setup lang="ts">
import type { SelectEvent } from "~/database/schemas";
import {
  positionEventsInDay,
  getAllDayEvents,
  toDateKey,
} from "~/composables/useTimeGrid";

const { t } = useI18n();
const calendarView = useCalendarViewStore();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();
const openEventDrawer = inject<(id: string) => void>("openEventDrawer")!;

const scrollContainer = ref<HTMLElement | null>(null);
const quickCreateDate = ref<Date | null>(null);
const quickCreateTime = ref<string | null>(null);
const quickCreatePosition = ref({ x: 0, y: 0 });

const HOUR_HEIGHT = 60;

onMounted(() => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 7 * HOUR_HEIGHT;
  }
});

const currentDateKey = computed(() => toDateKey(calendarView.currentDate.toISOString()));

const isToday = computed(() => {
  const today = new Date();
  return toDateKey(today.toISOString()) === currentDateKey.value;
});

const currentTimePosition = computed(() => {
  const now = new Date();
  return (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT;
});

const timedEvents = computed(() =>
  eventsStore.events.filter((e) => !e.allDay && toDateKey(e.dtstart) === currentDateKey.value)
);

const allDayEventsForDay = computed(() =>
  getAllDayEvents(eventsStore.events).filter((e) => toDateKey(e.dtstart) === currentDateKey.value)
);

const positionedEvents = computed(() => positionEventsInDay(timedEvents.value));

function getEventColor(event: SelectEvent): string {
  if (event.color) return event.color;
  const cal = calendarsStore.getCalendar(event.calendarId);
  return cal?.color ?? "#3b82f6";
}

function formatTime(dt: string): string {
  const d = new Date(dt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function onColumnClick(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const relativeY = event.clientY - rect.top + (scrollContainer.value?.scrollTop ?? 0);
  const hour = Math.floor(relativeY / HOUR_HEIGHT);
  const minutes = Math.round(((relativeY % HOUR_HEIGHT) / HOUR_HEIGHT) * 60 / 15) * 15;

  quickCreateDate.value = calendarView.currentDate;
  quickCreateTime.value = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  quickCreatePosition.value = { x: event.clientX, y: event.clientY };
}
</script>

<i18n lang="yaml">
de:
  allDay: Ganztägig
en:
  allDay: All day
</i18n>
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/components/calendar/DayView.vue
git commit -m "feat(haex-calendar): add day view component"
```

---

## Task 13: Quick Create Popover

**Files:**
- Create: `apps/haex-calendar/app/components/calendar/QuickCreate.vue`

**Context:** Small popover that appears on clicking a time slot. Contains title input and time display. "More Details" opens the full event drawer.

**Step 1: Create QuickCreate component**

`app/components/calendar/QuickCreate.vue`:
```vue
<template>
  <div
    ref="popoverRef"
    class="fixed z-50 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border p-3 w-72"
    :style="{ top: `${position.y}px`, left: `${position.x}px` }"
  >
    <input
      ref="titleInput"
      v-model="title"
      class="w-full bg-transparent text-sm font-medium outline-none border-b border-border pb-1 mb-2 placeholder:text-muted-foreground"
      :placeholder="t('titlePlaceholder')"
      @keydown.enter="handleCreate"
      @keydown.escape="emit('close')"
    />

    <div class="text-xs text-muted-foreground mb-3">
      {{ formattedDateTime }}
    </div>

    <!-- Calendar selector -->
    <select
      v-model="selectedCalendarId"
      class="w-full text-xs bg-muted rounded px-2 py-1 mb-3 outline-none"
    >
      <option
        v-for="cal in calendarsStore.calendars"
        :key="cal.id"
        :value="cal.id"
      >
        {{ cal.name }}
      </option>
    </select>

    <div class="flex gap-2">
      <button
        class="flex-1 text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:opacity-90 transition-opacity"
        @click="handleCreate"
      >
        {{ t('create') }}
      </button>
      <button
        class="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 transition-colors"
        @click="handleMoreDetails"
      >
        {{ t('moreDetails') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";

const props = defineProps<{
  date: Date;
  time?: string | null;
  position: { x: number; y: number };
}>();

const emit = defineEmits<{
  close: [];
  created: [];
}>();

const { t } = useI18n();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();
const openEventDrawer = inject<(id: string) => void>("openEventDrawer")!;

const popoverRef = ref<HTMLElement | null>(null);
const titleInput = ref<HTMLInputElement | null>(null);
const title = ref("");
const selectedCalendarId = ref(calendarsStore.calendars[0]?.id ?? "");

onClickOutside(popoverRef, () => emit("close"));

onMounted(() => {
  nextTick(() => titleInput.value?.focus());
});

const formattedDateTime = computed(() => {
  const d = props.date;
  const dateStr = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);

  if (props.time) {
    const [h, m] = props.time.split(":");
    const endH = String(Number(h) + 1).padStart(2, "0");
    return `${dateStr}, ${h}:${m} – ${endH}:${m}`;
  }
  return dateStr;
});

async function handleCreate() {
  if (!title.value.trim()) return;
  if (!selectedCalendarId.value) return;

  const d = props.date;
  let dtstart: string;
  let dtend: string;
  let allDay = false;

  if (props.time) {
    const [h, m] = props.time.split(":");
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(h), Number(m));
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    dtstart = start.toISOString();
    dtend = end.toISOString();
  } else {
    // All-day event
    dtstart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    dtend = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
    allDay = true;
  }

  await eventsStore.createEventAsync({
    calendarId: selectedCalendarId.value,
    summary: title.value.trim(),
    dtstart,
    dtend,
    allDay,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: "CONFIRMED",
    sequence: 0,
  });

  emit("created");
}

async function handleMoreDetails() {
  // Create the event first, then open detail drawer
  if (!title.value.trim() || !selectedCalendarId.value) {
    emit("close");
    return;
  }
  const id = await handleCreate();
  // TODO: openEventDrawer after creation
  emit("close");
}
</script>

<i18n lang="yaml">
de:
  titlePlaceholder: Titel eingeben
  create: Erstellen
  moreDetails: Mehr Details →
en:
  titlePlaceholder: Add title
  create: Create
  moreDetails: More details →
</i18n>
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/components/calendar/QuickCreate.vue
git commit -m "feat(haex-calendar): add quick create popover for events"
```

---

## Task 14: Event Detail Drawer

**Files:**
- Create: `apps/haex-calendar/app/components/calendar/EventDrawer.vue`

**Context:** Full event editor in a `UiDrawerModal`. Shows all CalDAV fields. Used for viewing and editing existing events, and for "More Details" from quick create.

**Step 1: Create EventDrawer component**

`app/components/calendar/EventDrawer.vue`:
```vue
<template>
  <UiDrawerModal v-model:open="isOpen" :title="isNew ? t('title.new') : t('title.edit')">
    <template #content>
      <div class="space-y-4 p-4">
        <!-- Summary -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.summary') }}</label>
          <input
            v-model="form.summary"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
          />
        </div>

        <!-- Date/Time -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm font-medium">{{ t('fields.start') }}</label>
            <input
              v-model="form.dtstart"
              :type="form.allDay ? 'date' : 'datetime-local'"
              class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            />
          </div>
          <div>
            <label class="text-sm font-medium">{{ t('fields.end') }}</label>
            <input
              v-model="form.dtend"
              :type="form.allDay ? 'date' : 'datetime-local'"
              class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            />
          </div>
        </div>

        <!-- All day toggle -->
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="form.allDay" type="checkbox" class="rounded" />
          <span class="text-sm">{{ t('fields.allDay') }}</span>
        </label>

        <!-- Location -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.location') }}</label>
          <input
            v-model="form.location"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            :placeholder="t('fields.locationPlaceholder')"
          />
        </div>

        <!-- Status -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.status') }}</label>
          <select
            v-model="form.status"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
          >
            <option value="CONFIRMED">{{ t('status.confirmed') }}</option>
            <option value="TENTATIVE">{{ t('status.tentative') }}</option>
            <option value="CANCELLED">{{ t('status.cancelled') }}</option>
          </select>
        </div>

        <!-- Color -->
        <div>
          <label class="text-sm font-medium mb-1 block">{{ t('fields.color') }}</label>
          <div class="flex gap-2">
            <button
              v-for="c in presetColors"
              :key="c"
              :class="[
                'w-7 h-7 rounded-full border-2 transition-transform',
                form.color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
              ]"
              :style="{ backgroundColor: c }"
              @click="form.color = form.color === c ? null : c"
            />
          </div>
        </div>

        <!-- Categories -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.categories') }}</label>
          <input
            v-model="form.categories"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            :placeholder="t('fields.categoriesPlaceholder')"
          />
        </div>

        <!-- URL -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.url') }}</label>
          <input
            v-model="form.url"
            type="url"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            placeholder="https://..."
          />
        </div>

        <!-- Description -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.description') }}</label>
          <textarea
            v-model="form.description"
            rows="3"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary resize-none"
          />
        </div>

        <!-- Calendar -->
        <div>
          <label class="text-sm font-medium">{{ t('fields.calendar') }}</label>
          <select
            v-model="form.calendarId"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
          >
            <option
              v-for="cal in calendarsStore.calendars"
              :key="cal.id"
              :value="cal.id"
            >
              {{ cal.name }}
            </option>
          </select>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex gap-2 p-4 border-t border-border">
        <button
          v-if="!isNew"
          class="text-sm text-destructive hover:text-destructive/80 px-3 py-2 transition-colors"
          @click="handleDelete"
        >
          {{ t('delete') }}
        </button>
        <div class="flex-1" />
        <button
          class="text-sm text-muted-foreground px-3 py-2"
          @click="isOpen = false"
        >
          {{ t('cancel') }}
        </button>
        <button
          class="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity"
          @click="handleSave"
        >
          {{ t('save') }}
        </button>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
const isOpen = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  eventId?: string | null;
}>();

const { t } = useI18n();
const eventsStore = useEventsStore();
const calendarsStore = useCalendarsStore();

const presetColors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#6b7280"];

const isNew = computed(() => !props.eventId);

const form = reactive({
  summary: "",
  dtstart: "",
  dtend: "",
  allDay: false,
  location: "",
  status: "CONFIRMED",
  color: null as string | null,
  categories: "",
  url: "",
  description: "",
  calendarId: calendarsStore.calendars[0]?.id ?? "",
});

// Load event data when eventId changes
watch(
  () => props.eventId,
  (id) => {
    if (!id) {
      // Reset form for new event
      Object.assign(form, {
        summary: "",
        dtstart: "",
        dtend: "",
        allDay: false,
        location: "",
        status: "CONFIRMED",
        color: null,
        categories: "",
        url: "",
        description: "",
        calendarId: calendarsStore.calendars[0]?.id ?? "",
      });
      return;
    }

    const event = eventsStore.getEvent(id);
    if (!event) return;

    // Format dates for input fields
    const formatForInput = (dt: string, allDay: boolean) => {
      if (allDay) return dt.split("T")[0];
      const d = new Date(dt);
      return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
    };

    Object.assign(form, {
      summary: event.summary,
      dtstart: formatForInput(event.dtstart, event.allDay),
      dtend: formatForInput(event.dtend, event.allDay),
      allDay: event.allDay,
      location: event.location ?? "",
      status: event.status,
      color: event.color,
      categories: event.categories ?? "",
      url: event.url ?? "",
      description: event.description ?? "",
      calendarId: event.calendarId,
    });
  },
  { immediate: true }
);

async function handleSave() {
  if (!form.summary.trim()) return;

  const data = {
    summary: form.summary.trim(),
    dtstart: form.allDay ? form.dtstart : new Date(form.dtstart).toISOString(),
    dtend: form.allDay ? form.dtend : new Date(form.dtend).toISOString(),
    allDay: form.allDay,
    location: form.location || null,
    status: form.status,
    color: form.color,
    categories: form.categories || null,
    url: form.url || null,
    description: form.description || null,
    calendarId: form.calendarId,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sequence: 0,
  };

  if (props.eventId) {
    await eventsStore.updateEventAsync(props.eventId, data);
  } else {
    await eventsStore.createEventAsync(data);
  }

  isOpen.value = false;
}

async function handleDelete() {
  if (!props.eventId) return;
  await eventsStore.deleteEventAsync(props.eventId);
  isOpen.value = false;
}
</script>

<i18n lang="yaml">
de:
  title:
    new: Neues Event
    edit: Event bearbeiten
  fields:
    summary: Titel
    start: Start
    end: Ende
    allDay: Ganztägig
    location: Ort
    locationPlaceholder: Ort hinzufügen
    status: Status
    color: Farbe
    categories: Kategorien
    categoriesPlaceholder: Arbeit, Privat, ...
    url: URL
    description: Beschreibung
    calendar: Kalender
  status:
    confirmed: Bestätigt
    tentative: Vorläufig
    cancelled: Abgesagt
  save: Speichern
  cancel: Abbrechen
  delete: Löschen
en:
  title:
    new: New Event
    edit: Edit Event
  fields:
    summary: Title
    start: Start
    end: End
    allDay: All day
    location: Location
    locationPlaceholder: Add location
    status: Status
    color: Color
    categories: Categories
    categoriesPlaceholder: Work, Personal, ...
    url: URL
    description: Description
    calendar: Calendar
  status:
    confirmed: Confirmed
    tentative: Tentative
    cancelled: Cancelled
  save: Save
  cancel: Cancel
  delete: Delete
</i18n>
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/components/calendar/EventDrawer.vue
git commit -m "feat(haex-calendar): add event detail drawer with CalDAV fields"
```

---

## Task 15: Create Calendar Dialog

**Files:**
- Create: `apps/haex-calendar/app/components/calendar/CreateDialog.vue`

**Context:** Dialog for creating a new calendar. Name + color picker. The "Share" option creates a Space automatically.

**Step 1: Create CreateDialog component**

`app/components/calendar/CreateDialog.vue`:
```vue
<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('title')">
    <template #content>
      <div class="space-y-4 p-4">
        <div>
          <label class="text-sm font-medium">{{ t('name') }}</label>
          <input
            ref="nameInput"
            v-model="name"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
            :placeholder="t('namePlaceholder')"
            @keydown.enter="handleCreate"
          />
        </div>

        <div>
          <label class="text-sm font-medium mb-1 block">{{ t('color') }}</label>
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="c in presetColors"
              :key="c"
              :class="[
                'w-8 h-8 rounded-full border-2 transition-transform',
                selectedColor === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
              ]"
              :style="{ backgroundColor: c }"
              @click="selectedColor = c"
            />
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 p-4 border-t border-border">
        <button
          class="text-sm text-muted-foreground px-3 py-2"
          @click="isOpen = false"
        >
          {{ t('cancel') }}
        </button>
        <button
          class="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity"
          :disabled="!name.trim()"
          @click="handleCreate"
        >
          {{ t('create') }}
        </button>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const calendarsStore = useCalendarsStore();

const nameInput = ref<HTMLInputElement | null>(null);
const name = ref("");
const selectedColor = ref("#3b82f6");

const presetColors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#6b7280"];

watch(isOpen, (open) => {
  if (open) {
    name.value = "";
    selectedColor.value = "#3b82f6";
    nextTick(() => nameInput.value?.focus());
  }
});

async function handleCreate() {
  if (!name.value.trim()) return;
  await calendarsStore.createCalendarAsync({
    name: name.value.trim(),
    color: selectedColor.value,
  });
  isOpen.value = false;
}
</script>

<i18n lang="yaml">
de:
  title: Neuer Kalender
  name: Name
  namePlaceholder: Kalendername
  color: Farbe
  cancel: Abbrechen
  create: Erstellen
en:
  title: New Calendar
  name: Name
  namePlaceholder: Calendar name
  color: Color
  cancel: Cancel
  create: Create
</i18n>
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/components/calendar/CreateDialog.vue
git commit -m "feat(haex-calendar): add create calendar dialog"
```

---

## Task 16: Drag & Drop for Week/Day Views

**Files:**
- Create: `apps/haex-calendar/app/composables/useEventDrag.ts`
- Modify: `apps/haex-calendar/app/components/calendar/WeekView.vue` — add drag support to events
- Modify: `apps/haex-calendar/app/components/calendar/DayView.vue` — add drag support to events

**Context:** Use `@vue-dnd-kit` to enable dragging events to different time slots. On drag end, update dtstart/dtend based on the new position. Start with move (change time), resize (change duration) can be added later.

**Step 1: Create useEventDrag composable**

`app/composables/useEventDrag.ts`:
```typescript
import type { SelectEvent } from "~/database/schemas";

/**
 * Calculate new dtstart/dtend when an event is moved to a new time slot.
 * @param event - The original event
 * @param newDate - The target date
 * @param newStartMinutes - Minutes since midnight for the new start
 * @param hourHeight - Pixel height of one hour
 */
export function calculateNewTimes(
  event: SelectEvent,
  newDate: Date,
  newStartMinutes: number
): { dtstart: string; dtend: string } {
  // Calculate original duration
  const originalStart = new Date(event.dtstart);
  const originalEnd = new Date(event.dtend);
  const durationMs = originalEnd.getTime() - originalStart.getTime();

  // Build new start
  const newStart = new Date(newDate);
  newStart.setHours(Math.floor(newStartMinutes / 60));
  newStart.setMinutes(newStartMinutes % 60);
  newStart.setSeconds(0, 0);

  // Preserve duration
  const newEnd = new Date(newStart.getTime() + durationMs);

  return {
    dtstart: newStart.toISOString(),
    dtend: newEnd.toISOString(),
  };
}

/**
 * Snap a pixel Y position to the nearest 15-minute interval.
 */
export function snapToGrid(y: number, hourHeight: number): number {
  const minutesPerPixel = 60 / hourHeight;
  const totalMinutes = y * minutesPerPixel;
  const snapped = Math.round(totalMinutes / 15) * 15;
  return snapped;
}
```

**Step 2: Add drag to WeekView and DayView**

In both view components, wrap each positioned event in a draggable container. On drag end:
1. Calculate the new Y position → convert to minutes
2. Determine which day column it was dropped in (for week view)
3. Call `eventsStore.updateEventAsync(id, { dtstart, dtend })`

The exact @vue-dnd-kit integration will use:
- `DndProvider` wrapping the time grid
- `useDraggable()` on each event element
- `useDroppable()` on each time slot cell

This step provides the utility functions. The actual DnD wiring in the Vue templates should be implemented iteratively — start with basic position-based drag (mouse events), then upgrade to @vue-dnd-kit if the basic approach works well.

**Step 3: Commit**

```bash
git add apps/haex-calendar/app/composables/useEventDrag.ts
git commit -m "feat(haex-calendar): add event drag utilities"
```

---

## Task 17: Default Calendar & First-Run Experience

**Files:**
- Modify: `apps/haex-calendar/app/pages/index.vue` — add first-run auto-creation of personal calendar

**Context:** When the extension opens and there are no calendars yet, auto-create a "Personal" calendar.

**Step 1: Add first-run logic to index.vue**

In the `onMounted` callback, after loading calendars:
```typescript
// Auto-create personal calendar on first run
if (calendarsStore.calendars.length === 0) {
  await calendarsStore.createCalendarAsync({
    name: "Persönlich",
    color: "#3b82f6",
  });
}
```

**Step 2: Commit**

```bash
git add apps/haex-calendar/app/pages/index.vue
git commit -m "feat(haex-calendar): auto-create personal calendar on first run"
```

---

## Task 18: Integration Test & Polish

**Step 1: Run the extension in dev mode**

Run: `cd apps/haex-calendar && pnpm dev`
Expected: Extension starts on port 3002 without errors.

**Step 2: Test in haex-vault**

1. Open haex-vault
2. Load haex-calendar extension
3. Verify: Personal calendar auto-created
4. Verify: Month/Week/Day views switch correctly
5. Verify: Click on time slot → quick create popover → create event
6. Verify: Event appears in grid
7. Verify: Click event → detail drawer → edit/delete
8. Verify: Calendar sidebar → toggle visibility
9. Verify: Import .ics file → events appear

**Step 3: Fix any issues found during testing**

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(haex-calendar): polish and integration fixes"
```

---

## Task 19: Shared Spaces Integration (Future)

> **Note:** This task depends on the Shared Spaces implementation being complete in haex-vault. It can be implemented after the MVP is working.

**Files:**
- Modify: `apps/haex-calendar/app/stores/calendars.ts` — add share/join/leave methods
- Create: `apps/haex-calendar/app/components/calendar/ShareDialog.vue`

**When to implement:** After confirming the Shared Spaces MVP works end-to-end with the sync orchestrator.

**Concept:**
1. "Share Calendar" → creates a Space via vault-sdk → sets `calendar.spaceId`
2. "Join Calendar" → joins Space from invite → creates local calendar entry with `spaceId`
3. Sync orchestrator handles push/pull of calendar+event records via Space backend
4. Calendar events are encrypted with the Space key

---

## Summary

| Task | Component | Scope |
|------|-----------|-------|
| 1 | Project Scaffolding | Config, deps, shell files |
| 2 | Database Schema | 2 tables (calendars, events) |
| 3 | HaexVault Store | SDK init, migrations |
| 4 | Calendars Store | Calendar CRUD, visibility |
| 5 | Events Store | Event CRUD, range queries |
| 6 | CalendarView Store | Month/Week/Day navigation |
| 7 | iCal Composable | Import/Export .ics |
| 8 | Time Grid Composable | Event positioning |
| 9 | Main Page | Layout, toolbar, sidebar |
| 10 | Month View | Grid with event chips |
| 11 | Week View | Time grid with positioned events |
| 12 | Day View | Single-column time grid |
| 13 | Quick Create | Popover for fast event creation |
| 14 | Event Drawer | Full CalDAV editor |
| 15 | Create Calendar Dialog | Calendar creation |
| 16 | Drag & Drop | Event move utilities |
| 17 | First-Run | Auto-create personal calendar |
| 18 | Integration Test | End-to-end verification |
| 19 | Shared Spaces | Future: calendar sharing via Spaces |
