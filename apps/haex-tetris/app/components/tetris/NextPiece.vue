<script setup lang="ts">
const props = defineProps<{
  piece: { type: string; shape: readonly (readonly number[])[]; color: string } | null
}>()

const displayGrid = computed(() => {
  if (!props.piece) return []
  return props.piece.shape
})
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm font-medium text-muted-foreground uppercase tracking-wider">
      Next
    </p>
    <div class="p-3 rounded-lg border border-border bg-background/50">
      <div
        v-if="piece"
        class="grid gap-[1px] w-fit mx-auto"
        :style="{ gridTemplateColumns: `repeat(${displayGrid[0]?.length ?? 0}, 1.25rem)` }"
      >
        <div
          v-for="(cell, index) in displayGrid.flat()"
          :key="index"
          class="w-5 h-5 rounded-[2px]"
          :style="cell ? {
            backgroundColor: piece.color,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15), inset 2px 2px 4px rgba(255,255,255,0.2)',
          } : {}"
        />
      </div>
    </div>
  </div>
</template>
