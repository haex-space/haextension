import type { Piece, PuzzleState, View } from '~/types/puzzle'
import type { Sprites } from './pieceSprites'

export interface TableColors {
  table: string
  frame: string
}

export interface TableScene {
  state: PuzzleState
  sprites: Sprites
  image: CanvasImageSource
  view: View
  colors: TableColors
  /** Device pixels per CSS pixel. */
  ratio: number
  width: number
  height: number
}

/**
 * One frame of the table: the table, the faint frame of the picture, the placed pieces, then the loose
 * ones by height with the last picked up on top. A finished puzzle shows the picture without outlines.
 * ponytail: the whole canvas is redrawn on every frame, which is fine to about 500 pieces; the levels
 * stop at 192. Dirty rectangles would be the upgrade.
 */
export function drawTable(context: CanvasRenderingContext2D, scene: TableScene): void {
  const { state, sprites, image, view, colors, ratio } = scene
  const { grid, table } = state
  const scale = view.scale

  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, scene.width, scene.height)
  context.fillStyle = colors.table
  context.fillRect(view.x, view.y, table.width * scale, table.height * scale)

  // Table coordinates (the picture's frame at 0, 0) to device pixels.
  context.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * (view.x - table.x * scale), ratio * (view.y - table.y * scale))
  context.imageSmoothingQuality = 'high'

  if (state.phase === 'complete') {
    context.drawImage(image, 0, 0, grid.width, grid.height)
    return
  }

  context.globalAlpha = 0.12
  context.drawImage(image, 0, 0, grid.width, grid.height)
  context.globalAlpha = 1
  context.strokeStyle = colors.frame
  context.lineWidth = 1.5 / scale
  context.setLineDash([8 / scale, 6 / scale])
  context.strokeRect(0, 0, grid.width, grid.height)
  context.setLineDash([])

  const placedGroups = new Set(state.groups.filter(g => g.placed).map(g => g.id))
  const ordered = [...state.groups].sort((a, b) => Number(b.placed) - Number(a.placed) || a.z - b.z)
  for (const group of ordered) {
    for (const id of group.pieceIds) {
      const piece = state.pieces[id]!
      context.drawImage(sprites.pieces[id]!.canvas, piece.x - sprites.margin, piece.y - sprites.margin)
    }
    drawOutline(context, state, sprites, group.pieceIds, placedGroups)
  }
}

/** The piece's neighbour on a side (top, right, bottom, left), or null at the picture's border. */
function neighbourOn(state: PuzzleState, piece: Piece, side: number): Piece | null {
  const { columns, rows } = state.grid
  if (side === 0) return piece.row > 0 ? state.pieces[piece.id - columns]! : null
  if (side === 1) return piece.column < columns - 1 ? state.pieces[piece.id + 1]! : null
  if (side === 2) return piece.row < rows - 1 ? state.pieces[piece.id + columns]! : null
  return piece.column > 0 ? state.pieces[piece.id - 1]! : null
}

/**
 * Lines around a group's pieces, but not between two pieces of one group or between two placed ones, so a
 * joined or placed area reads as a part of the picture. The sides are drawn where the sprites sit: at the
 * pieces' current position, shifted from their home in the table coordinates the paths are in.
 */
function drawOutline(context: CanvasRenderingContext2D, state: PuzzleState, sprites: Sprites, pieceIds: number[], placedGroups: Set<number>): void {
  const { grid, pieces } = state
  for (const pass of [0, 1]) {
    context.lineJoin = 'round'
    context.lineWidth = pass === 0 ? sprites.lineWidth : sprites.lineWidth * 0.7
    context.strokeStyle = pass === 0 ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.4)'
    const nudge = pass === 0 ? 0 : -sprites.lineWidth * 0.6
    for (const id of pieceIds) {
      const piece = pieces[id]!
      context.save()
      context.translate(piece.x - piece.column * grid.pieceWidth + nudge, piece.y - piece.row * grid.pieceHeight + nudge)
      for (let side = 0; side < 4; side++) {
        const neighbour = neighbourOn(state, piece, side)
        const hidden = neighbour && (neighbour.group === piece.group || (placedGroups.has(piece.group) && placedGroups.has(neighbour.group)))
        if (!hidden) context.stroke(sprites.sides[id]![side]!)
      }
      context.restore()
    }
  }
}
