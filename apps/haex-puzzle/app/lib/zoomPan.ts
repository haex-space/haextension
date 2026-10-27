import type { Point, Size, View } from '~/types/puzzle'

/*
 * ponytail: copied from apps/haex-notes/app/lib/zoomPan.ts (wider zoom range, plus clampView).
 * Apps do not import from each other; hoist the shared part into packages/haex-ui as a follow-up.
 */

/** How far one may zoom below and above the fitted scale. */
export const ZOOM_RANGE = { below: 0.5, above: 6 }

/** The whole content, fitted into the box and centred. A `View` maps content to box: box point = content point * scale + (x, y). */
export function fitView(box: Size, content: Size): View {
  if (content.width <= 0 || content.height <= 0 || box.width <= 0 || box.height <= 0) return { scale: 1, x: 0, y: 0 }
  const scale = Math.min(box.width / content.width, box.height / content.height)
  return { scale, x: (box.width - content.width * scale) / 2, y: (box.height - content.height * scale) / 2 }
}

/**
 * Zooms by `factor` and keeps the point `at` (in the box) on the same spot of the content. The scale
 * stays between `ZOOM_RANGE.below` and `ZOOM_RANGE.above` times the fitted scale `fitScale`.
 */
export function zoomAt(view: View, factor: number, at: Point, fitScale: number): View {
  const scale = Math.min(Math.max(view.scale * factor, fitScale * ZOOM_RANGE.below), fitScale * ZOOM_RANGE.above)
  const ratio = scale / view.scale
  return { scale, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio }
}

/** Moves the content by `dx`, `dy` pixels of the box. */
export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy }
}

/** Keeps at least a quarter of the content's width and height inside the box, so the table can never be lost. */
export function clampView(view: View, box: Size, content: Size): View {
  const keepX = (content.width * view.scale) / 4
  const keepY = (content.height * view.scale) / 4
  const x = Math.min(Math.max(view.x, keepX - content.width * view.scale), box.width - keepX)
  const y = Math.min(Math.max(view.y, keepY - content.height * view.scale), box.height - keepY)
  return { ...view, x, y }
}
