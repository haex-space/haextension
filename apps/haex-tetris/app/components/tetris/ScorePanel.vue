<script setup lang="ts">
defineProps<{
  score: number
  level: number
  lines: number
  highScore: number
}>()
</script>

<template>
  <div class="space-y-4">
    <div v-for="item in [
      { label: 'Score', value: score },
      { label: 'Level', value: level },
      { label: 'Lines', value: lines },
      { label: 'High Score', value: highScore },
    ]" :key="item.label" class="space-y-1">
      <p class="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        {{ item.label }}
      </p>
      <p class="text-2xl font-bold tabular-nums">
        {{ item.value.toLocaleString() }}
      </p>
    </div>
  </div>
</template>
