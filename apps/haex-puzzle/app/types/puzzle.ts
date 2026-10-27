export type DifficultyId = 'easy' | 'medium' | 'hard' | 'expert'

export interface Difficulty {
  id: DifficultyId
  /** Approximate number of pieces. */
  target: number
  /** Smallest piece side, in pixels of the stored picture, for the level to be offered. */
  minPieceSide: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

export interface Grid {
  columns: number
  rows: number
  pieceWidth: number
  pieceHeight: number
  /** Size of the stored picture the grid divides. */
  width: number
  height: number
}

/** One edge between two neighbouring cells. */
export interface Edge {
  /** 1: the tab belongs to the piece before the edge (left or above); -1: to the piece after it. */
  direction: 1 | -1
  /** Fractions of the edge length. */
  tab: number
  neck: number
  shoulder: number
  lean: number
}

export interface Edges {
  /** `horizontal[row][column]`: the edge below cell (column, row); rows − 1 rows of edges. */
  horizontal: Edge[][]
  /** `vertical[row][column]`: the edge right of cell (column, row); columns − 1 per row. */
  vertical: Edge[][]
}

export type PathCommand =
  | { type: 'move'; x: number; y: number }
  | { type: 'line'; x: number; y: number }
  | { type: 'curve'; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }

export interface Piece {
  id: number
  column: number
  row: number
  /** Current top-left of the piece's cell box on the table, in picture pixels. */
  x: number
  y: number
  group: number
}

export interface Group {
  id: number
  pieceIds: number[]
  placed: boolean
  z: number
}

export interface PuzzleState {
  pictureId: string
  difficulty: DifficultyId
  grid: Grid
  edges: Edges
  pieces: Piece[]
  groups: Group[]
  table: Rect
  phase: 'playing' | 'complete'
}

export interface LibraryItem {
  id: string
  name: string
  width: number
  height: number
  addedAt: string
  thumbnail: Uint8Array
}

export type Rejection = 'unsupported' | 'too-large' | 'too-small' | 'storage-failed' | 'read-failed'

export type AddResult =
  | { ok: true; item: LibraryItem; duplicate: boolean }
  | { ok: false; name: string; reason: Rejection }

export interface View {
  scale: number
  x: number
  y: number
}
