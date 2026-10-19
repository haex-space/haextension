import type { Board, GameState, Piece, PieceType } from '~/types/tetris'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PIECE_TYPES,
  createEmptyBoard,
  createPiece,
  dropDistance,
  dropSpeed,
  isValidPosition,
  levelForLines,
  lockPiece,
  renderBoard,
  rotatePiece,
  scoreForLines,
} from '~/lib/tetris'

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

  function lockCurrentPiece() {
    const piece = currentPiece.value
    if (!piece) return

    const result = lockPiece(board.value, piece)
    if (result.clearedLines > 0) {
      score.value += scoreForLines(result.clearedLines, level.value)
      lines.value += result.clearedLines
      level.value = levelForLines(lines.value)
      updateDropSpeed()
    }

    board.value = result.board
    if (result.lockedOut) {
      endGame()
      return
    }
    spawnPiece()
  }

  function endGame() {
    gameState.value = 'gameover'
    if (score.value > highScore.value) {
      highScore.value = score.value
    }
    stopDropInterval()
  }

  function spawnPiece() {
    if (nextPiece.value) {
      currentPiece.value = nextPiece.value
    } else {
      currentPiece.value = createPiece(getNextType())
    }
    nextPiece.value = createPiece(getNextType())

    if (!isValidPosition(currentPiece.value.shape, currentPiece.value.position, board.value)) {
      endGame()
    }
  }

  function tryMove(dx: number, dy: number): boolean {
    const piece = currentPiece.value
    if (gameState.value !== 'playing' || !piece) return false
    const position = { x: piece.position.x + dx, y: piece.position.y + dy }
    if (!isValidPosition(piece.shape, position, board.value)) return false
    currentPiece.value = { ...piece, position }
    return true
  }

  function moveLeft() {
    tryMove(-1, 0)
  }

  function moveRight() {
    tryMove(1, 0)
  }

  function moveDown(): boolean {
    if (gameState.value !== 'playing' || !currentPiece.value) return false
    if (tryMove(0, 1)) return true
    lockCurrentPiece()
    return false
  }

  function hardDrop() {
    const piece = currentPiece.value
    if (gameState.value !== 'playing' || !piece) return
    const distance = dropDistance(piece.shape, piece.position, board.value)
    score.value += distance * 2
    currentPiece.value = {
      ...piece,
      position: { ...piece.position, y: piece.position.y + distance },
    }
    lockCurrentPiece()
  }

  function rotate() {
    if (gameState.value !== 'playing' || !currentPiece.value) return
    const rotated = rotatePiece(currentPiece.value, board.value)
    if (rotated) currentPiece.value = rotated
  }

  function startDropInterval() {
    stopDropInterval()
    dropInterval = setInterval(() => {
      moveDown()
    }, dropSpeed(level.value))
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

  const displayBoard = computed(() =>
    renderBoard(board.value, gameState.value === 'playing' ? currentPiece.value : null),
  )

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
