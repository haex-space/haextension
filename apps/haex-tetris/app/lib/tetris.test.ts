import { describe, expect, it } from 'vitest'
import type { Board, Piece } from '~/types/tetris'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  createEmptyBoard,
  createPiece,
  dropDistance,
  isValidPosition,
  levelForLines,
  lockPiece,
  renderBoard,
  rotateMatrix,
  rotatePiece,
  scoreForLines,
} from './tetris'

function fullRow(color = 'x'): (string | null)[] {
  return Array.from({ length: BOARD_WIDTH }, () => color)
}

function rowWithGap(gapX: number[], color = 'x'): (string | null)[] {
  return Array.from({ length: BOARD_WIDTH }, (_, x) => (gapX.includes(x) ? null : color))
}

function pieceAt(type: Piece['type'], x: number, y: number): Piece {
  return { ...createPiece(type), position: { x, y } }
}

describe('rotateMatrix', () => {
  it('rotates clockwise', () => {
    expect(rotateMatrix([
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ])).toEqual([
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ])
  })
})

describe('isValidPosition', () => {
  const o = createPiece('O').shape

  it('rejects walls and the floor', () => {
    const board = createEmptyBoard()
    expect(isValidPosition(o, { x: -1, y: 0 }, board)).toBe(false)
    expect(isValidPosition(o, { x: BOARD_WIDTH - 1, y: 0 }, board)).toBe(false)
    expect(isValidPosition(o, { x: 0, y: BOARD_HEIGHT - 1 }, board)).toBe(false)
    expect(isValidPosition(o, { x: 0, y: BOARD_HEIGHT - 2 }, board)).toBe(true)
  })

  it('allows cells above the board', () => {
    expect(isValidPosition(o, { x: 0, y: -1 }, createEmptyBoard())).toBe(true)
  })

  it('rejects occupied cells', () => {
    const board = createEmptyBoard()
    board[5]![1] = 'x'
    expect(isValidPosition(o, { x: 0, y: 4 }, board)).toBe(false)
    expect(isValidPosition(o, { x: 2, y: 4 }, board)).toBe(true)
  })
})

describe('lockPiece', () => {
  it('writes the piece into the board', () => {
    const { board, clearedLines } = lockPiece(createEmptyBoard(), pieceAt('O', 0, BOARD_HEIGHT - 2))
    expect(clearedLines).toBe(0)
    expect(board[BOARD_HEIGHT - 1]!.slice(0, 3)).toEqual(['#f0f000', '#f0f000', null])
  })

  it('clears non-contiguous lines and keeps the rows between them in order', () => {
    const board: Board = createEmptyBoard()
    board[BOARD_HEIGHT - 3] = rowWithGap([0])
    board[BOARD_HEIGHT - 2] = rowWithGap([0, 1], 'keep')
    board[BOARD_HEIGHT - 1] = rowWithGap([0])
    // An I piece standing upright in column 0 fills the gaps of rows -3 and -1.
    const upright = { ...createPiece('I'), shape: rotateMatrix(createPiece('I').shape), position: { x: -2, y: BOARD_HEIGHT - 4 } }

    const result = lockPiece(board, upright)

    expect(result.clearedLines).toBe(2)
    expect(result.board).toHaveLength(BOARD_HEIGHT)
    expect(result.board[BOARD_HEIGHT - 1]).toEqual(['#00f0f0', null, ...fullRow('keep').slice(2)])
    expect(result.board[BOARD_HEIGHT - 2]![0]).toBe('#00f0f0')
    expect(result.board[0]).toEqual(Array.from({ length: BOARD_WIDTH }, () => null))
  })

  it('reports a lock-out when cells stay above the board', () => {
    const result = lockPiece(createEmptyBoard(), pieceAt('O', 0, -1))
    expect(result.lockedOut).toBe(true)
    expect(result.board[0]!.slice(0, 2)).toEqual(['#f0f000', '#f0f000'])
  })

  it('moves cells above the board into view when a line clears below them', () => {
    const board = createEmptyBoard()
    board[0] = rowWithGap([0, 1])
    const result = lockPiece(board, pieceAt('O', 0, -1))
    expect(result.clearedLines).toBe(1)
    expect(result.lockedOut).toBe(false)
    expect(result.board[0]!.slice(0, 3)).toEqual(['#f0f000', '#f0f000', null])
  })

  it('does not report a lock-out for a piece inside the board', () => {
    expect(lockPiece(createEmptyBoard(), pieceAt('T', 3, 0)).lockedOut).toBe(false)
  })
})

describe('rotatePiece', () => {
  it('kicks off the wall when the plain rotation does not fit', () => {
    const board = createEmptyBoard()
    const upright = { ...createPiece('I'), shape: rotateMatrix(createPiece('I').shape), position: { x: -2, y: 5 } }
    const rotated = rotatePiece(upright, board)
    expect(rotated).not.toBeNull()
    expect(isValidPosition(rotated!.shape, rotated!.position, board)).toBe(true)
  })

  it('does not rotate the O piece', () => {
    expect(rotatePiece(createPiece('O'), createEmptyBoard())).toBeNull()
  })
})

describe('scoring', () => {
  it('scales line points with the level', () => {
    expect(scoreForLines(1, 1)).toBe(100)
    expect(scoreForLines(4, 3)).toBe(2400)
  })

  it('raises the level every ten lines', () => {
    expect(levelForLines(9)).toBe(1)
    expect(levelForLines(10)).toBe(2)
  })
})

describe('renderBoard', () => {
  it('draws the ghost where the piece would land', () => {
    const piece = pieceAt('O', 0, 0)
    const display = renderBoard(createEmptyBoard(), piece)
    expect(dropDistance(piece.shape, piece.position, createEmptyBoard())).toBe(BOARD_HEIGHT - 2)
    expect(display[0]![0]).toBe('#f0f000')
    expect(display[BOARD_HEIGHT - 1]![0]).toBe('ghost:#f0f000')
  })
})
