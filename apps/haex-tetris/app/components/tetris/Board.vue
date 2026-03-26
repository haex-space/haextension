<script setup lang="ts">
import type { TetrisCell } from '~/types/tetris'

defineProps<{
  board: TetrisCell[][]
  boardWidth: number
  boardHeight: number
}>()

function getCellStyle(cell: TetrisCell) {
  if (!cell) return {}
  if (cell.startsWith('ghost:')) {
    return {
      backgroundColor: cell.replace('ghost:', ''),
      opacity: 0.2,
    }
  }
  return {
    backgroundColor: cell,
    boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.15), inset 2px 2px 4px rgba(255,255,255,0.2)`,
  }
}
</script>

<template>
  <div
    class="grid border-2 border-border rounded-lg overflow-hidden bg-background/50"
    :style="{
      gridTemplateColumns: `repeat(${boardWidth}, 1fr)`,
      aspectRatio: `${boardWidth} / ${boardHeight}`,
    }"
  >
    <div
      v-for="(cell, index) in board.flat()"
      :key="index"
      class="aspect-square border border-border/20 transition-colors duration-75"
      :class="[
        cell && !cell.startsWith('ghost:') ? 'rounded-[2px]' : '',
      ]"
      :style="getCellStyle(cell)"
    />
  </div>
</template>
