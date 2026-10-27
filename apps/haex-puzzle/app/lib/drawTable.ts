import type { PuzzleState, View } from '~/types/puzzle'
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

  const ordered = [...state.groups].sort((a, b) => Number(b.placed) - Number(a.placed) || a.z - b.z)
  for (const group of ordered) {
    for (const id of group.pieceIds) {
      const piece = state.pieces[id]!
      context.drawImage(sprites.pieces[id]!.canvas, piece.x - sprites.margin, piece.y - sprites.margin)
    }
  }
}
