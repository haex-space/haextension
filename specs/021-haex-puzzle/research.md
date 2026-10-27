# Research: haex-puzzle

Phase 0 of [plan.md](plan.md). Every open point of the spec's Assumptions (storage, limits, sync, piece counts) is settled here. Paths are relative to the repository root.

## R-1 Where the library keeps its pictures

- **Decision**: In a table of the extension's own vault schema, one row per picture, with the picture's bytes in a `blob` column next to a small thumbnail blob and the metadata. The row is written and deleted by a single SQL statement, so adding and removing a picture is atomic (FR-026, FR-027). Access goes through the SDK's raw `client.database.query/execute`, with binary values sent as `{ $bytes: <base64> }`, exactly as `apps/haex-doom/app/stores/saves.ts` does for its save games.
- **Rationale**: The vault database is what the host keeps with the vault and shares between devices; a picture stored there is "in the vault" as the spec's Assumptions require, needs no file permission to write, and cannot be lost by the user moving a folder. A picture is re-encoded to at most 1 MiB (R-2), which is the size `haex-doom` already moves through the bridge in one piece (`CHUNK_SIZE` in `apps/haex-doom/app/stores/games.ts`), so no chunking is needed and the 100 MB per-transaction limit named in `apps/haex-notes/app/composables/useAssetStore.ts` is never near.
- **Alternatives considered**:
  - *Files on the host filesystem, with only metadata in the database* (the approach of `haex-notes`' asset store): needs write access to the user's files (the spec grants read only), the files can be moved or deleted outside the extension, and whether they reach other devices is the host's setting, not the extension's. Rejected: it cannot promise "permanently available" (FR-023).
  - *Chunked blobs like the imported games of `haex-doom`*: needed only for files far above 1 MiB. Not needed once pictures are bounded.
  - *The SDK's device-local `storage` (strings, 1 MiB per value)*: one entry per picture would work, but it has no query, no sync, and cannot list thumbnails cheaply. Rejected.
  - *Drizzle's `orm` handle (as `haex-draw` uses for JSON/text columns)*: `haex-doom` is the only app proven with `blob` columns, and it uses the raw client. Drizzle is still used to generate the migration from the schema file (`drizzle-kit generate`), as in `haex-doom`.

## R-2 Bounding a picture's size

- **Decision**: On adding, the picture is decoded with its orientation applied, drawn on a canvas filled with a neutral background (so transparency never leaves holes), reduced so its longer side is at most **2048 px**, and encoded as **WebP** (JPEG where the web view cannot encode WebP). Encoding starts at quality 0.88 and steps down (0.78, 0.68, 0.58) until the result is at most **1 MiB**; if it still is not, the long side is reduced by a quarter and the steps repeat. The stored copy is the one puzzles are cut from. A **thumbnail** (long side 256 px, WebP 0.8, typically 8–25 KB) is stored beside it.
- **Rationale**: A 2048 px picture cut into 192 pieces gives pieces of about 150 px, sharp on every phone screen and at 3× zoom, so a larger copy buys nothing. The bound makes SC-003 (24 MP photos ready in 3 s) a matter of one decode and one downscale, and makes row size, library size and sync traffic predictable. FR-022 (orientation) is met by decoding with `image-orientation: from-image`, as `haex-image` does in `apps/haex-image/app/lib/image.ts`.
- **Limits at the door**: a selected file larger than **64 MiB** (as `MAX_FILE_SIZE` in `haex-doom`) or decoding to more than **100 megapixels** is refused with "too large", because reading it could exhaust a phone's memory. A picture too small for even the Easy level (R-5) is refused with "too small".
- **Alternatives considered**: Keeping the original bytes (unbounded rows, slow puzzle start, large sync); a lossless PNG copy (several MiB per photo). Rejected.

## R-3 Duplicates

- **Decision**: A row's **primary key is the lowercase hex SHA-256 of the original file's bytes**; there is no separate hash column and no other unique index. Adding a file whose hash is already stored returns the existing entry without writing (`INSERT … ON CONFLICT (id) DO NOTHING`, FR-026).
- **Why the key, not a unique column**: the table is synced (R-4). With random ids and a unique index on the hash, two devices adding the same file offline would produce two different rows that violate the index when they meet. With the hash as key they are one row, as the save games of `haex-doom` are one row per `<fingerprint>:<slot>` on every device.
- **Rationale**: Hashing the original needs no decode and catches the realistic case: the same file added twice. Hashing the re-encoded copy would not, because encoders are not guaranteed to be deterministic.
- **Ceiling** (marked with a `ponytail:` comment in code): the same photo saved at two different sizes counts as two pictures. A perceptual hash would catch it; not worth the code.

## R-4 Sync between devices

- **Decision**: The library table is **synced** (no `_no_sync` suffix in its name), so a picture added on one device shows up on the user's other devices. The thumbnail and the picture live in the **same row**, and listing selects only the metadata and thumbnail columns, never the picture blob.
- **Rationale**: The user asked for pictures that stay available; being available on every device of the vault is the natural reading, and each row is at most ~1 MiB so a sync never needs to move anything large. Putting both blobs in one row means a sync conflict or a failed write never leaves a thumbnail without a picture. `haex-doom` sets the precedent in the other direction (`_no_sync` for its 30 MB copyrighted game files, synced for small saves); the reasons for `_no_sync` there (size, copyright) do not apply to pictures the user owns.
- **Consequence for the spec**: A picture removed on one device is removed on the others once they sync; the spec's "closed and opened again" scenarios hold per device. The spec's Assumptions state this (Library storage).
- **No size cap on the library**: each row is at most 1 MiB (R-2), a typical photo copy 300–600 KB, so 200 pictures are usually 60–120 MB and at worst 200 MiB. The extension sets no count limit of its own beyond the vault's room, because a limit would be arbitrary and the per-picture bound already keeps every row small. This is a deliberate choice, measured with a 200-picture library in the final walk-through (tasks.md T061, quickstart scenario R) and revisited if the sync proves slow.
- **Alternatives considered**: Device-local only (`_no_sync`): simpler, but "permanently available" would stop at the device's edge, and a lost phone would lose the library. Rejected.

## R-5 Difficulty levels and piece counts

- **Decision**: Easy **12**, Medium **48**, Hard **108**, Expert **192** target pieces (the spec's starting values). A level is **available** for a picture when the resulting piece's side, measured in the stored picture's pixels, is at least **24 px** (`sqrt(width × height / target) ≥ 24`). A picture on which not even Easy is available (smaller than about 84 × 84 px) is refused as too small.
- **Grid**: for a target count N and picture width W, height H, the grid `(columns, rows)` is chosen among all pairs whose product is within ±10 % of N (FR-003) by taking the one whose piece aspect ratio `(W/columns) / (H/rows)` is closest to 1 (FR-006). Ties go to the product closest to N. A property test over aspect ratios from 1:10 to 10:1 asserts the count bound and that the piece aspect ratio stays within 1:1.5 for pictures between 1:4 and 4:1 and within 1:2 overall (the worst case, a 1:5.8 picture at 12 pieces, is 1:1.9: no grid within ±10 % is squarer).
- **Rationale**: A fixed target with a tolerance is what FR-003 states; searching all pairs, not rounding `sqrt(N × aspect)`, avoids counts like 16 for a target of 12 on a 5:1 picture. The 24 px floor keeps the smallest pieces graspable on a 4-inch screen at 1× zoom after the table is shrunk to fit.
- **Alternatives considered**: Fixed grids such as 4×3 / 8×6 (ignores the picture's shape, distorts pieces); letting the user type a number (the spec asks for levels).

## R-6 Piece geometry

- **Decision**: Pure functions in `app/lib/jigsaw.ts` produce, from a seed, the **edge** between every pair of neighbouring cells: a direction (tab out of the one piece or the other) and shape parameters (tab size, neck width, position along the edge, each varied within a small range), so pieces differ (FR-005). An edge is defined **once**, as a cubic Bézier curve from corner to corner; the piece on the other side uses it reversed and mirrored. Because both pieces draw the same curve, they interlock exactly and the pieces tile the picture with no gap and no overlap (FR-004, SC-005). Edge cells get a straight line on their outer sides. The piece's outline is a `Path2D` in piece-local coordinates; the same path is used to clip the sprite, to stroke the outline, and to hit-test a pointer.
- **Rationale**: Sharing one curve is the only way to make "interlock exactly" true by construction instead of by tolerance, and it is testable without a canvas: for every interior edge, the path the left piece traces equals the reverse of the path the right piece traces.
- **Tab depth** is at most 0.28 × the shorter piece side, so a piece's sprite needs a margin ("overhang") of that size on every side; this margin is a constant shared by geometry and rendering.
- **Alternatives considered**: Precomputed SVG shape images (fixed outlines, cannot vary); a library for jigsaw shapes (extra dependency for ~120 lines, and none is already installed in the repo).

## R-7 Rendering and hit-testing

- **Decision**: One `<canvas>` for the table. At the start, every piece is rendered once to an offscreen **sprite** at the stored picture's own resolution: clip with the piece path, draw its region of the picture, stroke a thin dark and a thin light outline for relief. A frame draws, in order: table background, frame outline of the picture, the placed groups, the loose groups (the one being dragged last), using `drawImage` of the sprites under the view transform. Pointer hit-testing walks the loose groups from the topmost down and uses `isPointInPath` on the piece's `Path2D` in piece-local coordinates, so clicks on a notch fall through to the piece below. When the puzzle is complete, the finished picture is drawn directly, without outlines.
- **Rationale**: A canvas redraw of at most 192 sprites per pointer move is well inside a 16 ms frame, and avoids an SVG with 192 clipped images. Sprites at source resolution cost at most ~30 MB at Expert and ~25 MB at Easy (the larger pieces are fewer), and never need re-rendering on zoom; the browser's image smoothing downscales them. Only changed state triggers a redraw (`requestAnimationFrame`, coalesced), so an idle table costs nothing.
- **Ceiling** (`ponytail:` comment): the whole canvas is redrawn per frame, with no dirty rectangles; fine to ~500 pieces, which the levels never reach.
- **Alternatives considered**: SVG per piece with `clip-path` (DOM cost, harder hit-testing and 192 `image` nodes); WebGL (overkill).

## R-8 Input: drag, pan, zoom

- **Decision**: **Pointer Events** only (mouse, touch and pen in one code path), with `setPointerCapture` and `touch-action: none` on the canvas. One pointer on a piece drags its group; one pointer on empty table pans the view; the wheel and a two-finger pinch zoom (anchored at the pointers) and a two-finger move pans. View math (`fitView`, `zoomAt`, `panBy`) is a small pure module. The view is clamped so the table can never leave the viewport entirely.
- **Reuse decision**: `apps/haex-notes/app/lib/zoomPan.ts` already holds this math (and `zoomPan.test.ts` its tests). Apps in this repository are separate packages that do not import from each other, and hoisting it into `packages/haex-ui` would change `haex-notes` — outside this feature. The plan therefore **copies** the 40 lines into `apps/haex-puzzle/app/lib/zoomPan.ts` with the zoom range changed (0.5× to 6×), and lists "hoist `zoomPan.ts` into the shared package" as a follow-up. **This is flagged for the reviewer at the plan's gate** (see plan.md, Constitution Check): it is the one place where the plan consciously duplicates instead of extending.
- **Alternatives considered**: Separate mouse and touch handlers (two code paths, known double-fire bugs); a gesture library (new dependency for two gestures).

## R-9 Placing, snapping and joining pieces

- **Decision** (`app/lib/puzzleState.ts`, pure): State is the pieces' positions plus a union-find of **groups**. All positions are in the stored picture's pixel space; a piece's *home* is its cell's origin. A group is *placed* when its pieces sit exactly at their homes. On release:
  1. If any piece of the dragged group is within **0.25 × piece side** of its home, the whole group snaps so that piece is at home, and the group becomes placed (a group can only be consistent with the frame, because its pieces keep their relative offsets).
  2. Otherwise, for every piece of the group and every grid neighbour of it that is not in the same group, if the neighbour's actual offset from this piece is within **0.25 × piece side** of its home offset, the two groups join and the dragged group moves by that error so the join is exact.
  3. A group that joins a placed group is placed as well.
  Placed groups are not hit-tested, so they cannot be dragged by accident (FR-011).
- **Release position**: clamped so that at least one piece of the group stays inside the table (FR-014). The table, not the current viewport, is the limit: when zoomed in, the user pans to a piece that lies off-screen. The topmost piece at a point is the one hit-tested first, and a piece under others becomes reachable by moving what lies on top, which is itself always reachable.
- **Completion**: all pieces belong to one placed group (equivalently, every piece is placed). The state machine is `idle → playing → complete`.
- **Rationale**: Snapping to the frame and joining by neighbour share one distance rule and one tolerance, so SC-006 is two inequalities that a table of tests can pin down on both sides of the threshold.
- **Alternatives considered**: Snapping only to the frame (fails US5); snapping per piece rather than per group (a group would stop being rigid).

## R-10 Starting layout

- **Decision** (`app/lib/scatter.ts`, pure, given a random source): The table is the picture frame grown by half the picture's size on every side (so four times the area). The ring around the frame is divided into piece-sized slots; there are at least `3 × N` of them. The pieces are assigned to a random sample of `N` slots by a Fisher–Yates shuffle, and each is moved by a random offset of at most 0.2 × the piece side inside its slot. No piece starts at home (the frame is not in the ring), and no piece is covered by another more than ~35 % (FR-008). The randomness source is injected, so tests use a seeded one and the app uses `crypto.getRandomValues`.
- **Rationale**: Slots make "never hidden" a property of the layout, not something to check afterwards. A seeded test can assert it for thousands of seeds in milliseconds.
- **Alternatives considered**: Pure random positions with rejection sampling (unbounded time, no guarantee).

## R-11 Timer

- **Decision** (`app/lib/stopwatch.ts`, pure, with an injected clock): accumulates elapsed time; `pause()` and `resume()` are driven by `visibilitychange` and window `blur`/`focus` in the same way `apps/haex-tetris/app/pages/index.vue` pauses its game. It starts with the first piece moved, not with the layout, so time spent looking at the table is free.
- **Rationale**: FR-016 asks for pause when not visible; an injected clock makes the pause arithmetic testable without real time.

## R-12 Manifest permissions and packaging

- **Decision**: `permissions.filesystem` is `[{ "target": "*", "operation": "read" }]` (as in `apps/haex-image`, for the host's file selection and `readFile`), **no write**; `permissions.database` is `[]` (the extension's own prefixed tables need no grant, as in `haex-doom`); `shell`, `http`, `peers` absent. `migrationsDir` is `database/migrations`, registered through `client.registerMigrationsAsync` the way `apps/haex-doom/app/stores/haexvault.ts` does. The public key, signing and release flow are the other apps': the manifest carries the repository's shared `publicKey`, the table prefix derives from it, and `scripts/extensions.js` picks the app up as soon as `haextension/manifest.json` exists. A `release:haex-puzzle` script is added to the root `package.json`.
- **Rationale**: The smallest permission set that serves FR-001 and FR-021; no write grant means the extension cannot modify or delete the user's originals even by mistake.
- **Dev port**: 4012 (4000 and 4003–4011 are taken by the other apps).

## R-13 Language, locale, theme

- **Decision**: As `haex-tetris`: `@nuxtjs/i18n` with inline `<i18n lang="yaml">` blocks, default `de`, `en` second; `useHostLocale` follows the host's locale; the theme follows the host through the shared `haex-ui` layer and the `color-mode` module. The puzzle table's own colours (background, frame line) come from the theme's CSS variables, so a theme switch redraws the table but never resets the puzzle (SC-008).

## R-14 Testing

- **Decision**: Vitest in `node` environment, test files beside the modules (`*.test.ts`), exactly as `haex-tetris` and `haex-doom` configure it. All logic is in `app/lib` and runs without a browser: geometry, grid choice, scatter, snapping and joining, stopwatch, zoom/pan, size-budget decisions, the SQL row mapping, and the library behaviour (`createLibrary` over an in-memory backend, and the SQL layer over a fake `database` client — a fake at the vault boundary, not a mock of the library's own logic). The canvas rendering and the two image-pipeline steps that need a browser (decode, encode) are covered by the manual validation in [quickstart.md](quickstart.md), not by mocks that would only test the mock.
- **Constitution fit**: tests in separate files; one runnable check at least for every non-trivial logic module.

## R-15 Reuse check (graphify, per the repository constitution)

Queries run before planning artefacts that will become code: *decode, downscale and re-encode an image*, *stopwatch with pause on visibility*, *seeded shuffle*, *pointer drag, pinch, zoom and pan on a canvas*.

| Intent | Candidate found | Decision |
|--------|-----------------|----------|
| Decode, downscale, encode a picture | `makeWorkingCopyAsync` / `jpegBytesAsync` in `apps/haex-notes/app/lib/paperNotes/workingCopy.ts`; `decodeImage` / `canvasToBlob` in `apps/haex-image/app/lib/image.ts` | Independent: the notes version rotates, stretches levels for paper and writes JPEG, and neither app is importable from another. Write a small `pictureEncode.ts` here (decode with orientation, fit to 2048 px, encode under a byte budget). |
| Zoom and pan math | `fitView`, `zoomAt`, `panBy` in `apps/haex-notes/app/lib/zoomPan.ts` | Near-identical. Copy now, hoist later — **needs the reviewer's decision**, see R-8. |
| Pause on visibility | `pauseWhilePlaying` in `apps/haex-tetris/app/pages/index.vue` | A page-level handler, not a reusable module. Reuse the *pattern*; the stopwatch arithmetic is new. |
| Seeded or shuffled randomness | `shuffleBag` in `apps/haex-tetris/app/composables/useTetris.ts`, `seededRandom` in `apps/haex-draw/app/utils/canvas/strokeHelpers.ts` | Independent of one another and of this need (piece bags, stroke jitter). A seeded generator of a few lines is written here and exercised by tests. |
| Blob columns over the bridge | `useSavesStore` in `apps/haex-doom/app/stores/saves.ts` | Same technique; copied as a pattern, with this feature's own table. |
