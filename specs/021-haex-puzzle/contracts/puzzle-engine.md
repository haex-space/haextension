# Contract: puzzle engine (pure library modules)

Everything the game does that is not drawing or input is a pure function in `app/lib`, so it is tested without a browser. The components and the `usePuzzle` composable are thin: they own the canvas, the pointer events and the reactive state, and call these.

| Module | Exports (shape) | Spec |
|--------|-----------------|------|
| `difficulty.ts` | `DIFFICULTIES`; `availableDifficulties(width, height): DifficultyId[]`; `isTooSmall(width, height): boolean` | FR-003, R-5 |
| `grid.ts` | `chooseGrid(width, height, target): Grid` | FR-003, FR-006 |
| `jigsaw.ts` | `makeEdges(grid, seed): Edges`; `pieceOutline(grid, edges, column, row): PathCommand[]` (plain `move`/`line`/`curve` commands, no canvas types; the renderer turns them into a `Path2D`); `OVERHANG` | FR-004, FR-005 |
| `scatter.ts` | `scatter(grid, random): { x: number; y: number }[]`; `tableRect(width, height): Rect` | FR-008, FR-014 |
| `puzzleState.ts` | `start`, `grab(groupId)`, `release(groupId, dx, dy)`, `restartSame`; `isComplete`; `SNAP_FRACTION` | FR-009–FR-013, R-9 |
| `stopwatch.ts` | `createStopwatch(now)`: `start()`, `pause()`, `resume()`, `elapsed()`, `freeze()` | FR-016 |
| `zoomPan.ts` | `fitView`, `zoomAt`, `panBy`, `clampView`, `ZOOM_RANGE` | FR-018 |
| `pictureBudget.ts` | `fitLongSide(width, height, max)`, `qualityLadder`, `nextAttempt(size, attempt)` | R-2 |
| `pictureRows.ts` | row ⇄ `LibraryItem` mapping, `contentHash(bytes)` | library-store contract |
| `random.ts` | `seededRandom(seed): () => number`, `shuffle(array, random)` | R-10 |

## Properties asserted by tests

- **Grid**: for aspect ratios 1:10 … 10:1 and every difficulty available at that size, `|columns × rows − target| ≤ 10 % × target` and the piece's aspect ratio is within 1:1.6.
- **Edges (interlock)**: for every interior edge, the outline segment one piece traces equals the other piece's segment reversed, point for point. Outer sides are straight lines. Over 1000 seeds, edges of one puzzle are not all equal.
- **Coverage (SC-005)**: the pieces' cell boxes tile the picture exactly (sum of areas = picture area, no overlaps) for 200 random sizes and grids.
- **Scatter**: for 1000 seeds and every difficulty, no piece's box overlaps the frame, every box is inside the table, no piece is covered more than 35 % by another, and no piece starts at home.
- **Snap**: a release within `SNAP_FRACTION × side` of home snaps; at `SNAP_FRACTION × side + ε` it does not (both directions, for an interior, an edge and a corner piece).
- **Join**: two neighbours released within tolerance join and move together afterwards; two non-neighbours touching never join; joining a placed group places the joiner.
- **Invariants 1–5** of the data model hold after every random sequence of moves (fuzzed with a seeded generator, 200 moves × 100 seeds).
- **Completion**: placing the last group ends in `complete`, once; no state change after that.
- **Stopwatch**: `pause`/`resume` exclude the paused span; double `pause` or `resume` is harmless; `freeze` stops it for good.
- **Zoom/pan**: `zoomAt` keeps the anchor point fixed and clamps to `ZOOM_RANGE`; `clampView` always leaves part of the table visible.
- **Budget**: `nextAttempt` terminates (a bounded number of attempts) for any starting size and ends below the 1 MiB budget or gives up with `too-large`.

## Not covered by unit tests (manual, see quickstart)

Drawing the sprites, hit-testing with `isPointInPath`, pointer capture and pinch on a real touch screen, `createImageBitmap` orientation, canvas WebP/JPEG encoding, the vault round trip. The first two need a canvas; the rest need the host.
