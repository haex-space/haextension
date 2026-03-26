export type TetrisCell = string | null

export type Board = TetrisCell[][]

export interface Position {
  x: number
  y: number
}

export interface Piece {
  type: PieceType
  shape: number[][]
  position: Position
  color: string
}

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

export type GameState = 'idle' | 'playing' | 'paused' | 'gameover'
