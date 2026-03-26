import type { Board, GameState, Piece, PieceType, Position } from '~/types/tetris'

const BOARD_WIDTH = 10
const BOARD_HEIGHT = 20

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

const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null),
  )
}

function rotateMatrix(matrix: number[][]): number[][] {
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

export function useTetris() {
  const board = ref<Board>(createEmptyBoard())
  const currentPiece = ref<Piece | null>(null)
  const nextPiece = ref<Piece | null>(null)
  const gameState = ref<GameState>('idle')
  const score = ref(0)
  const level = ref(1)
  const lines = ref(0)
  const highScore = ref(0)

  let dropInterval: ReturnType<typeof setInterval> | null = null
  let bag: PieceType[] = []

  function shuffleBag(): PieceType[] {
    const newBag = [...PIECE_TYPES]
    for (let i = newBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[newBag[i], newBag[j]] = [newBag[j]!, newBag[i]!]
    }
    return newBag
  }

  function getNextType(): PieceType {
    if (bag.length === 0) {
      bag = shuffleBag()
    }
    return bag.pop()!
  }

  function createPiece(type: PieceType): Piece {
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

  function isValidPosition(shape: number[][], pos: Position, boardState: Board): boolean {
    for (let y = 0; y < shape.length; y++) {
      const row = shape[y]!
      for (let x = 0; x < row.length; x++) {
        if (row[x]) {
          const newX = pos.x + x
          const newY = pos.y + y
          if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) return false
          if (newY < 0) continue
          if (boardState[newY]![newX]) return false
        }
      }
    }
    return true
  }

  function lockPiece() {
    const piece = currentPiece.value
    if (!piece) return

    const newBoard = board.value.map(row => [...row])
    for (let y = 0; y < piece.shape.length; y++) {
      const row = piece.shape[y]
      if (!row) continue
      for (let x = 0; x < row.length; x++) {
        if (row[x]) {
          const boardY = piece.position.y + y
          const boardX = piece.position.x + x
          if (boardY >= 0 && boardY < BOARD_HEIGHT) {
            newBoard[boardY]![boardX] = piece.color
          }
        }
      }
    }

    const completedLines: number[] = []
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      if (newBoard[y]!.every(cell => cell !== null)) {
        completedLines.push(y)
      }
    }

    if (completedLines.length > 0) {
      for (const lineIndex of completedLines) {
        newBoard.splice(lineIndex, 1)
        newBoard.unshift(Array.from({ length: BOARD_WIDTH }, () => null))
      }

      const linePoints = [0, 100, 300, 500, 800]
      score.value += (linePoints[completedLines.length] || 0) * level.value
      lines.value += completedLines.length
      level.value = Math.floor(lines.value / 10) + 1
      updateDropSpeed()
    }

    board.value = newBoard
    spawnPiece()
  }

  function spawnPiece() {
    if (nextPiece.value) {
      currentPiece.value = nextPiece.value
    } else {
      currentPiece.value = createPiece(getNextType())
    }
    nextPiece.value = createPiece(getNextType())

    if (!isValidPosition(currentPiece.value.shape, currentPiece.value.position, board.value)) {
      gameState.value = 'gameover'
      if (score.value > highScore.value) {
        highScore.value = score.value
      }
      stopDropInterval()
    }
  }

  function moveLeft() {
    if (gameState.value !== 'playing' || !currentPiece.value) return
    const newPos = { ...currentPiece.value.position, x: currentPiece.value.position.x - 1 }
    if (isValidPosition(currentPiece.value.shape, newPos, board.value)) {
      currentPiece.value = { ...currentPiece.value, position: newPos }
    }
  }

  function moveRight() {
    if (gameState.value !== 'playing' || !currentPiece.value) return
    const newPos = { ...currentPiece.value.position, x: currentPiece.value.position.x + 1 }
    if (isValidPosition(currentPiece.value.shape, newPos, board.value)) {
      currentPiece.value = { ...currentPiece.value, position: newPos }
    }
  }

  function moveDown(): boolean {
    if (gameState.value !== 'playing' || !currentPiece.value) return false
    const newPos = { ...currentPiece.value.position, y: currentPiece.value.position.y + 1 }
    if (isValidPosition(currentPiece.value.shape, newPos, board.value)) {
      currentPiece.value = { ...currentPiece.value, position: newPos }
      return true
    }
    lockPiece()
    return false
  }

  function hardDrop() {
    if (gameState.value !== 'playing' || !currentPiece.value) return
    let dropDistance = 0
    const piece = currentPiece.value
    while (isValidPosition(piece.shape, { x: piece.position.x, y: piece.position.y + dropDistance + 1 }, board.value)) {
      dropDistance++
    }
    score.value += dropDistance * 2
    currentPiece.value = {
      ...piece,
      position: { ...piece.position, y: piece.position.y + dropDistance },
    }
    lockPiece()
  }

  function rotate() {
    if (gameState.value !== 'playing' || !currentPiece.value) return
    if (currentPiece.value.type === 'O') return

    const rotated = rotateMatrix(currentPiece.value.shape)
    const kicks = [
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: -2, y: 0 },
      { x: 2, y: 0 },
    ]

    for (const kick of kicks) {
      const newPos = {
        x: currentPiece.value.position.x + kick.x,
        y: currentPiece.value.position.y + kick.y,
      }
      if (isValidPosition(rotated, newPos, board.value)) {
        currentPiece.value = { ...currentPiece.value, shape: rotated, position: newPos }
        return
      }
    }
  }

  function getGhostPosition(): Position | null {
    if (!currentPiece.value) return null
    let ghostY = currentPiece.value.position.y
    while (isValidPosition(currentPiece.value.shape, { x: currentPiece.value.position.x, y: ghostY + 1 }, board.value)) {
      ghostY++
    }
    return { x: currentPiece.value.position.x, y: ghostY }
  }

  function getDropSpeed(): number {
    return Math.max(100, 1000 - (level.value - 1) * 80)
  }

  function startDropInterval() {
    stopDropInterval()
    dropInterval = setInterval(() => {
      moveDown()
    }, getDropSpeed())
  }

  function updateDropSpeed() {
    if (gameState.value === 'playing') {
      startDropInterval()
    }
  }

  function stopDropInterval() {
    if (dropInterval) {
      clearInterval(dropInterval)
      dropInterval = null
    }
  }

  function startGame() {
    board.value = createEmptyBoard()
    score.value = 0
    level.value = 1
    lines.value = 0
    bag = []
    currentPiece.value = null
    nextPiece.value = null
    gameState.value = 'playing'
    spawnPiece()
    startDropInterval()
  }

  function togglePause() {
    if (gameState.value === 'playing') {
      gameState.value = 'paused'
      stopDropInterval()
    } else if (gameState.value === 'paused') {
      gameState.value = 'playing'
      startDropInterval()
    }
  }

  const ghostPosition = computed(() => getGhostPosition())

  const displayBoard = computed(() => {
    const display = board.value.map(row => [...row])
    const piece = currentPiece.value
    const ghost = ghostPosition.value

    if (piece && ghost && gameState.value === 'playing') {
      for (let y = 0; y < piece.shape.length; y++) {
        const row = piece.shape[y]
        if (!row) continue
        for (let x = 0; x < row.length; x++) {
          if (row[x]) {
            const ghostY = ghost.y + y
            const ghostX = ghost.x + x
            if (ghostY >= 0 && ghostY < BOARD_HEIGHT && ghostX >= 0 && ghostX < BOARD_WIDTH && !display[ghostY]![ghostX]) {
              display[ghostY]![ghostX] = `ghost:${piece.color}`
            }
          }
        }
      }
    }

    if (piece && gameState.value === 'playing') {
      for (let y = 0; y < piece.shape.length; y++) {
        const row = piece.shape[y]
        if (!row) continue
        for (let x = 0; x < row.length; x++) {
          if (row[x]) {
            const boardY = piece.position.y + y
            const boardX = piece.position.x + x
            if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
              display[boardY]![boardX] = piece.color
            }
          }
        }
      }
    }

    return display
  })

  onUnmounted(() => {
    stopDropInterval()
  })

  return {
    board: displayBoard,
    currentPiece: readonly(currentPiece),
    nextPiece: readonly(nextPiece),
    gameState: readonly(gameState),
    score: readonly(score),
    level: readonly(level),
    lines: readonly(lines),
    highScore: readonly(highScore),
    startGame,
    togglePause,
    moveLeft,
    moveRight,
    moveDown,
    hardDrop,
    rotate,
    BOARD_WIDTH,
    BOARD_HEIGHT,
  }
}
