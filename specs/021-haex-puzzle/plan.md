# Implementation Plan: haex-puzzle — a jigsaw puzzle from your own pictures

**Branch**: `feat/haex-puzzle` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/021-haex-puzzle/spec.md`

## Summary

A new haextension app, `apps/haex-puzzle`, in which the user adds pictures to a **permanent library** in their vault, picks one and one of four difficulties, and rebuilds it from **jigsaw-shaped pieces** by dragging them on a table. The app follows `haex-tetris` (Nuxt 4 static app, i18n de/en, host locale and theme, Vitest in `app/lib`) and `haex-image` (the host's file selection through `client.filesystem`).

Approach, in the order the research settles it ([research.md](research.md)):

- **Library**: one synced vault table (`pictures`) holding, per picture, a re-encoded copy (≤ 2048 px long side, ≤ 1 MiB, WebP/JPEG), a 256 px thumbnail, the SHA-256 of the original file for duplicate detection, and metadata. One statement per add and per removal keeps rows whole. The list query never reads the picture blobs. Because pictures sync with the vault, a picture added or removed on one device follows to the user's others.
- **Pieces**: edges between neighbouring cells are generated once from a seed and shared (mirrored) by both pieces, so they interlock by construction; each piece is a pre-rendered sprite on one canvas, hit-tested with its own outline.
- **Play**: Pointer Events for mouse, touch and pen; group-aware snapping and joining with one tolerance (a quarter of the piece side); wheel and pinch zoom, pan on empty table; a stopwatch that pauses when the window is hidden.
- **Logic is pure and tested**: grid choice, edges, scatter, snapping/joining, stopwatch, zoom/pan, size budget and row mapping are `app/lib` modules with tests beside them ([contracts/puzzle-engine.md](contracts/puzzle-engine.md)). Rendering, pointer wiring and the vault round trip are validated by hand ([quickstart.md](quickstart.md)).

## Technical Context

**Language/Version**: TypeScript, Vue 3.5, Nuxt 4 (`ssr: false`, static preset, hash router), Node 22 in CI — as `apps/haex-tetris`

**Primary Dependencies**: `@haex-space/vault-sdk` (^4.9, with `getTableName`, `arrayBufferToBase64`, `base64ToArrayBuffer`), `@nuxtjs/i18n`, `@pinia/nuxt`, `@vueuse/core`, `@lucide/vue`, `shadcn-nuxt` through the shared `packages/haex-ui` layer, `drizzle-orm` and `drizzle-kit` for the schema and migration (as `apps/haex-doom`). **No new third-party dependency.**

**Storage**: Table `pictures` in the extension's own vault schema, synced; access through the SDK's raw `client.database` ([data-model.md](data-model.md), [contracts/library-store.md](contracts/library-store.md)). The puzzle in progress is in memory only.

**Testing**: Vitest 3, `environment: node`, `app/**/*.test.ts`, test files beside their modules — the configuration of `haex-tetris` and `haex-doom`.

**Target Platform**: The extension frame of haex-vault on desktop (mouse and keyboard) and on Android/iOS (touch); a Chromium/WebKit web view with Canvas 2D, Pointer Events, `createImageBitmap`, `crypto.subtle`.

**Project Type**: haextension app (single static web app packaged as a signed `.xt`).

**Performance Goals**: Puzzle ready ≤ 3 s after confirming, for pictures up to 24 MP (SC-003); dragging a piece of a 192-piece puzzle without visible lag on a mid-range phone (SC-004) — one canvas redraw of ≤ 192 sprites per animation frame; start screen responsive with ≥ 200 pictures (FR-024) — thumbnails only, lazily turned into object URLs.

**Constraints**: Bridge rows ≤ ~1 MiB (the size `haex-doom` already uses), so a stored picture is bounded to 1 MiB; read-only file permission; no network; no new dependency; every source file ≤ 500 lines (constitution).

**Scale/Scope**: About 12–192 pieces per puzzle; libraries of hundreds of pictures; one app of roughly 25 source files plus tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

The repository's constitution is `.spaex/constitution.md`. The relevant rules, and how the plan meets them:

| Rule | Status |
|------|--------|
| Work in a repository-local worktree on a topic branch; never author in the primary checkout | **Met**: `.worktrees/haex-puzzle`, branch `feat/haex-puzzle` |
| Follow the repository's conventions (structure, naming, runtime, module system) | **Met**: layout, config and scripts copied from `haex-tetris` / `haex-doom` |
| Consult the graphify graph before authoring any new named artifact; prefer extending over a parallel implementation; state the candidates | **Met for planning**: four queries run, results in research R-15. **One borderline case** (zoom/pan math) is deliberately copied rather than hoisted — **needs the reviewer's decision** (below). The graph is consulted again, per artifact, during implementation. |
| Tests in separate files from production code; one runnable check for every non-trivial logic module | **Met**: `*.test.ts` beside each `app/lib` module |
| Split files clearly over 500 lines; do not split solely to shorten | **Met**: modules are small and by concern; `PuzzleTable.vue` is the largest and is kept under 500 lines by moving input handling to `usePuzzleInput.ts` |
| Fewest files, deletion over addition, smallest diff that works; mark corner-cutting with `ponytail:` and its ceiling | **Met**: no dependency, no library for jigsaw shapes; ceilings recorded for duplicate detection (R-3) and full-canvas redraw (R-7) |
| Conventional Commit messages; no attribution of the authoring tooling in commits or any other project artifact | **Met** (and applies to this spec's artifacts too) |
| All work lands on `main` through a pull request | **Met**: PR from `feat/haex-puzzle` |
| No secrets in git; no local absolute paths in committed files | **Met**: only the public key, as in the other apps; all paths in these artifacts are repository-relative |
| Version bumps follow semantic versioning | **Met**: the app starts at `0.1.0`; releases through `scripts/release.js` |
| A design decision that materially affects a Core Principle needs an ADR | **Not triggered**: the repository's Core Principles govern process, not this app's design; no ADR needed |
| Follow the Spec Kit workflow, with the constitution checked at plan and analyze time | **Met**: specify → plan → tasks → implement, with review gates; `/speckit-analyze` before implementing |
| Phase discipline | **Met**: no later-phase work is pulled in; save/resume, rotation, best times stay out of scope |

**Post-design re-check**: no new violation. The design adds no dependency, no cross-app import and no new permission beyond file read.

**Decision for the reviewer — `zoomPan.ts`**: `apps/haex-notes/app/lib/zoomPan.ts` holds the zoom/pan math this feature needs (`fitView`, `zoomAt`, `panBy`). Options: (a) **copy** ~40 lines into `apps/haex-puzzle` with a wider zoom range and open a follow-up to hoist it into `packages/haex-ui` (the plan's choice: keeps `haex-notes` untouched in this PR); (b) hoist it into `packages/haex-ui` now and change `haex-notes` to import it (no duplicate, but widens the PR to a second app). The plan proceeds with (a) unless told otherwise.

## Project Structure

### Documentation (this feature)

```text
specs/021-haex-puzzle/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── library-store.md
│   └── puzzle-engine.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
apps/haex-puzzle/
├── package.json                         # name haex-puzzle, version 0.1.0, scripts as haex-tetris + db:generate
├── nuxt.config.ts                       # port 4012, i18n de/en, hash router, extends ../../packages/haex-ui
├── drizzle.config.ts                    # as haex-doom
├── haextension.config.json              # dev port 4012
├── tsconfig.json  eslint.config.mjs  vitest.config.ts  components.json
├── haextension/
│   ├── manifest.json                    # file read only; migrationsDir; de/en names; icon
│   ├── public.key                       # the repository's shared public key
│   └── haex-puzzle-logo.png
└── app/
    ├── app.vue                          # useHostLocale()
    ├── assets/css/tailwind.css
    ├── pages/index.vue                  # start screen ⇄ table
    ├── components/puzzle/
    │   ├── LibraryGrid.vue              # thumbnails, selection mode, remove
    │   ├── DifficultyPicker.vue
    │   ├── PuzzleTable.vue              # the canvas, draws a frame
    │   ├── PuzzleHud.vue                # timer, preview toggle, new puzzle
    │   └── CompleteDialog.vue
    ├── composables/
    │   ├── useHostLocale.ts
    │   ├── usePuzzle.ts                 # reactive puzzle state around lib/puzzleState
    │   ├── usePuzzleInput.ts            # Pointer Events: drag, pan, pinch, wheel
    │   └── usePictureImport.ts          # file selection → decode → budget → library.add
    ├── stores/
    │   ├── haexvault.ts                 # migrations + client, as haex-doom
    │   └── library.ts                   # the library-store contract
    ├── database/
    │   ├── schemas/index.ts             # `pictures`
    │   └── migrations/                  # generated by drizzle-kit
    ├── lib/                             # pure, each with a *.test.ts beside it
    │   ├── difficulty.ts  grid.ts  jigsaw.ts  scatter.ts  puzzleState.ts
    │   ├── stopwatch.ts  zoomPan.ts  pictureBudget.ts  pictureRows.ts  random.ts
    │   ├── pieceSprites.ts              # canvas: path → sprite (browser only, hand-checked)
    │   └── pictureEncode.ts             # canvas: decode, fit, encode (browser only, hand-checked)
    └── types/puzzle.ts

package.json                             # + "release:haex-puzzle"
pnpm-lock.yaml                           # updated by pnpm install
```

**Structure Decision**: A new app next to the others under `apps/`, laid out as `haex-tetris` (components by feature folder, composables, pure logic in `lib` with tests beside it) with `haex-doom`'s database folder and vault store. `scripts/extensions.js` lists the app automatically once `haextension/manifest.json` exists, so the build and release workflows need no change. The README's list of apps, if it names them, gets one line.

## Complexity Tracking

No constitution violation to justify. Two deliberate simplifications carry a `ponytail:` marker in code: duplicate detection by hash of the original file (R-3), and a full-canvas redraw per frame (R-7). One deliberate duplication — `zoomPan.ts` — is flagged above for the reviewer.

## Open points (not blocking the plan)

- **Logo**: the manifest needs an icon image; the other apps ship a PNG. To be made during implementation (a task in `tasks.md`).
- **Piece counts and snap tolerance** (12/48/108/192, a quarter of the piece side) are first values; tune on real pictures and devices once the table runs (spec Assumptions).
- **`webp` encoding** exists in every current web view that matters; the JPEG fallback is in the plan so a web view without it still works, but it is checked by hand only.
