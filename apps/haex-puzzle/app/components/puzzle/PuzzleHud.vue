<script setup lang="ts">
import { ArrowLeft, Eye, EyeOff, Maximize } from '@lucide/vue'
import { formatElapsed } from '~/lib/formatTime'

const props = defineProps<{
  /** Whether leaving throws away progress (false once the puzzle is complete). */
  confirm: boolean
  elapsedMs: number
}>()
const preview = defineModel<boolean>('preview', { default: false })
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

    <span class="ml-auto tabular-nums text-sm font-medium" :aria-label="t('time')" role="timer">
      {{ formatElapsed(elapsedMs) }}
    </span>

    <ShadcnButton
      variant="ghost"
      class="h-11 sm:h-9"
      :aria-pressed="preview"
      :aria-label="t('preview')"
      :title="t('preview')"
      @click="preview = !preview"
    >
      <component :is="preview ? EyeOff : Eye" class="w-4 h-4 sm:mr-2" />
      <span class="hidden sm:inline">{{ t('preview') }}</span>
    </ShadcnButton>

    <ShadcnButton
      variant="ghost"
      class="h-11 sm:h-9"
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
  preview: Vorschau
  time: Zeit
  leaveTitle: Puzzle verlassen?
  leaveHint: Der Fortschritt dieses Puzzles geht verloren.
  stay: Weiterspielen
  leave: Verlassen
en:
  newPuzzle: New puzzle
  fit: Whole table
  preview: Preview
  time: Time
  leaveTitle: Leave the puzzle?
  leaveHint: The progress of this puzzle will be lost.
  stay: Keep playing
  leave: Leave
</i18n>
