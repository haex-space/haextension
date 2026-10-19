<script setup lang="ts">
defineProps<{
  score: number
  level: number
  lines: number
  highScore: number
}>()

const { t } = useI18n()
</script>

<template>
  <div class="space-y-4">
    <div v-for="item in [
      { label: t('score'), value: score },
      { label: t('level'), value: level },
      { label: t('lines'), value: lines },
      { label: t('highScore'), value: highScore },
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

<i18n lang="yaml">
de:
  score: Punkte
  level: Level
  lines: Reihen
  highScore: Highscore
en:
  score: Score
  level: Level
  lines: Lines
  highScore: High Score
</i18n>
