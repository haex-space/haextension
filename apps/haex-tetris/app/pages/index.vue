<script setup lang="ts">
import { Pause, Play, RotateCcw } from 'lucide-vue-next'

const {
  board,
  nextPiece,
  gameState,
  score,
  level,
  lines,
  highScore,
  startGame,
  togglePause,
  moveLeft,
  moveRight,
  moveDown,
  hardDrop,
  rotate,
  BOARD_WIDTH,
  BOARD_HEIGHT,
} = useTetris()

function handleKeydown(e: KeyboardEvent) {
  if (gameState.value === 'idle' || gameState.value === 'gameover') {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      startGame()
    }
    return
  }

  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
      e.preventDefault()
      moveLeft()
      break
    case 'ArrowRight':
    case 'd':
      e.preventDefault()
      moveRight()
      break
    case 'ArrowDown':
    case 's':
      e.preventDefault()
      moveDown()
      break
    case 'ArrowUp':
    case 'w':
      e.preventDefault()
      rotate()
      break
    case ' ':
      e.preventDefault()
      hardDrop()
      break
    case 'p':
    case 'Escape':
      e.preventDefault()
      togglePause()
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="h-screen flex flex-col items-center justify-center p-4 select-none">
    <div class="flex gap-6 items-start max-h-full">
      <!-- Board + Controls Column -->
      <div class="flex flex-col items-center">
        <div class="relative w-[min(55vw,280px)] md:w-[min(40vw,320px)]">
          <TetrisBoard
            :board="board"
            :board-width="BOARD_WIDTH"
            :board-height="BOARD_HEIGHT"
          />

          <!-- Overlay: Idle / GameOver / Paused -->
          <div
            v-if="gameState !== 'playing'"
            class="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg"
          >
            <template v-if="gameState === 'gameover'">
              <p class="text-2xl font-bold mb-2">
                Game Over
              </p>
              <p class="text-muted-foreground mb-4">
                Score: {{ score.toLocaleString() }}
              </p>
            </template>
            <template v-else-if="gameState === 'paused'">
              <p class="text-2xl font-bold mb-4">
                Paused
              </p>
            </template>
            <template v-else>
              <p class="text-3xl font-bold mb-2">
                Tetris
              </p>
              <p class="text-muted-foreground mb-4 text-sm">
                haex edition
              </p>
            </template>

            <ShadcnButton
              v-if="gameState === 'idle' || gameState === 'gameover'"
              size="lg"
              @click="startGame"
            >
              <Play class="w-5 h-5 mr-2" />
              {{ gameState === 'gameover' ? 'Play Again' : 'Start Game' }}
            </ShadcnButton>
            <ShadcnButton
              v-if="gameState === 'paused'"
              size="lg"
              @click="togglePause"
            >
              <Play class="w-5 h-5 mr-2" />
              Resume
            </ShadcnButton>
          </div>
        </div>

        <!-- Touch Controls (mobile) -->
        <TetrisControls
          @left="moveLeft"
          @right="moveRight"
          @down="moveDown"
          @rotate="rotate"
          @drop="hardDrop"
        />
      </div>

      <!-- Side Panel -->
      <div class="flex flex-col gap-4 min-w-[120px]">
        <TetrisNextPiece :piece="nextPiece" />
        <TetrisScorePanel
          :score="score"
          :level="level"
          :lines="lines"
          :high-score="highScore"
        />

        <div v-if="gameState === 'playing'" class="flex flex-col gap-2 pt-2">
          <ShadcnButton variant="outline" size="sm" @click="togglePause">
            <Pause class="w-4 h-4 mr-2" />
            Pause
          </ShadcnButton>
          <ShadcnButton variant="ghost" size="sm" @click="startGame">
            <RotateCcw class="w-4 h-4 mr-2" />
            Restart
          </ShadcnButton>
        </div>

        <!-- Keyboard hints -->
        <div class="hidden md:block text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
          <p><kbd class="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">&larr;&rarr;</kbd> Move</p>
          <p><kbd class="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">&uarr;</kbd> Rotate</p>
          <p><kbd class="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">&darr;</kbd> Soft Drop</p>
          <p><kbd class="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Space</kbd> Hard Drop</p>
          <p><kbd class="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">P</kbd> Pause</p>
        </div>
      </div>
    </div>
  </div>
</template>
