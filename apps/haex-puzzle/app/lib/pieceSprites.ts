import type { Edges, Grid, PathCommand, Piece, Point } from '~/types/puzzle'
import { OVERHANG, pieceOutline } from './jigsaw'

export interface PieceSprite {
  canvas: HTMLCanvasElement
  /** The outline relative to the cell box's top-left, for hit testing. */
  path: Path2D
}

export interface Sprites {
  pieces: PieceSprite[]
  /** Space around the cell box in each sprite, for the tabs. */
  margin: number
  /** Whether a point, relative to the piece's cell box, lies inside the piece's outline. */
  contains(piece: Piece, local: Point): boolean
}

function toPath(commands: PathCommand[]): Path2D {
  const path = new Path2D()
  for (const command of commands) {
    if (command.type === 'move') path.moveTo(command.x, command.y)
    else if (command.type === 'line') path.lineTo(command.x, command.y)
    else path.bezierCurveTo(command.c1x, command.c1y, command.c2x, command.c2y, command.x, command.y)
  }
  path.closePath()
  return path
}

/**
 * Renders every piece once, at the picture's own resolution: the piece's part of the picture, clipped
 * to its outline, with a dark line and a light edge for relief.
 */
export function makeSprites(image: CanvasImageSource & { width: number; height: number }, grid: Grid, edges: Edges): Sprites {
  const side = Math.min(grid.pieceWidth, grid.pieceHeight)
  const margin = Math.ceil(OVERHANG * side) + 2
  const scaleX = image.width / grid.width
  const scaleY = image.height / grid.height
  const lineWidth = Math.max(1.5, side / 90)
  const pieces: PieceSprite[] = []

  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const path = toPath(pieceOutline(grid, edges, column, row))
      const inSprite = new Path2D()
      inSprite.addPath(path, new DOMMatrix().translate(margin, margin))

      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(grid.pieceWidth + 2 * margin)
      canvas.height = Math.ceil(grid.pieceHeight + 2 * margin)
      const context = canvas.getContext('2d')!
      context.imageSmoothingQuality = 'high'

      // The part of the picture the sprite shows, kept inside the picture.
      const left = Math.max(0, column * grid.pieceWidth - margin)
      const top = Math.max(0, row * grid.pieceHeight - margin)
      const right = Math.min(grid.width, (column + 1) * grid.pieceWidth + margin)
      const bottom = Math.min(grid.height, (row + 1) * grid.pieceHeight + margin)

      context.save()
      context.clip(inSprite)
      context.drawImage(
        image,
        left * scaleX, top * scaleY, (right - left) * scaleX, (bottom - top) * scaleY,
        margin + left - column * grid.pieceWidth, margin + top - row * grid.pieceHeight, right - left, bottom - top,
      )
      context.restore()

      context.lineJoin = 'round'
      context.lineWidth = lineWidth
      context.strokeStyle = 'rgba(0, 0, 0, 0.55)'
      context.stroke(inSprite)
      context.save()
      context.clip(inSprite)
      context.translate(-lineWidth * 0.6, -lineWidth * 0.6)
      context.lineWidth = lineWidth * 0.8
      context.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      context.stroke(inSprite)
      context.restore()

      pieces.push({ canvas, path })
    }
  }

  const scratch = document.createElement('canvas').getContext('2d')!
  return {
    pieces,
    margin,
    contains: (piece, local) => scratch.isPointInPath(pieces[piece.id]!.path, local.x, local.y),
  }
}
