<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import type { PlayableGame } from '~/stores/games'

defineProps<{
  games: readonly PlayableGame[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  start: [game: PlayableGame]
  remove: [game: PlayableGame]
}>()

const { t } = useI18n()
</script>

<template>
  <ul class="flex flex-col gap-2 w-full">
    <li
      v-for="game in games"
      :key="game.id"
      class="flex gap-2"
    >
      <ShadcnButton
        class="flex-1 justify-between h-auto py-3"
        variant="outline"
        :disabled="disabled"
        @click="emit('start', game)"
      >
        <span class="text-base font-semibold">{{ game.title }}</span>
        <span class="text-muted-foreground text-sm">{{ t('play') }}</span>
      </ShadcnButton>

      <ShadcnAlertDialog v-if="!game.asset">
        <ShadcnAlertDialogTrigger as-child>
          <ShadcnButton
            variant="ghost"
            size="icon"
            class="h-auto"
            :aria-label="t('remove', { title: game.title })"
            :disabled="disabled"
          >
            <Trash2 class="size-4" />
          </ShadcnButton>
        </ShadcnAlertDialogTrigger>
        <ShadcnAlertDialogContent>
          <ShadcnAlertDialogHeader>
            <ShadcnAlertDialogTitle>{{ t('remove', { title: game.title }) }}</ShadcnAlertDialogTitle>
            <ShadcnAlertDialogDescription>{{ t('removeHint') }}</ShadcnAlertDialogDescription>
          </ShadcnAlertDialogHeader>
          <ShadcnAlertDialogFooter>
            <ShadcnAlertDialogCancel>{{ t('cancel') }}</ShadcnAlertDialogCancel>
            <ShadcnAlertDialogAction @click="emit('remove', game)">
              {{ t('confirmRemove') }}
            </ShadcnAlertDialogAction>
          </ShadcnAlertDialogFooter>
        </ShadcnAlertDialogContent>
      </ShadcnAlertDialog>
    </li>
  </ul>
</template>

<i18n lang="yaml">
de:
  play: Spielen
  remove: "{title} entfernen"
  removeHint: Die Spieldatei wird von diesem Gerät gelöscht. Deine Spielstände bleiben erhalten und funktionieren wieder, wenn du die Datei erneut importierst.
  cancel: Abbrechen
  confirmRemove: Entfernen
en:
  play: Play
  remove: "Remove {title}"
  removeHint: The game file is deleted from this device. Your save games stay and work again when you import the file again.
  cancel: Cancel
  confirmRemove: Remove
</i18n>
