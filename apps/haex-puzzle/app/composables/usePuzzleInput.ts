import type { Point, Rect, View } from '~/types/puzzle'
import type { PuzzleApi } from '~/composables/usePuzzle'

interface Options {
  canvas: Ref<HTMLCanvasElement | null>
  puzzle: PuzzleApi
  view: Ref<View>
  /** The table's rectangle in table coordinates (its top-left is the origin of the view). */
  table: ComputedRef<Rect | null>
}

/** Pointer input for the table (mouse, touch and pen alike): picks pieces up and drags them. */
export function usePuzzleInput({ canvas, puzzle, view, table }: Options) {
  let drag: { pointerId: number; groupId: number; last: Point } | null = null

  /** A pointer position on the screen, as a point on the table (the picture's frame at 0, 0). */
  function toWorld(event: PointerEvent): Point {
    const rect = canvas.value!.getBoundingClientRect()
    const origin = table.value ?? { x: 0, y: 0 }
    return {
      x: (event.clientX - rect.left - view.value.x) / view.value.scale + origin.x,
      y: (event.clientY - rect.top - view.value.y) / view.value.scale + origin.y,
    }
  }

  function onDown(event: PointerEvent) {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return
    const point = toWorld(event)
    const piece = puzzle.pieceAtPoint(point)
    if (!piece || !puzzle.grab(piece.group)) return
    canvas.value!.setPointerCapture(event.pointerId)
    drag = { pointerId: event.pointerId, groupId: piece.group, last: point }
    event.preventDefault()
  }

  function onMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    const point = toWorld(event)
    puzzle.move(drag.groupId, point.x - drag.last.x, point.y - drag.last.y)
    drag.last = point
  }

  function onEnd(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    const { groupId } = drag
    drag = null
    puzzle.drop(groupId)
  }

  onMounted(() => {
    const element = canvas.value!
    element.addEventListener('pointerdown', onDown)
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onEnd)
    element.addEventListener('pointercancel', onEnd)
  })

  onBeforeUnmount(() => {
    const element = canvas.value
    element?.removeEventListener('pointerdown', onDown)
    element?.removeEventListener('pointermove', onMove)
    element?.removeEventListener('pointerup', onEnd)
    element?.removeEventListener('pointercancel', onEnd)
  })
}
