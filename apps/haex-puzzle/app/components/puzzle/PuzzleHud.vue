<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'

const props = defineProps<{
  /** Whether leaving throws away progress (false once the puzzle is complete). */
  confirm: boolean
}>()
const emit = defineEmits<{ leave: [] }>()

const { t } = useI18n()
const asking = ref(false)

function onLeave() {
  if (props.confirm) asking.value = true
  else emit('leave')
}
</script>

<template>
  <div class="flex items-center gap-2 px-3 py-2 border-b bg-background">
    <ShadcnButton variant="ghost" size="sm" @click="onLeave">
      <ArrowLeft class="w-4 h-4 mr-2" />
      {{ t('newPuzzle') }}
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
  leaveTitle: Puzzle verlassen?
  leaveHint: Der Fortschritt dieses Puzzles geht verloren.
  stay: Weiterspielen
  leave: Verlassen
en:
  newPuzzle: New puzzle
  leaveTitle: Leave the puzzle?
  leaveHint: The progress of this puzzle will be lost.
  stay: Keep playing
  leave: Leave
</i18n>
