<script setup lang="ts">
import { formatElapsed } from '~/lib/formatTime'

defineProps<{ open: boolean; elapsedMs: number }>()
const emit = defineEmits<{ again: []; leave: []; 'update:open': [open: boolean] }>()

const { t } = useI18n()
</script>

<template>
  <ShadcnDialog :open="open" @update:open="emit('update:open', $event)">
    <ShadcnDialogContent class="sm:max-w-sm text-center">
      <ShadcnDialogHeader>
        <ShadcnDialogTitle class="text-2xl">
          {{ t('solved') }}
        </ShadcnDialogTitle>
        <ShadcnDialogDescription>{{ t('time', { time: formatElapsed(elapsedMs) }) }}</ShadcnDialogDescription>
      </ShadcnDialogHeader>
      <ShadcnDialogFooter class="sm:justify-center gap-2">
        <ShadcnButton variant="outline" @click="emit('leave')">
          {{ t('newPuzzle') }}
        </ShadcnButton>
        <ShadcnButton @click="emit('again')">
          {{ t('again') }}
        </ShadcnButton>
      </ShadcnDialogFooter>
    </ShadcnDialogContent>
  </ShadcnDialog>
</template>

<i18n lang="yaml">
de:
  solved: Geschafft!
  time: "Deine Zeit: {time}"
  again: Nochmal spielen
  newPuzzle: Neues Puzzle
en:
  solved: Solved!
  time: "Your time: {time}"
  again: Play again
  newPuzzle: New puzzle
</i18n>
