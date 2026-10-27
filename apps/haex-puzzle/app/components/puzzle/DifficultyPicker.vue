<script setup lang="ts">
import { DIFFICULTIES, availableDifficulties } from '~/lib/difficulty'
import type { DifficultyId } from '~/types/puzzle'

const props = defineProps<{ width: number; height: number }>()
const model = defineModel<DifficultyId>({ required: true })

const { t } = useI18n()
const available = computed(() => new Set(availableDifficulties(props.width, props.height)))
</script>

<template>
  <div role="radiogroup" :aria-label="t('label')" class="grid grid-cols-2 gap-2">
    <button
      v-for="level in DIFFICULTIES"
      :key="level.id"
      type="button"
      role="radio"
      :aria-checked="model === level.id"
      :disabled="!available.has(level.id)"
      class="flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 disabled:cursor-not-allowed"
      :class="model === level.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted'"
      @click="model = level.id"
    >
      <span class="font-medium">{{ t(`level.${level.id}`) }}</span>
      <span class="text-xs text-muted-foreground">
        {{ available.has(level.id) ? t('pieces', { count: level.target }, level.target) : t('tooSmall') }}
      </span>
    </button>
  </div>
</template>

<i18n lang="yaml">
de:
  label: Schwierigkeit
  level:
    easy: Leicht
    medium: Mittel
    hard: Schwer
    expert: Experte
  pieces: "ca. {count} Teil | ca. {count} Teile"
  tooSmall: Für dieses Bild zu klein
en:
  label: Difficulty
  level:
    easy: Easy
    medium: Medium
    hard: Hard
    expert: Expert
  pieces: "about {count} piece | about {count} pieces"
  tooSmall: Too small for this picture
</i18n>
