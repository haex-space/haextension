<script setup lang="ts">
import type { BundledGame } from '~/lib/bundledGames'

defineProps<{
  games: readonly BundledGame[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  start: [game: BundledGame]
}>()

const { t } = useI18n()
</script>

<template>
  <ul class="flex flex-col gap-2 w-full">
    <li
      v-for="game in games"
      :key="game.id"
    >
      <ShadcnButton
        class="w-full justify-between h-auto py-3"
        variant="outline"
        :disabled="disabled"
        @click="emit('start', game)"
      >
        <span class="text-base font-semibold">{{ game.title }}</span>
        <span class="text-muted-foreground text-sm">{{ t('play') }}</span>
      </ShadcnButton>
    </li>
  </ul>
</template>

<i18n lang="yaml">
de:
  play: Spielen
en:
  play: Play
</i18n>
