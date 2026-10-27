---

description: "Task list for haex-puzzle"
---

# Tasks: haex-puzzle — a jigsaw puzzle from your own pictures

**Input**: Design documents from `specs/021-haex-puzzle/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. The repository's constitution requires a runnable check for every non-trivial logic module, in a separate test file beside it (`*.test.ts`, Vitest, `environment: node`). Browser-only modules (`pieceSprites.ts`, `pictureEncode.ts`, components) are validated by hand with [quickstart.md](quickstart.md) instead of mocks.

**Organization**: Tasks are grouped by user story. Paths are relative to the repository root; `APP` stands for `apps/haex-puzzle`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story of [spec.md](spec.md) (US1 … US6)

## Rules for every task

- Work in the worktree `.worktrees/haex-puzzle` on branch `feat/haex-puzzle`, never in the primary checkout.
- Before authoring a new named artifact (function, module, component, store, composable), run `graphify query "<intent>"` and evaluate what it returns; extend an existing artifact when one fits. The candidates already evaluated are in [research.md](research.md) R-15; do not repeat those queries.
- Comments, commit messages and file contents name no authoring tool or model. Commits follow Conventional Commits (`feat(haex-puzzle): …`).
- Keep each source file under 500 lines. Mark a deliberate corner cut with a `ponytail:` comment naming its ceiling and upgrade path.
- Match the surrounding code: `apps/haex-tetris` for app structure and components, `apps/haex-doom` for the database folder, vault store and blob handling.

## Phase 1: Setup (shared infrastructure)

**Purpose**: the empty app, buildable and listed by the release tooling.

- [ ] T001 Create `APP/package.json` from `apps/haex-tetris/package.json`: name `haex-puzzle`, version `0.1.0`, add the `db:generate` script (`drizzle-kit generate`) and the dependency `drizzle-orm` and dev dependency `drizzle-kit` at the versions `apps/haex-doom/package.json` uses; `@haex-space/vault-sdk` at `^4.9.0` as in `haex-doom`.
- [ ] T002 [P] Create `APP/nuxt.config.ts` from `apps/haex-tetris/nuxt.config.ts` with `devServer: { port: 4012 }`, and `APP/haextension.config.json` with dev port `4012`, `host` `localhost`, `build.distDir` `dist`.
- [ ] T003 [P] Create `APP/tsconfig.json`, `APP/eslint.config.mjs` (copies of the tetris files) and `APP/vitest.config.ts` (copy of `apps/haex-tetris/vitest.config.ts`: `~` and `@` aliases to `app`, `environment: node`, `include: ["app/**/*.test.ts"]`).
- [ ] T004 [P] Create `APP/drizzle.config.ts` as `apps/haex-doom/drizzle.config.ts` (schema `./app/database/schemas/index.ts`, out `./app/database/migrations`, dialect `sqlite`).
- [ ] T005 [P] Create `APP/haextension/manifest.json` and `APP/haextension/public.key`: `publicKey` is the one in `apps/haex-tetris/haextension/manifest.json` (and `public.key` is a copy of that file), `signature` empty, `migrationsDir` `database/migrations`, `permissions` `{ "database": [], "filesystem": [{ "target": "*", "operation": "read" }], "shell": [], "http": [] }` — read only, no write —, `icon` `haextension/haex-puzzle-logo.png`, `singleInstance` true, `displayMode` `auto`, `i18n` for `de` (name "Puzzle", description "Bilder als Puzzle zusammensetzen") and `en` (name "Puzzle", description "Put your pictures together as a jigsaw puzzle"), plus a top-level `description` in English.
- [ ] T006 [P] Create `APP/app/assets/css/tailwind.css` (copy of the tetris one, `--primary` in a neutral blue hue instead of green), `APP/app/app.vue` (`useHostLocale()` + `NuxtLayout`/`NuxtPage`), and `APP/app/composables/useHostLocale.ts` (copy of the tetris one with the log prefix `[haex-puzzle]`).
- [ ] T007 Add `"release:haex-puzzle": "node scripts/release.js haex-puzzle"` to the root `package.json` next to the other `release:*` scripts.
- [ ] T008 Run `pnpm install` so `pnpm-lock.yaml` gets the new workspace entry, then `(cd packages/haex-ui && npx nuxt prepare)` and `pnpm --filter haex-puzzle exec nuxt prepare`; confirm `node scripts/extensions.js` lists `haex-puzzle` and `pnpm --filter haex-puzzle build` succeeds with an empty page.
- [ ] T009 [P] Create the app icon `APP/haextension/haex-puzzle-logo.png` (square PNG, a jigsaw piece in the style of the other apps' logos, at most about 200 KB; the other logos are 1 MB+ and need not be matched).

**Checkpoint**: `pnpm --filter haex-puzzle build` passes; the app is listed by `scripts/extensions.js`.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: what every user story needs: the table in the vault, the vault connection, the shared types and the pure modules that more than one story uses.

**⚠️ CRITICAL**: no user story starts before this phase is done.

- [ ] T010 Define the table in `APP/app/database/schemas/index.ts`, as `apps/haex-doom/app/database/schemas/index.ts` does (`tableName` helper over `getTableName(manifest.publicKey, packageJson.name, name)`): table `pictures`, **not** `_no_sync`. Columns (verbatim from [data-model.md](data-model.md)): `id` text primary key; `content_hash` text not null **unique** (unique index); `name` text not null; `width` and `height` integer not null; `mime_type` text not null (`image/webp` or `image/jpeg`); `data` blob not null (at most 1 MiB); `thumbnail` blob not null; `added_at` text not null (ISO 8601 UTC). No update path exists for `data`.
- [ ] T011 Generate the migration with `pnpm --filter haex-puzzle db:generate` into `APP/app/database/migrations/` (the `0000_*.sql`, `meta/_journal.json` and the snapshot); check the SQL creates the table and the unique index on `content_hash` and nothing else.
- [ ] T012 [P] Create `APP/app/stores/haexvault.ts` from `apps/haex-doom/app/stores/haexvault.ts` (migrations loaded through `import.meta.glob("../database/migrations/*.sql", { query: "?raw", import: "default", eager: true })` and `registerMigrationsAsync`; `initializeAsync()`, `client`).
- [ ] T013 [P] Create `APP/app/types/puzzle.ts` with the types of [data-model.md](data-model.md): `DifficultyId` (`'easy' | 'medium' | 'hard' | 'expert'`), `Grid`, `Edge`/`Edges`, `Piece`, `Group`, `PuzzleState` (`phase` is `'playing' | 'complete'` only), `LibraryItem`, `Rejection` (`'unsupported' | 'too-large' | 'too-small' | 'storage-failed' | 'read-failed'`), `AddResult`, and `Rect`/`Point`/`View`.
- [ ] T014 [P] Write `APP/app/lib/difficulty.test.ts` first, then implement `APP/app/lib/difficulty.ts`: `DIFFICULTIES` (easy 12, medium 48, hard 108, expert 192 target pieces, `minPieceSide` 24 px), `availableDifficulties(width, height)` (a level is available when `sqrt(width × height / target) ≥ 24`) and `isTooSmall(width, height)` (true when not even Easy is available, i.e. below about 83 × 83 px). Tests: 100 × 100 offers only Easy; 2048 × 1536 offers all four; 82 × 82 is too small and 83 × 83 is not; monotonic (a level available implies all easier ones are).
- [ ] T015 [P] Write `APP/app/lib/zoomPan.test.ts` first, then implement `APP/app/lib/zoomPan.ts`: copy `fitView`, `zoomAt`, `panBy` and the `View`/`Size`/`Point` types from `apps/haex-notes/app/lib/zoomPan.ts` (and the matching tests from `zoomPan.test.ts` there), set `ZOOM_RANGE` to `{ below: 0.5, above: 6 }`, translate the comments to the language of the rest of this app (English), and add `clampView(view, box, content)` which keeps at least 25 % of the content's width and height inside the box. Tests: `zoomAt` keeps the anchor fixed and clamps to the range; `clampView` never lets the content leave the box entirely. This is the deliberate copy flagged in [plan.md](plan.md); leave a `ponytail:` comment naming the follow-up (hoist into `packages/haex-ui`).

**Checkpoint**: `pnpm --filter haex-puzzle test` passes; the vault store connects and runs the migration in the host.

---

## Phase 3: User Story 3 — Keep my pictures in a library (Priority: P1) 🎯

**Goal**: add pictures once, keep them permanently, list them as thumbnails, remove one or several for good.

**Why first among the P1 stories**: every puzzle starts from a library picture, so US1 and US2 build on this.

**Independent test**: add two pictures, close the extension, restart, reopen: both are there as thumbnails; select and remove one; reopen: gone; the original file is untouched ([spec.md](spec.md) US3, SC-009, SC-010; quickstart scenarios A, B, J–M).

### Tests for User Story 3

- [ ] T016 [P] [US3] Write `APP/app/lib/pictureBudget.test.ts`: `fitLongSide` never enlarges and keeps the aspect ratio; `nextAttempt` walks the quality ladder 0.88 → 0.78 → 0.68 → 0.58, then reduces the long side by a quarter and repeats, and is bounded (terminates with `too-large` after a fixed number of attempts for any start size, e.g. 100 000 × 100 000); the long-side maximum is 2048 and the byte budget 1 MiB (1 048 576 bytes).
- [ ] T017 [P] [US3] Write `APP/app/lib/pictureRows.test.ts`: the row mapper turns the array of column values the host returns, in the `SELECT` order of [contracts/library-store.md](contracts/library-store.md), into a `LibraryItem` and back; `contentHash` returns the same lowercase hex SHA-256 for the same bytes and differs for one changed byte (use the known SHA-256 of an empty input as a fixed vector).

### Implementation for User Story 3

- [ ] T018 [P] [US3] Implement `APP/app/lib/pictureBudget.ts`: constants `MAX_LONG_SIDE = 2048`, `MAX_BYTES = 1048576`, `THUMBNAIL_LONG_SIDE = 256`, `MAX_FILE_BYTES = 64 * 1024 * 1024`, `MAX_PIXELS = 100_000_000`; `fitLongSide(width, height, max)`, the quality ladder and `nextAttempt(size, attempt)` as specified in research R-2.
- [ ] T019 [P] [US3] Implement `APP/app/lib/pictureRows.ts`: the SQL strings of [contracts/library-store.md](contracts/library-store.md) as functions of the prefixed table name, the row ⇄ `LibraryItem` mapping (the only place that knows the column order) and `contentHash(bytes)` with `crypto.subtle.digest('SHA-256', …)`; leave a `ponytail:` comment that the hash is of the original file, so the same photo saved at two sizes is two pictures (research R-3).
- [ ] T020 [US3] Implement `APP/app/lib/pictureEncode.ts` (browser only): `encodePicture(bytes, name)` decodes with the orientation applied (`createImageBitmap(blob, { imageOrientation: 'from-image' })`, or an `Image` with `image-orientation: from-image` as `apps/haex-image/app/lib/image.ts` does), rejects `unsupported` when decoding fails and `too-large` above `MAX_PIXELS`, rejects `too-small` when `isTooSmall` (T014), draws on a canvas filled with a neutral background (so transparency leaves no holes), fits to `MAX_LONG_SIDE`, encodes WebP (JPEG when `toBlob` returns another type) following `nextAttempt` until the result is at most `MAX_BYTES`, and makes the 256 px thumbnail; returns `{ data, mimeType, width, height, thumbnail }`. Animated pictures use their first frame.
- [ ] T021 [US3] Implement `APP/app/stores/library.ts` (Pinia, shape of `apps/haex-doom/app/stores/saves.ts`) to the contract in [contracts/library-store.md](contracts/library-store.md): `items`, `loading`, `load()` (never selects `data`), `add(files)` (one `AddResult` per file in order; hash first and return the existing item with `duplicate: true` without writing; otherwise `encodePicture`, then one `INSERT … ON CONFLICT (content_hash) DO NOTHING` with binary values as `{ $bytes: arrayBufferToBase64(…) }`; a failing file never stops the others and leaves no partial row; a write failure is `storage-failed`), `open(id)` (reads `data`; rejects when the row is gone or the bytes are empty) and `remove(ids)` (one `DELETE … WHERE id IN (…)`, all-or-nothing; on rejection `items` is unchanged). No other function removes a picture.
- [ ] T022 [US3] Implement `APP/app/composables/usePictureImport.ts`: `addPictures()` opens the host's file selection with `client.filesystem.selectFile` (multiple files, as `apps/haex-image/app/pages/index.vue` `openFile` does, titled in the current locale), treats a cancelled selection as "nothing happened" (no message), refuses files above `MAX_FILE_BYTES` with `too-large` before reading, reads each with `client.filesystem.readFile` (a failure is `read-failed`), passes them to `library.add`, and returns the results so the page can show one summary toast for all rejected files (US3 scenario 8) — duplicates are not errors.
- [ ] T023 [P] [US3] Implement `APP/app/components/puzzle/LibraryGrid.vue`: a responsive grid of thumbnails (each `Uint8Array` turned into an object URL on mount and revoked on unmount and when the item is removed), the file name under each, an empty state with the "Add picture" action, a selection mode (a toggle button; tapping marks pictures; "Select all"; a "Remove" action that opens a confirmation from `ShadcnAlertDialog` naming the number of pictures, e.g. "Remove 2 pictures?") and an emitted `pick` event for starting a puzzle from one picture; an entry whose picture cannot be opened is shown as unusable and stays removable. German and English texts in an `<i18n lang="yaml">` block as in `apps/haex-tetris/app/pages/index.vue`.
- [ ] T024 [US3] Create `APP/app/pages/index.vue` as the start screen: loads the library through the vault store (`initializeAsync`) and `library.load()`, shows `LibraryGrid`, wires "Add picture" to `usePictureImport`, shows the removal result (on a rejected removal a message that names which pictures could not be removed, and they stay), and shows the empty state when the last picture is gone.
- [ ] T025 [P] [US3] Create `APP/app/lib/memoryLibrary.testing.ts`: an in-memory implementation of the library-store contract used only during development when the vault plugin is absent (`import.meta.dev`), so the table and the puzzle can be tried in a plain browser; wire it in `APP/app/stores/library.ts` behind that check, so it never ships in a release build.

**Checkpoint**: US3 works on its own: pictures can be added, listed, removed, survive a restart. Run quickstart scenarios A, B, J–M.

---

## Phase 4: User Story 2 — Choose how hard the puzzle is (Priority: P1)

**Goal**: choose one of four levels; the picture is gridded into about that many near-square pieces.

**Independent test**: open one picture at each level and count the cells; counts are within 10 % of 12 / 48 / 108 / 192 and near-square ([spec.md](spec.md) US2; quickstart scenarios H, I).

- [ ] T026 [P] [US2] Write `APP/app/lib/grid.test.ts` first: for aspect ratios from 1:10 to 10:1 (a sweep of at least 200 sizes) and every difficulty available at that size, `|columns × rows − target| ≤ 10 % × target` and the piece aspect ratio `(width / columns) / (height / rows)` lies within 1:1.6 (1/1.6 … 1.6); 4:3 at 12 gives 4 × 3; 10:1 at 12 gives 12 × 1; ties resolve to the product closest to the target.
- [ ] T027 [US2] Implement `APP/app/lib/grid.ts`: `chooseGrid(width, height, target): Grid` — among all `(columns, rows)` whose product is within ±10 % of `target`, take the one whose piece aspect ratio is closest to 1, ties to the product closest to `target` (research R-5); also returns `pieceWidth` and `pieceHeight` as `width / columns` and `height / rows`.
- [ ] T028 [P] [US2] Implement `APP/app/components/puzzle/DifficultyPicker.vue`: four options (Easy, Medium, Hard, Expert) each with its approximate piece count, built on `ShadcnRadioGroup` (or `ShadcnToggleGroup`); levels not in `availableDifficulties(width, height)` are disabled with the stated reason ("too small for this picture"); emits the chosen id. German and English texts.
- [ ] T029 [US2] Extend `APP/app/pages/index.vue`: picking a picture in the library opens the difficulty step (the picker plus a "Start" action) for that picture, defaulting to the easiest available level; "Start" hands picture id and level to the puzzle view of US1 (until US1 exists, show the grid size that `chooseGrid` returns).

**Checkpoint**: US2 works with US3. Run quickstart scenarios H and I.

---

## Phase 5: User Story 1 — Cut a picture into a puzzle and solve it with the mouse (Priority: P1) 🎯 MVP

**Goal**: the puzzle itself: jigsaw pieces on a table, drag with the mouse, snap to the frame, detect completion.

**Independent test**: with a picture in the library, start Easy, solve it with the mouse; the completion message appears after the last piece and no piece could be placed wrongly ([spec.md](spec.md) US1; quickstart scenarios C–F).

### Tests for User Story 1

- [ ] T030 [P] [US1] Write `APP/app/lib/random.test.ts`: `seededRandom(seed)` is deterministic per seed, different seeds differ, values are in `[0, 1)`; `shuffle(array, random)` returns a permutation, does not mutate its input, and over 5000 seeded shuffles of 6 items reaches all 720 permutations.
- [ ] T031 [P] [US1] Write `APP/app/lib/jigsaw.test.ts`: for several grids (including 1 × 12 and 12 × 1) every interior edge traced by the one piece equals the other piece's segment reversed, point for point; the outer sides of the picture are straight lines; over 1000 seeds the edges of one puzzle are not all equal (tab directions and shape parameters vary within their ranges); the pieces' cell boxes tile the picture exactly (sum of areas equals the picture area, no overlaps, 200 random sizes and grids — SC-005); no outline point lies farther than `OVERHANG` (0.28 × the shorter piece side) outside the piece's cell box.
- [ ] T032 [P] [US1] Write `APP/app/lib/scatter.test.ts`: for 1000 seeds and every difficulty on a 4:3, 1:1 and 3:1 picture, no piece's box overlaps the picture frame, every box lies inside the table, no piece is covered more than 35 % by another, and no piece starts at home (FR-008); the table is the frame grown by half the picture's size on every side.
- [ ] T033 [P] [US1] Write `APP/app/lib/stopwatch.test.ts` with an injected clock: `elapsed()` is 0 before `start()`; time before `pause()` counts and the paused span does not; `pause()` twice and `resume()` twice are harmless; `freeze()` stops it for good; the first `start()` is the first piece moved, later calls do nothing.
- [ ] T034 [P] [US1] Write `APP/app/lib/puzzleState.test.ts` (snap to the frame only; joining comes in US5): a release within `SNAP_FRACTION × side` (0.25) of home snaps the group exactly there and marks it placed, and at `0.25 × side + ε` it does not — for an interior, an edge and a corner piece; a placed group ignores `grab`; a release is clamped so at least one piece stays inside the table (FR-014); `complete` happens exactly when every piece is placed, once, and no state change is accepted afterwards; `restartSame` keeps picture and grid with a new scatter and a reset clock; invariants 2 and 5 of [data-model.md](data-model.md) hold after a seeded random sequence of moves (200 moves × 100 seeds).

### Implementation for User Story 1

- [ ] T035 [P] [US1] Implement `APP/app/lib/random.ts`: `seededRandom(seed): () => number` (a small seeded generator such as mulberry32) and `shuffle(array, random)` (Fisher–Yates on a copy).
- [ ] T036 [US1] Implement `APP/app/lib/jigsaw.ts` per research R-6 and [contracts/puzzle-engine.md](contracts/puzzle-engine.md): `makeEdges(grid, seed): Edges` (one edge per pair of neighbouring cells: a direction `1 | -1` and shape fractions `{ tab, neck, shoulder, lean }` each varied within a small range from the seed), `pieceOutline(grid, edges, column, row): PathCommand[]` (plain `move`/`line`/`curve` commands in piece-local coordinates, each shared edge defined once as a cubic Bézier and used reversed and mirrored by the other piece; straight outer sides) and `OVERHANG = 0.28` (× the shorter piece side). No canvas types in this module.
- [ ] T037 [US1] Implement `APP/app/lib/scatter.ts` per research R-10: `tableRect(width, height)` (the frame grown by half the picture's size on every side) and `scatter(grid, random)` (the ring around the frame divided into piece-sized slots, at least `3 × N`; Fisher–Yates picks `N` slots; each piece is offset by at most 0.2 × its side inside its slot).
- [ ] T038 [P] [US1] Implement `APP/app/lib/stopwatch.ts`: `createStopwatch(now = () => performance.now())` with `start()`, `pause()`, `resume()`, `elapsed()`, `freeze()` as specified in T033.
- [ ] T039 [US1] Implement `APP/app/lib/puzzleState.ts` (pure): `start(pictureId, width, height, difficulty, random)` (grid via `chooseGrid`, edges, scatter; every piece its own group, none placed, `phase` `playing`), `grab(state, groupId)` (raises `z`, ignored for a placed group), `release(state, groupId, dx, dy)` (apply the move, clamp into the table, snap to home within `SNAP_FRACTION × side` of any piece of the group, then mark placed), `isComplete`, `restartSame`. Joining of neighbours is added in US5; leave the release function structured so it can slot in.
- [ ] T040 [US1] Implement `APP/app/lib/pieceSprites.ts` (browser only): `makeSprites(image, grid, edges)` renders each piece once to an offscreen canvas at the stored picture's own resolution with a margin of `OVERHANG`: clip with the outline (`Path2D` built from `PathCommand[]`), draw the piece's region of the picture, stroke a thin dark and a thin light outline for relief; returns the sprites plus `hitTest(piece, localPoint)` using `isPointInPath` on the piece's own path (research R-7).
- [ ] T041 [US1] Implement `APP/app/composables/usePuzzle.ts`: reactive wrapper around `puzzleState` (`start` from a library item via `library.open(id)`, decoded to an `ImageBitmap`/`HTMLImageElement`; a picture that cannot be decoded gives the "unusable" error and returns to the start screen), the stopwatch (started on the first `grab`, frozen at completion), and `restartSame`; uses `crypto.getRandomValues` for the randomness source.
- [ ] T042 [US1] Implement `APP/app/components/puzzle/PuzzleTable.vue`: one `<canvas>` that fits the table into its container with `fitView` (T015) and redraws on `requestAnimationFrame` (coalesced; only when something changed): background and frame outline from the theme's CSS variables, placed groups, loose groups by `z` with the dragged one last; when the puzzle is complete it draws the finished picture without outlines. Leave a `ponytail:` comment: the whole canvas is redrawn per frame, fine to about 500 pieces (research R-7). Keep the file under 500 lines by putting pointer handling in T043.
- [ ] T043 [US1] Implement `APP/app/composables/usePuzzleInput.ts` (Pointer Events, mouse path first): `pointerdown` on a loose piece (topmost first, via `hitTest`) calls `grab`, `setPointerCapture`, `pointermove` moves the group in picture space (divide by the view scale), `pointerup`/`pointercancel` calls `release`; `touch-action: none` on the canvas; a piece dropped where several overlap stays on top.
- [ ] T044 [P] [US1] Implement `APP/app/components/puzzle/PuzzleHud.vue`: a "New puzzle" button that opens an `ShadcnAlertDialog` confirming that progress is lost (FR-017) and emits `leave`; in a later phase it gains the timer and preview toggle.
- [ ] T045 [P] [US1] Implement `APP/app/components/puzzle/CompleteDialog.vue`: shown at `complete` with the finished picture, "Solved!" and the elapsed time formatted `m:ss` (or `h:mm:ss`), the actions "Play again" (same picture, same level, new shuffle — `restartSame`) and "New puzzle". German and English texts.
- [ ] T046 [US1] Wire the puzzle view into `APP/app/pages/index.vue`: start screen ⇄ table; "Start" (US2) opens the table with the chosen picture and level, `PuzzleHud` leaves with confirmation, `CompleteDialog` offers the two actions; keep the library loaded when returning.

**Checkpoint**: US1 + US2 + US3 are the MVP: add a picture, choose a level, solve it with the mouse. Run quickstart scenarios C–F and the automated tests.

---

## Phase 6: User Story 4 — Solve the puzzle on a touch device (Priority: P2)

**Goal**: the same puzzle by finger, with two-finger zoom and pan, without the page scrolling or zooming underneath.

**Independent test**: on a phone with no mouse or keyboard, solve an Easy puzzle by touch only; rotate the device mid-puzzle ([spec.md](spec.md) US4; quickstart scenarios N, O).

- [ ] T047 [US4] Extend `APP/app/composables/usePuzzleInput.ts` with the view gestures of research R-8: one pointer on empty table pans (`panBy`), the wheel zooms anchored at the pointer (`zoomAt`), two pointers pinch-zoom anchored at their midpoint and pan with their movement; a second finger landing during a piece drag releases the piece first; every change goes through `clampView` (T015).
- [ ] T048 [US4] In `APP/app/components/puzzle/PuzzleTable.vue` refit the view with a `ResizeObserver` when the container or the device orientation changes, keeping the user's zoom factor relative to the fit and the centre of what they were looking at; positions are stored in picture space so no piece moves relative to the picture (FR-019). Add a "Fit" button (in `PuzzleHud.vue`) that resets the view.
- [ ] T049 [P] [US4] Prevent page scroll, zoom and pull-to-refresh while the table is touched: `touch-action: none`, `overscroll-behavior: none` and `user-select: none` on the table and its container in `APP/app/components/puzzle/PuzzleTable.vue` and in `APP/app/assets/css/tailwind.css`; check `APP/app/app.vue`/the host frame leave `meta viewport` handling to the host (as `apps/haex-tetris` does) and note the result in a code comment only if something had to be added.
- [ ] T050 [US4] Make the start screen and HUD usable at 400 px width: `APP/app/components/puzzle/LibraryGrid.vue` (2-column thumbnails, selection actions reachable by thumb), `DifficultyPicker.vue` and `PuzzleHud.vue` (controls at least 44 px high, in a bar that does not cover the table). Verify with browser dev tools at 400 × 800 and 800 × 400, then on a real touch device per quickstart scenario N.

**Checkpoint**: US4 works with the earlier stories.

---

## Phase 7: User Story 5 — Connected pieces move together (Priority: P2)

**Goal**: neighbours that fit join into a group that moves as one and snaps to the frame as one.

**Independent test**: in a Medium puzzle, put two neighbouring pieces next to each other away from their place; they join and move together; two non-neighbours touching never join ([spec.md](spec.md) US5; quickstart scenario G).

- [ ] T051 [US5] Extend `APP/app/lib/puzzleState.test.ts` first: two neighbours released within `SNAP_FRACTION × side` (0.25) of their home offset join into one group and keep their relative offset exactly (the released group moves by the error); non-neighbours touching never join; a group released near home snaps as a whole and becomes placed; joining a placed group places the joiner; a join across several groups merges them all; invariants 1–5 of [data-model.md](data-model.md) hold after a seeded random sequence of moves (200 moves × 100 seeds) with joins on; `complete` still happens exactly once.
- [ ] T052 [US5] Extend `release` in `APP/app/lib/puzzleState.ts` per research R-9: after the snap-to-home check, for every piece of the released group and every grid neighbour not in the same group, join the two groups when the neighbour's actual offset is within `SNAP_FRACTION × side` of its home offset (move the released group by that error so the join is exact); a group that joins a placed group becomes placed; the group's `pieceIds` and `z` stay consistent. Only one tolerance constant, shared with the snap-to-home rule.
- [ ] T053 [US5] Update `APP/app/lib/pieceSprites.ts`/`APP/app/components/puzzle/PuzzleTable.vue` so joined pieces draw without the outline on their shared edges (outline only the group's outer contour) and `APP/app/composables/usePuzzleInput.ts` so grabbing any piece of a group moves the whole group; hit-testing walks groups by `z` and tests each piece of the group.

**Checkpoint**: US5 works; the fuzz test of T051 is green.

---

## Phase 8: User Story 6 — Look at the picture and track my time (Priority: P3)

**Goal**: preview of the finished picture; the timer is visible and pauses when the extension is not.

**Independent test**: start a puzzle, toggle the preview on and off, leave the window for ten seconds and return; the timer shows only the time spent in the extension ([spec.md](spec.md) US6; quickstart scenario Q).

- [ ] T054 [US6] Add the visible timer to `APP/app/components/puzzle/PuzzleHud.vue` (`m:ss`, updated once a second from `stopwatch.elapsed()` while playing; frozen at completion).
- [ ] T055 [US6] Pause the stopwatch while the extension is not visible or has no focus, in `APP/app/composables/usePuzzle.ts`: `window` `blur` and `document.visibilitychange` call `pause()`, `focus` and becoming visible call `resume()` (the pattern of `pauseWhilePlaying` in `apps/haex-tetris/app/pages/index.vue`); remove the listeners on unmount.
- [ ] T056 [P] [US6] Add the preview: a toggle in `APP/app/components/puzzle/PuzzleHud.vue` showing a small non-interactive image of the complete picture (from the same decoded image, in a corner overlay that does not capture pointer events and does not hide the table's centre); toggled off it disappears. German and English texts.

**Checkpoint**: all six user stories work.

---

## Phase 9: Polish & cross-cutting concerns

- [ ] T057 [P] Review every user-visible text in German and English (start screen, library, dialogs, toasts, HUD, completion) for consistent wording; make sure a theme or language switch while a puzzle is running only redraws (the puzzle state is untouched, FR-020, SC-008): in `APP/app/components/puzzle/PuzzleTable.vue` redraw on theme change without recreating the puzzle.
- [ ] T058 [P] Accessibility pass: every button has a text or `aria-label`, dialogs trap focus (they are `ShadcnAlertDialog`), thumbnails are buttons with the file name as label, colour contrast of the frame outline and piece relief in light and dark.
- [ ] T059 Check file sizes (`wc -l APP/app/**/*.{ts,vue}`): none over 500 lines; split by concern only where one clearly is. Check every `ponytail:` comment names its ceiling and upgrade path (R-3, R-7, zoomPan copy).
- [ ] T060 Run `pnpm --filter haex-puzzle test`, `pnpm --filter haex-puzzle exec eslint .` and `pnpm --filter haex-puzzle build`; fix everything they report.
- [ ] T061 Walk through all scenarios A–R of [quickstart.md](quickstart.md) in a running host (`pnpm --filter haex-puzzle ext:dev`) including a real phone for N and O, a 200-picture library for R, and a 24 MP photo for the 3-second target (SC-003); record any deviation as a fix, or as a spec assumption to revisit (piece counts, snap tolerance).
- [ ] T062 [P] If `README.md` lists the apps, add one line for haex-puzzle in the same style; do not add one otherwise.
- [ ] T063 Run `/speckit-analyze` for a cross-artifact consistency check against the constitution before opening the pull request; open the PR from `feat/haex-puzzle` to `main` with a Conventional Commit title (`feat(haex-puzzle): add a jigsaw puzzle extension with a picture library`).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. T001 first; T002–T006, T009 parallel after it; T007 independent; T008 after T001–T007.
- **Foundational (Phase 2)**: after Setup. T010 → T011; T012, T013, T014, T015 parallel with them. **Blocks all stories.**
- **US3 (Phase 3)**: after Foundational (needs T010–T014).
- **US2 (Phase 4)**: after Foundational; its UI joins the start screen of US3 (T029 needs T024).
- **US1 (Phase 5)**: after US2 and US3 for the start-to-table flow (T046 needs T029); its pure modules (T030–T039) need only Foundational and can start earlier.
- **US4 (Phase 6)**: after US1.
- **US5 (Phase 7)**: after US1 (extends `puzzleState`); independent of US4.
- **US6 (Phase 8)**: after US1; independent of US4 and US5.
- **Polish (Phase 9)**: after all wanted stories.

### Within each story

Tests are written first and fail before the implementation (T016/T017 → T018/T019; T026 → T027; T030–T034 → T035–T039; T051 → T052). Pure modules before browser modules before components before page wiring.

### Parallel opportunities

- Phase 1: T002, T003, T004, T005, T006, T009 together after T001.
- Phase 2: T012, T013, T014, T015 together (T010 → T011 in sequence beside them).
- US3: T016, T017 together; T018, T019 together; T023 and T025 beside T022.
- US1: T030–T034 (all tests) together; T035, T038 together; T044, T045 beside T041–T043.
- US4, US5 and US6 can be developed in parallel by different people once US1 is done.

### Parallel example: User Story 1 tests

```text
Task: "Write APP/app/lib/random.test.ts"        (T030)
Task: "Write APP/app/lib/jigsaw.test.ts"        (T031)
Task: "Write APP/app/lib/scatter.test.ts"       (T032)
Task: "Write APP/app/lib/stopwatch.test.ts"     (T033)
Task: "Write APP/app/lib/puzzleState.test.ts"   (T034)
```

## Implementation Strategy

### MVP first

The MVP is the three P1 stories, built in this order: **Setup → Foundational → US3 (library) → US2 (difficulty) → US1 (puzzle)**. Stop and validate at that point (quickstart A–F, H–M): a user can add a picture, keep it, choose a level and solve the puzzle with the mouse. The library comes first because a puzzle always starts from a library picture.

### Incremental delivery

1. After the MVP: US4 (touch), the biggest practical gain for phone users.
2. Then US5 (groups), which makes 100+ piece puzzles pleasant.
3. Then US6 (preview and timer).
4. Polish and the full quickstart walk-through, then the pull request.

### Notes

- Every task names a file; a task is done when its tests (where listed) pass and, for browser modules and components, its quickstart scenario behaves as stated.
- Commit after each task or logical group with a Conventional Commit message (`feat(haex-puzzle): …`, `test(haex-puzzle): …`, `chore(haex-puzzle): …`).
- Binary values go over the host bridge as `{ $bytes: <base64> }`; rows come back as arrays of column values in `SELECT` order — the row mapper (T019) is the only place that knows the order.
