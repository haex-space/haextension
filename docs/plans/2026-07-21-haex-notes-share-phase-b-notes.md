# haex-notes Sharing & Import — Phase B/C: Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Depends on Phase A** (`docs/plans/2026-07-21-haex-notes-share-phase-a-platform.md`) being published: needs SDK ≥ the version exposing `spaces.getMembersAsync` and `SpaceAssignment.authoredByDid`. The pure sharing (assign/unassign) works on SDK 3.3.0; author attribution + read-only detection need the new SDK.

**Goal:** Let students (a) share notebooks or individual pages read-only into a shared space, seeing "shared by {name}" on incoming content, and (b) import selected shared pages as editable copies into their own notebook.

**Architecture:** Mirror haex-calendar's proven sharing (assign rows to a space via `sdk.spaces`; the vault's cloud sync pushes them read-only to members). Read-only + author come from Phase A's `authoredByDid` on assignments + `getMembersAsync`. Import is a local deep-copy of page rows into a notebook the importer owns.

**Tech Stack:** Nuxt 3 + Vue + Pinia + Drizzle/SQLite; shared UI layer `packages/haex-ui` (`UiDrawerModal`, Shadcn*). **No test runner exists in haex-notes** (vitest is not a dependency) → tasks use manual in-app verification + `nuxt` typecheck/build, not TDD.

**Reference blueprint (read these first):**
- `apps/haex-calendar/app/stores/calendars.ts` — share/unshare with groupId
- `apps/haex-calendar/app/stores/events.ts` (~L205) — child rows auto-inherit assignment
- `apps/haex-calendar/app/components/calendar/ShareDialog.vue` — the share dialog
- `apps/haex-calendar/app/pages/index.vue` (L184-240, L520-534) — dropdown + dialog wiring

---

## Phase B — Sharing (read-only) + author attribution

### Task 1: Add the `spaces` permission to the manifest

**File:** `/home/haex/Projekte/haextension/apps/haex-notes/haextension/manifest.json`

**Step 1:** In `permissions`, add:
```json
    "spaces": [
      { "target": "*", "operation": "readWrite" }
    ],
```
**Step 2: Verify** — reload the extension in the vault; `sdk.spaces.listSpacesAsync()` no longer throws a permission error (a permission prompt appears once, then is remembered).

**Step 3: Commit**
```bash
cd /home/haex/Projekte/haextension
git add apps/haex-notes/haextension/manifest.json
git commit -m "feat(haex-notes): request spaces permission"
```

---

### Task 2: Add `space_id` to the `notebooks` schema + migration

**Files:**
- Modify: `apps/haex-notes/app/database/schemas/index.ts` (`notebooks`, L17-32)
- Generated: `apps/haex-notes/app/database/migrations/0003_*.sql` (+ `meta/`)

**Step 1:** In the `notebooks` table, after `defaultOrientation` (L29), add:
```ts
    /** Non-null = "entire notebook shared into this space; future pages inherit" */
    spaceId: text("space_id"),
```
(Nullable — do NOT add `.notNull()`. Marks full-notebook sharing + drives auto-inherit. Partial page-sharing leaves this NULL.)

**Step 2: Generate the migration**
```bash
cd /home/haex/Projekte/haextension/apps/haex-notes
pnpm db:generate     # → app/database/migrations/0003_<name>.sql with:
                     #   ALTER TABLE `..._notebooks` ADD `space_id` text;
```
**Step 3: Verify** the generated SQL is a single `ADD` column statement; the runtime `import.meta.glob` picks it up automatically (no journal editing).

**Step 4: Commit**
```bash
cd /home/haex/Projekte/haextension
git add apps/haex-notes/app/database/schemas/index.ts apps/haex-notes/app/database/migrations/
git commit -m "feat(haex-notes): add space_id column to notebooks"
```

---

### Task 3: Create the spaces store (`app/stores/spaces.ts`)

**File (create):** `/home/haex/Projekte/haextension/apps/haex-notes/app/stores/spaces.ts`

Mirror `apps/haex-calendar/app/stores/calendars.ts` share logic. Note the `../../` import depth from `app/stores/`.

```ts
import { eq } from "drizzle-orm";
import { getTableName, type SpaceAssignment, type DecryptedSpace, type SpaceMember } from "@haex-space/vault-sdk";
import { notebooks, pages } from "~/database/schemas";
import manifest from "../../haextension/manifest.json";
import packageJson from "../../package.json";

const FULL_NOTEBOOKS_TABLE = getTableName(manifest.publicKey, packageJson.name, "notebooks");
const FULL_PAGES_TABLE = getTableName(manifest.publicKey, packageJson.name, "pages");
export { FULL_NOTEBOOKS_TABLE, FULL_PAGES_TABLE };

export const useSpacesStore = defineStore("spaces", () => {
  const haexVault = useHaexVaultStore();

  const nbPk = (id: string) => JSON.stringify({ id });

  async function getNotebookAssignmentsAsync(notebookId: string): Promise<SpaceAssignment[]> {
    return haexVault.client.spaces.getAssignmentsAsync(FULL_NOTEBOOKS_TABLE, nbPk(notebookId));
  }

  /** Share the whole notebook (+ all its pages). Future pages inherit (space_id set). */
  async function shareNotebookWithSpaceAsync(notebookId: string, spaceId: string) {
    const orm = haexVault.orm;
    if (!orm) return;
    const [nb] = await orm.select().from(notebooks).where(eq(notebooks.id, notebookId));
    const nbPages = await orm.select().from(pages).where(eq(pages.notebookId, notebookId));

    const assignments: SpaceAssignment[] = [
      { tableName: FULL_NOTEBOOKS_TABLE, rowPks: nbPk(notebookId), spaceId, groupId: notebookId, type: "Notebook", label: nb?.name },
      ...nbPages.map((p) => ({ tableName: FULL_PAGES_TABLE, rowPks: nbPk(p.id), spaceId, groupId: notebookId })),
    ];
    await haexVault.client.spaces.assignAsync(assignments);
    await orm.update(notebooks).set({ spaceId }).where(eq(notebooks.id, notebookId));
  }

  /** Share only selected pages. Notebook row shared for context; space_id NOT set (partial). */
  async function sharePagesWithSpaceAsync(notebookId: string, pageIds: string[], spaceId: string) {
    const orm = haexVault.orm;
    if (!orm) return;
    const [nb] = await orm.select().from(notebooks).where(eq(notebooks.id, notebookId));
    const assignments: SpaceAssignment[] = [
      { tableName: FULL_NOTEBOOKS_TABLE, rowPks: nbPk(notebookId), spaceId, groupId: notebookId, type: "Notebook", label: nb?.name },
      ...pageIds.map((pid) => ({ tableName: FULL_PAGES_TABLE, rowPks: nbPk(pid), spaceId, groupId: notebookId })),
    ];
    await haexVault.client.spaces.assignAsync(assignments);
  }

  async function unshareNotebookFromSpaceAsync(notebookId: string, spaceId: string) {
    const orm = haexVault.orm;
    if (!orm) return;
    const nbPages = await orm.select().from(pages).where(eq(pages.notebookId, notebookId));
    const assignments: SpaceAssignment[] = [
      { tableName: FULL_NOTEBOOKS_TABLE, rowPks: nbPk(notebookId), spaceId, groupId: notebookId },
      ...nbPages.map((p) => ({ tableName: FULL_PAGES_TABLE, rowPks: nbPk(p.id), spaceId, groupId: notebookId })),
    ];
    await haexVault.client.spaces.unassignAsync(assignments);
    const remaining = await getNotebookAssignmentsAsync(notebookId);
    await orm.update(notebooks).set({ spaceId: remaining[0]?.spaceId ?? null }).where(eq(notebooks.id, notebookId));
  }

  /** Spaces the user can write to (share targets). */
  async function listWritableSpacesAsync(): Promise<DecryptedSpace[]> {
    const all = await haexVault.client.spaces.listSpacesAsync();
    return all.filter((s) => s.capabilities.includes("space/write") || s.capabilities.includes("space/admin"));
  }

  async function getMembersAsync(spaceId: string): Promise<SpaceMember[]> {
    return haexVault.client.spaces.getMembersAsync(spaceId);
  }

  return {
    getNotebookAssignmentsAsync, shareNotebookWithSpaceAsync, sharePagesWithSpaceAsync,
    unshareNotebookFromSpaceAsync, listWritableSpacesAsync, getMembersAsync,
  };
});
```

**Verify:** typecheck (`pnpm dev` and watch the terminal, or `pnpm nuxt typecheck` if available). No manual permission-retry logic needed (SDK ≥3.2.8 auto-retries; see [[sdk-permission-auto-retry]]).

**Commit:** `feat(haex-notes): add spaces store for sharing`

---

### Task 4: Auto-inherit assignment for new pages

**File:** `apps/haex-notes/app/stores/notebook.ts` (the page-creation action; find where `db.insert(pages).values(...)` runs)

After a new page is inserted, mirror `events.ts:205-223`:
```ts
// Auto-assign to shared spaces if the whole notebook is shared
try {
  const nbAssignments = await haexVault.client.spaces.getAssignmentsAsync(
    FULL_NOTEBOOKS_TABLE, JSON.stringify({ id: notebookId }),
  );
  if (nbAssignments.length > 0) {
    // only inherit when the notebook is fully shared (space_id set), not per-page shares
    const [nb] = await orm.select().from(notebooks).where(eq(notebooks.id, notebookId));
    if (nb?.spaceId) {
      await haexVault.client.spaces.assignAsync(
        nbAssignments
          .filter((a) => a.spaceId === nb.spaceId)
          .map((a) => ({ tableName: FULL_PAGES_TABLE, rowPks: JSON.stringify({ id: newPageId }), spaceId: a.spaceId, groupId: a.groupId })),
      );
    }
  }
} catch (err) { console.warn("[haex-notes] auto-assign new page failed:", err); }
```
Import `FULL_NOTEBOOKS_TABLE`/`FULL_PAGES_TABLE` from `~/stores/spaces`.

**Verify (manual):** share a whole notebook → add a page → the new page appears in `getNotebookAssignmentsAsync` group. **Commit:** `feat(haex-notes): auto-share new pages of a shared notebook`

---

### Task 5: Build the Share dialog

**File (create):** `apps/haex-notes/app/components/notes/ShareDialog.vue` (auto-import name `NotesShareDialog`)

Port `apps/haex-calendar/app/components/calendar/ShareDialog.vue` near-verbatim using `UiDrawerModal`. Changes:
- Prop `notebookId: string` (was `calendarId`).
- Use `useSpacesStore()`; load via `Promise.all([spacesStore.listWritableSpacesAsync(), spacesStore.getNotebookAssignmentsAsync(notebookId)])`.
- `toggleSpaceAssignment`: call `shareNotebookWithSpaceAsync` / `unshareNotebookFromSpaceAsync`.
- Keep the online/local badge + `<i18n lang="yaml">` block (translate to notebook wording).

**Verify (manual):** open dialog on a notebook; available spaces list; toggling shares/unshares (confirm via reopening — checkmark persists). **Commit:** `feat(haex-notes): add notebook share dialog`

---

### Task 6: Wire share entry + shared badge into the notebook list

**File:** `apps/haex-notes/app/pages/index.vue`

- Replace the bare delete button (L116-132) with a `ShadcnDropdownMenu` (trigger = `EllipsisVertical`) containing **Teilen** (`Share2` icon → `openShareDialog(nb.id)`) and **Löschen** items — copy the pattern from `apps/haex-calendar/app/pages/index.vue:193-240`.
- Add state: `const shareNotebookId = ref<string|null>(null)` + a `showShareDialog` computed (get/set) + `openShareDialog(id)`.
- Mount `<NotesShareDialog v-if="shareNotebookId" v-model:open="showShareDialog" :notebook-id="shareNotebookId" />`.
- Show a shared indicator (`Users` icon) on cards where `nb.spaceId` is set.

**Verify (manual):** notebook card menu shows Teilen; sharing shows the badge. **Commit:** `feat(haex-notes): notebook share menu and shared badge`

---

### Task 7: Per-page sharing

**Files:** `apps/haex-notes/app/components/notes/PagesSidebarItem.vue` (+ parent list/sidebar for state)

- Add a per-page overflow menu (`ShadcnDropdownMenu`) with **Seite teilen** → emits `share(page.id)`.
- In `PagesSidebar.vue` / `notebook/[id].vue`, handle `share` by opening a small space-picker (reuse the `NotesShareDialog` in a "single page" mode, or a lightweight variant) and call `spacesStore.sharePagesWithSpaceAsync(notebookId, [pageId], spaceId)`.
- Show a small shared dot on shared pages (derive from `getAssignmentsAsync(FULL_PAGES_TABLE)` loaded once into a `Set<pageId>`).

**Verify (manual):** share one page; only that page + the notebook row are assigned (`notebook.spaceId` stays null). **Commit:** `feat(haex-notes): per-page sharing`

---

### Task 8: Recipient read-only detection + author badge

**Files:** `apps/haex-notes/app/stores/notebook.ts` (or a small `useSharedContext` composable), `apps/haex-notes/app/components/notes/PageCanvas.vue`, notebook/page views.

**Step 1: Detect shared-in + author.** On loading a notebook, gather:
```ts
// assignments for this notebook + its pages
const nbAssign = await spacesStore.getNotebookAssignmentsAsync(notebookId);
const spaceId = nbAssign[0]?.spaceId;
let readOnly = false, authorLabel: string | null = null;
if (spaceId) {
  const members = await spacesStore.getMembersAsync(spaceId);
  const myDids = new Set(members.filter((m) => m.isSelf).map((m) => m.did));
  const author = nbAssign[0]?.authoredByDid ?? null;
  readOnly = !!author && !myDids.has(author);
  authorLabel = members.find((m) => m.did === author)?.label ?? (author ? author.slice(0, 16) + "…" : null);
}
```
Expose `readOnly` + `authorLabel` as reactive state for the open notebook.

**Step 2: Gate the canvas.** In `PageCanvas.vue` add `const props = defineProps<{ readOnly?: boolean }>()`. In `onPointerDown`, do NOT early-return at the very top — check the button/tool first and only gate the drawing/table-creation path (primary button) when `props.readOnly`; middle/right-button pan must still initialize. Gate the drawing/table branches of `onPointerMove`, `onPointerUp`, and the `contextmenu` handler the same way. **Keep** pan (middle/right button) and `onWheel` zoom fully available — viewing must still work. Pass `:read-only="readOnly"` from the page view. Hide pen/tool UI when read-only.

**Step 3: Badge.** Show "Geteilt · Nur lesen — von {authorLabel}" in the notebook header when `readOnly`.

**Verify (manual, two vaults / two members):** Member A shares a notebook; Member B opens it → badge shows "von A", drawing is blocked, pan/zoom work. **Commit:** `feat(haex-notes): read-only view and author badge for shared-in notebooks`

---

## Phase C — Import as editable copy

### Task 9: Deep-copy helper

**File (create):** `apps/haex-notes/app/utils/importPages.ts`

```ts
import type { SelectPage, InsertPage } from "~/database/schemas";

/** Build editable copies of pages for a target notebook (new ids, cloned JSON, appended page numbers). */
export function buildPageCopies(sourcePages: SelectPage[], targetNotebookId: string, startPageNumber: number): InsertPage[] {
  return sourcePages.map((p, i) => ({
    id: crypto.randomUUID(),
    notebookId: targetNotebookId,
    pageNumber: startPageNumber + i,
    template: p.template,
    strokes: JSON.parse(JSON.stringify(p.strokes)),
    tables: JSON.parse(JSON.stringify(p.tables)),
    backgroundImage: p.backgroundImage,
    thumbnail: p.thumbnail,
    orientation: p.orientation,
    deletedAt: null,
  }));
}
```
(`strokes`/`tables` are JSON columns — deep-clone as the codebase does in `notebook.ts` `saveCurrentPageAsync`.)

**Commit:** `feat(haex-notes): add page deep-copy helper for import`

---

### Task 10: Import flow (selection + target picker + insert)

**Files:** page-list selection UI (`PagesSidebar.vue` / `PagesSidebarItem.vue`), a new `app/components/notes/ImportDialog.vue`, and a store action.

**Step 1: Selection mode.** In a shared-in (read-only) notebook, add a "Seiten auswählen" mode: checkboxes on page items (`ShadcnCheckbox`) + "Alle auswählen". Track `selectedPageIds` in the notebook store.

**Step 2: Import action** (store):
```ts
async function importPagesAsync(sourcePageIds: string[], target: { notebookId: string } | { newName: string }) {
  const orm = haexVault.orm; if (!orm) return;
  const src = await orm.select().from(pages).where(inArray(pages.id, sourcePageIds));
  let targetId: string;
  if ("newName" in target) {
    targetId = crypto.randomUUID();
    await orm.insert(notebooks).values({ id: targetId, name: target.newName });
  } else {
    targetId = target.notebookId;
  }
  const [{ value: maxNum } = { value: 0 }] = await orm.select({ value: max(pages.pageNumber) }).from(pages).where(eq(pages.notebookId, targetId));
  const copies = buildPageCopies(src, targetId, (maxNum ?? 0) + 1);
  await orm.insert(pages).values(copies);   // NOT assigned to any space → private, editable
  return targetId;
}
```
(Copies get no `spaces.assignAsync` call → they stay local/editable and owned by the importer.)

**Step 3: ImportDialog** (`UiDrawerModal`): shows selected count, target picker (existing own notebook dropdown — exclude shared-in/read-only notebooks — or "Neues Notizbuch" with a name field). On confirm → `importPagesAsync` → navigate to the target notebook.

**Verify (manual):** In a shared-in notebook, select 2 pages → import into a new notebook → the copies open editable (drawing works); originals unchanged; the copies have no assignment (`getAssignmentsAsync` empty) so they're not read-only. **Commit:** `feat(haex-notes): import shared pages as editable copies`

---

## Verification (Phase B/C end-to-end, two members)

- **Share (A):** whole notebook → assignments for notebook + all pages (shared groupId), `authored_by_did` = A's space DID; `notebook.spaceId` set. New page → auto-assigned. Single page → only that page + notebook row; `spaceId` null. Unshare → assignments gone.
- **Receive (B):** shared notebook shows "Geteilt · Nur lesen — von A"; drawing blocked; pan/zoom work; only shared pages visible.
- **Import (B):** selected pages copied into B's own/new notebook as editable rows; originals untouched; copies unassigned.

## Non-goals

- Co-editing the same note in place (import-copy replaces it).
- Space create/join/invite (haex-vault).
- Sharing over pure P2P/QUIC spaces (online-space-only by design).
- Adding a test runner — verification is manual until vitest is introduced to haex-notes.
