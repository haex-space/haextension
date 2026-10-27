import { createStopwatch, type Stopwatch } from '~/lib/stopwatch'
import { makeSprites, type Sprites } from '~/lib/pieceSprites'
import { platformRandom } from '~/lib/random'
import * as rules from '~/lib/puzzleState'
import type { DifficultyId, LibraryItem, Piece, Point, PuzzleState } from '~/types/puzzle'

/**
 * The running puzzle: the rules of `puzzleState` around the picture, the piece sprites and the clock.
 * The state is changed in place, so `version` says when something to draw has changed.
 */
export function usePuzzle() {
  const library = useLibraryStore()

  const state = shallowRef<PuzzleState | null>(null)
  const sprites = shallowRef<Sprites | null>(null)
  const image = shallowRef<ImageBitmap | null>(null)
  const version = ref(0)
  const loading = ref(false)
  /** Bumped when the user asks to see the whole table again. */
  const fitRequest = ref(0)
  const finishedMs = ref(0)
  let stopwatch: Stopwatch = createStopwatch()

  const phase = computed(() => {
    void version.value
    return state.value?.phase ?? null
  })

  function touch() {
    version.value++
  }

  function discard() {
    image.value?.close()
    image.value = null
    sprites.value = null
    state.value = null
  }

  /** Cuts a library picture into a puzzle; rejects when the picture cannot be opened or decoded. */
  async function begin(item: LibraryItem, difficulty: DifficultyId): Promise<void> {
    loading.value = true
    try {
      const opened = await library.open(item.id)
      let bitmap: ImageBitmap
      try {
        bitmap = await createImageBitmap(new Blob([opened.data as BlobPart], { type: opened.mimeType }))
      } catch (error) {
        library.markUnusable(item.id)
        throw error
      }
      discard()
      const next = rules.start(item.id, bitmap.width, bitmap.height, difficulty, platformRandom)
      image.value = bitmap
      sprites.value = makeSprites(bitmap, next.grid, next.edges)
      state.value = next
      stopwatch = createStopwatch()
      finishedMs.value = 0
      touch()
    } finally {
      loading.value = false
    }
  }

  function pieceAtPoint(point: Point): Piece | null {
    if (!state.value || !sprites.value) return null
    return rules.pieceAt(state.value, point, sprites.value.contains)
  }

  /** Picks a group up; the clock starts with the first piece picked up. */
  function grab(groupId: number): boolean {
    if (!state.value || !rules.grab(state.value, groupId)) return false
    stopwatch.start()
    touch()
    return true
  }

  function move(groupId: number, dx: number, dy: number) {
    if (!state.value) return
    rules.moveGroup(state.value, groupId, dx, dy)
    touch()
  }

  function drop(groupId: number) {
    if (!state.value) return
    rules.release(state.value, groupId)
    if (state.value.phase === 'complete') {
      stopwatch.freeze()
      finishedMs.value = stopwatch.elapsed()
    }
    touch()
  }

  /** The same picture and level, scattered anew, with the clock reset. */
  function restart() {
    if (!state.value) return
    rules.restartSame(state.value, platformRandom)
    stopwatch = createStopwatch()
    finishedMs.value = 0
    touch()
  }

  function fit() {
    fitRequest.value++
  }

  function leave() {
    discard()
    touch()
  }

  onBeforeUnmount(discard)

  return {
    state, sprites, image, version, phase, loading, finishedMs, fitRequest,
    begin, fit, pieceAtPoint, grab, move, drop, restart, leave,
    elapsed: () => stopwatch.elapsed(),
    stopwatch: () => stopwatch,
  }
}

export type PuzzleApi = ReturnType<typeof usePuzzle>
