import { clampView, panBy, zoomAt } from '~/lib/zoomPan'
import type { PuzzleApi } from '~/composables/usePuzzle'
import type { Point, Rect, Size, View } from '~/types/puzzle'

interface Options {
  canvas: Ref<HTMLCanvasElement | null>
  puzzle: PuzzleApi
  view: Ref<View>
  /** The table's rectangle in table coordinates (its top-left is the origin of the view). */
  table: ComputedRef<Rect | null>
  /** The canvas's size in CSS pixels. */
  box: Ref<Size>
  /** The scale at which the whole table fits; zooming is limited around it. */
  fitScale: () => number
}

const WHEEL_ZOOM = 0.0015
const PINCH_WHEEL_ZOOM = 0.01

/**
 * Pointer input for the table (mouse, touch and pen alike): one pointer on a piece drags its group, one on
 * the empty table pans the view, two pinch to zoom and pan, and the wheel zooms at the pointer.
 */
export function usePuzzleInput({ canvas, puzzle, view, table, box, fitScale }: Options) {
  const pointers = new Map<number, Point>()
  let drag: { pointerId: number; groupId: number; last: Point } | null = null
  let pan: { pointerId: number; last: Point } | null = null
  let pinch: { distance: number; middle: Point } | null = null

  function origin(): Point {
    return table.value ?? { x: 0, y: 0 }
  }

  function screenPoint(event: { clientX: number; clientY: number }): Point {
    const rect = canvas.value!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /** A point on the screen, as a point on the table (the picture's frame at 0, 0). */
  function toWorld(point: Point): Point {
    return {
      x: (point.x - view.value.x) / view.value.scale + origin().x,
      y: (point.y - view.value.y) / view.value.scale + origin().y,
    }
  }

  function setView(next: View) {
    const area = table.value
    view.value = area ? clampView(next, box.value, { width: area.width, height: area.height }) : next
  }

  function endDrag() {
    if (!drag) return
    const { groupId } = drag
    drag = null
    puzzle.drop(groupId)
  }

  function pinchState(): { distance: number; middle: Point } {
    const [a, b] = [...pointers.values()] as [Point, Point]
    return { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }

  function onDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const point = screenPoint(event)
    pointers.set(event.pointerId, point)
    canvas.value!.setPointerCapture(event.pointerId)
    event.preventDefault()

    if (pointers.size >= 2) {
      // A second finger turns the gesture into a pinch; a piece in hand is put down first.
      endDrag()
      pan = null
      pinch = pinchState()
      return
    }

    const piece = puzzle.pieceAtPoint(toWorld(point))
    if (piece && puzzle.grab(piece.group)) drag = { pointerId: event.pointerId, groupId: piece.group, last: toWorld(point) }
    else pan = { pointerId: event.pointerId, last: point }
  }

  function onMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return
    const point = screenPoint(event)
    pointers.set(event.pointerId, point)

    if (pinch && pointers.size >= 2) {
      const next = pinchState()
      let zoomed = zoomAt(view.value, next.distance / pinch.distance, next.middle, fitScale())
      zoomed = panBy(zoomed, next.middle.x - pinch.middle.x, next.middle.y - pinch.middle.y)
      setView(zoomed)
      pinch = next
    } else if (drag && event.pointerId === drag.pointerId) {
      const world = toWorld(point)
      puzzle.move(drag.groupId, world.x - drag.last.x, world.y - drag.last.y)
      drag.last = world
    } else if (pan && event.pointerId === pan.pointerId) {
      setView(panBy(view.value, point.x - pan.last.x, point.y - pan.last.y))
      pan.last = point
    }
  }

  function onEnd(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return
    if (drag && event.pointerId === drag.pointerId) endDrag()
    if (pan && event.pointerId === pan.pointerId) pan = null
    if (pointers.size < 2) pinch = null
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    const rate = event.ctrlKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM
    setView(zoomAt(view.value, Math.exp(-event.deltaY * rate), screenPoint(event), fitScale()))
  }

  onMounted(() => {
    const element = canvas.value!
    element.addEventListener('pointerdown', onDown)
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onEnd)
    element.addEventListener('pointercancel', onEnd)
    // Not passive: the page must not scroll or zoom while the table is used.
    element.addEventListener('wheel', onWheel, { passive: false })
  })

  onBeforeUnmount(() => {
    const element = canvas.value
    element?.removeEventListener('pointerdown', onDown)
    element?.removeEventListener('pointermove', onMove)
    element?.removeEventListener('pointerup', onEnd)
    element?.removeEventListener('pointercancel', onEnd)
    element?.removeEventListener('wheel', onWheel)
  })
}
