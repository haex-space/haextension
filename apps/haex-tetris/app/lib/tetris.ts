import type { Board, Piece, PieceType, Position } from '~/types/tetris'

export const BOARD_WIDTH = 10
export const BOARD_HEIGHT = 20

const PIECE_SHAPES: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
}

const PIECE_COLORS: Record<PieceType, string> = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#0000f0',
  L: '#f0a000',
}

export const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

const ROTATION_KICKS: Position[] = [
  { x: 0, y: 0 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -2, y: 0 },
  { x: 2, y: 0 },
]

const LINE_POINTS = [0, 100, 300, 500, 800]

function emptyRows(count: number): Board {
  return Array.from({ length: count }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null),
  )
}

export function createEmptyBoard(): Board {
  return emptyRows(BOARD_HEIGHT)
}

export function rotateMatrix(matrix: number[][]): number[][] {
  const size = matrix.length
  const rotated: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0),
  )
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      rotated[x]![size - 1 - y] = matrix[y]![x]!
    }
  }
  return rotated
}

export function createPiece(type: PieceType): Piece {
  const shape = PIECE_SHAPES[type].map(row => [...row])
  return {
    type,
    shape,
    position: {
      x: Math.floor((BOARD_WIDTH - shape[0]!.length) / 2),
      y: 0,
    },
    color: PIECE_COLORS[type],
  }
}

/** Board coordinates of the filled cells of `shape` placed at `position`. */
export function pieceCells(shape: number[][], position: Position): Position[] {
  const cells: Position[] = []
  shape.forEach((row, y) => {
    row.forEach((filled, x) => {
      if (filled) cells.push({ x: position.x + x, y: position.y + y })
    })
  })
  return cells
}

function isOnBoard({ x, y }: Position): boolean {
  return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT
}

/** Cells above the board (y < 0) are allowed; they collide with nothing. */
export function isValidPosition(shape: number[][], position: Position, board: Board): boolean {
  return pieceCells(shape, position).every(({ x, y }) =>
    x >= 0 && x < BOARD_WIDTH && y < BOARD_HEIGHT && (y < 0 || !board[y]![x]),
  )
}

/** How many rows `shape` can fall from `position` before it collides. */
export function dropDistance(shape: number[][], position: Position, board: Board): number {
  let distance = 0
  while (isValidPosition(shape, { x: position.x, y: position.y + distance + 1 }, board)) {
    distance++
  }
  return distance
}

/** The piece rotated clockwise at the first kick offset that fits, or null. */
export function rotatePiece(piece: Piece, board: Board): Piece | null {
  if (piece.type === 'O') return null
  const shape = rotateMatrix(piece.shape)
  for (const kick of ROTATION_KICKS) {
    const position = { x: piece.position.x + kick.x, y: piece.position.y + kick.y }
    if (isValidPosition(shape, position, board)) return { ...piece, shape, position }
  }
  return null
}

export interface LockResult {
  board: Board
  clearedLines: number
}

/** Writes `piece` into the board and removes completed lines. */
export function lockPiece(board: Board, piece: Piece): LockResult {
  const merged = board.map(row => [...row])
  for (const { x, y } of pieceCells(piece.shape, piece.position)) {
    if (y >= 0) merged[y]![x] = piece.color
  }
  const kept = merged.filter(row => row.some(cell => cell === null))
  const clearedLines = merged.length - kept.length
  return { board: [...emptyRows(clearedLines), ...kept], clearedLines }
}

export function scoreForLines(clearedLines: number, level: number): number {
  return (LINE_POINTS[clearedLines] ?? 0) * level
}

export function levelForLines(lines: number): number {
  return Math.floor(lines / 10) + 1
}

export function dropSpeed(level: number): number {
  return Math.max(100, 1000 - (level - 1) * 80)
}

/** The board as displayed: `piece` and its ghost (prefixed `ghost:`) drawn on top. */
export function renderBoard(board: Board, piece: Piece | null): Board {
  const display = board.map(row => [...row])
  if (!piece) return display

  const ghost = {
    x: piece.position.x,
    y: piece.position.y + dropDistance(piece.shape, piece.position, board),
  }
  for (const cell of pieceCells(piece.shape, ghost)) {
    if (isOnBoard(cell) && !display[cell.y]![cell.x]) {
      display[cell.y]![cell.x] = `ghost:${piece.color}`
    }
  }
  for (const cell of pieceCells(piece.shape, piece.position)) {
    if (isOnBoard(cell)) display[cell.y]![cell.x] = piece.color
  }
  return display
}
