<script setup lang="ts">
import { TOUCH_TURN_SENSITIVITY } from '~/stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()

// The slider works on arrays (one value per thumb).
const sensitivity = computed({
  get: () => [settings.touchTurnSensitivity],
  set: ([value]) => {
    if (value !== undefined) settings.touchTurnSensitivity = value
  },
})
</script>

<template>
  <ShadcnDialog>
    <ShadcnDialogTrigger as-child>
      <ShadcnButton variant="ghost">
        {{ t('settings') }}
      </ShadcnButton>
    </ShadcnDialogTrigger>
    <ShadcnDialogContent class="max-w-md">
      <ShadcnDialogHeader>
        <ShadcnDialogTitle>{{ t('settings') }}</ShadcnDialogTitle>
        <ShadcnDialogDescription>{{ t('engineOptions') }}</ShadcnDialogDescription>
      </ShadcnDialogHeader>

      <label class="flex items-center justify-between gap-4">
        <span>{{ t('haptics') }}</span>
        <ShadcnSwitch v-model="settings.haptics" />
      </label>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span>{{ t('turnSensitivity') }}</span>
          <span class="text-muted-foreground tabular-nums">{{ settings.touchTurnSensitivity.toFixed(2) }}×</span>
        </div>
        <ShadcnSlider
          v-model="sensitivity"
          :min="TOUCH_TURN_SENSITIVITY.min"
          :max="TOUCH_TURN_SENSITIVITY.max"
          :step="0.25"
        />
      </div>
    </ShadcnDialogContent>
  </ShadcnDialog>
</template>

<i18n lang="yaml">
de:
  settings: Einstellungen
  engineOptions: Lautstärke, Maus und Tasten stellst du im Spiel unter „Options“ ein.
  haptics: Vibration bei Schuss und Treffer
  turnSensitivity: Drehen per Wischen
en:
  settings: Settings
  engineOptions: Volume, mouse and keys are set in the game under "Options".
  haptics: Vibrate on firing and taking damage
  turnSensitivity: Turning by swipe
</i18n>
