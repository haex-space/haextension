<script setup lang="ts">
import { ArrowLeft, Maximize } from '@lucide/vue'

const props = defineProps<{
  /** Whether leaving throws away progress (false once the puzzle is complete). */
  confirm: boolean
}>()
const emit = defineEmits<{ leave: []; fit: [] }>()

const { t } = useI18n()
const asking = ref(false)

function onLeave() {
  if (props.confirm) asking.value = true
  else emit('leave')
}
</script>

<template>
  <div class="flex items-center gap-2 px-3 py-2 border-b bg-background">
    <ShadcnButton variant="ghost" class="h-11 sm:h-9" @click="onLeave">
      <ArrowLeft class="w-4 h-4 mr-2" />
      {{ t('newPuzzle') }}
    </ShadcnButton>

    <ShadcnButton
      variant="ghost"
      class="h-11 sm:h-9 ml-auto"
      :aria-label="t('fit')"
      :title="t('fit')"
      @click="emit('fit')"
    >
      <Maximize class="w-4 h-4 sm:mr-2" />
      <span class="hidden sm:inline">{{ t('fit') }}</span>
    </ShadcnButton>

    <ShadcnAlertDialog v-model:open="asking">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>{{ t('leaveTitle') }}</ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>{{ t('leaveHint') }}</ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>{{ t('stay') }}</ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction @click="emit('leave')">
            {{ t('leave') }}
          </ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>
  </div>
</template>

<i18n lang="yaml">
de:
  newPuzzle: Neues Puzzle
  fit: Ganzer Tisch
  leaveTitle: Puzzle verlassen?
  leaveHint: Der Fortschritt dieses Puzzles geht verloren.
  stay: Weiterspielen
  leave: Verlassen
en:
  newPuzzle: New puzzle
  fit: Whole table
  leaveTitle: Leave the puzzle?
  leaveHint: The progress of this puzzle will be lost.
  stay: Keep playing
  leave: Leave
</i18n>
