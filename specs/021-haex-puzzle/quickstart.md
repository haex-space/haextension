# Quickstart: validating haex-puzzle

Phase 1 of [plan.md](plan.md). How to run the extension and prove each user story. Run everything from the repository root; use a worktree on a topic branch (the repository's constitution) and `nix develop` for the Node and pnpm toolchain if you use the flake.

## Prerequisites

- `pnpm install --frozen-lockfile`
- Prepare the shared layer and the app once: `(cd packages/haex-ui && npx nuxt prepare)`, then `pnpm --filter haex-puzzle exec nuxt prepare`
- A current haex-vault (the host) to install the extension into; the table prefix and the file selection exist only there. A plain browser run (`pnpm --filter haex-puzzle dev`) shows the UI but has no vault: the library cannot store and the file selection is absent (see "Without a host" below).

## 1. Automated checks

```text
pnpm --filter haex-puzzle test          # Vitest: every module in contracts/puzzle-engine.md
pnpm --filter haex-puzzle exec eslint .
pnpm --filter haex-puzzle build         # static build must succeed
```

Expected: all tests pass, including the properties listed in [contracts/puzzle-engine.md](contracts/puzzle-engine.md); lint clean; `.output/public` produced.

## 2. Run inside the host

```text
pnpm --filter haex-puzzle ext:dev       # `haex dev`: serves the extension on port 4012 into a running vault
```

For an installable build, follow the signing flow of the other apps (`pnpm --filter haex-puzzle build:release`, or a locally signed `.xt` as for `haex-doom`).

## 3. Scenarios

Numbers refer to the spec's user stories and success criteria.

| # | Do | Expect |
|---|-----|--------|
| A | Open the extension for the first time. | Start screen with an empty library, "Add picture" and four difficulties with piece counts (US1-1, US2-1). |
| B | Add a photo (phone portrait photo with EXIF rotation, 12+ MP). | It appears as a thumbnail at once, right way up (FR-022); adding takes < 5 s (SC-011). |
| C | Choose Easy, start. | About 12 jigsaw pieces with tabs and blanks, scattered around the faint frame, none at home (US1-2, FR-008). |
| D | Drag a piece over others, release it far from home. | It follows the pointer, is drawn above the others while held, stays where released (US1-3, -6, -5). |
| E | Release a piece within a quarter of its size of its place. | It snaps exactly and can no longer be dragged (US1-4, FR-011). |
| F | Finish the puzzle. | Finished picture without outlines, message with the time, "Play again" and "New puzzle" (US1-7, US6-3). |
| G | Start Medium; join two neighbours away from home. | They join and move together; two non-neighbours touching do not join (US5). |
| H | Four difficulties on one picture; count pieces. | Within 10 % of 12 / 48 / 108 / 192 (US2-2); the grid follows the picture's proportions (US2-3). |
| I | A 10:1 panorama, and a 90 × 90 px picture. | Panorama: usable pieces; tiny picture: only the levels that make sense are offered, with the reason (edge cases). |
| J | Add the same file again; add a text file renamed `.png`; cancel the file selection. | No second entry; a clear "cannot be used" message and an unchanged library; no message at all on cancel (FR-026, FR-002, edge cases). |
| K | Add 3 pictures, close the extension, restart the vault, reopen. | All three are there, identical (US3-2, SC-009). |
| L | Select two pictures and remove them; reopen. | The confirmation names "2"; they stay gone; the third is untouched; the original files are untouched (US3-5, -6, FR-027, SC-010). |
| M | Remove the last picture. | Empty state again (edge case). |
| N | On a phone: solve Easy by touch only; two-finger zoom; rotate the device mid-puzzle. | Dragging does not scroll or zoom the page; pieces keep their relative places after rotation (US4, FR-018, FR-019). |
| O | Expert (192 pieces) on a mid-range phone, drag around. | No visible lag (SC-004). |
| P | Switch host language and theme mid-puzzle. | Texts and colours change; the puzzle is untouched (FR-020, SC-008). |
| Q | Turn on the preview; leave the window for 10 s and return. | Preview shows and hides; the timer excludes the ten seconds (US6). |
| R | Add 200 pictures (script or repeat), open the start screen. | It opens quickly and scrolls smoothly (FR-024); note how long the other device needs to sync them (research R-4, no cap by choice). |
| S | Two devices on one vault: add a picture on one, then remove it; add the same file on both while offline and let them sync. | It appears on the other device, and its removal follows; the same file added on both ends as one entry, with no sync error (data-model `id` = SHA-256). |
| T | Start a puzzle, drop a large joined group on a single loose piece, then drag the group away. | The covered piece is freed and can be picked up (FR-014). |

## Without a host

`pnpm --filter haex-puzzle dev` in a browser runs the table and the puzzle logic against the in-memory backend so scenarios C–H, N–Q and T can be tried without a vault (in development, adding a picture falls back to a plain file input). Scenarios A, B (host file selection), J–M, R and S need the host. The backend is `app/lib/memoryBackend.testing.ts` (named like `lobbyHarness.testing.ts` in `apps/haex-doom`; it is also the test fake). It is chosen in one place, `app/stores/library.ts`, only during development (`import.meta.dev`) when the vault plugin is absent, so it never ships in a release build.
