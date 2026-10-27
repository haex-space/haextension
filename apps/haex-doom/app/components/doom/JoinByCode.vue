<script setup lang="ts">
import { cleanName } from '~/lib/lobbyProtocol'
import { prepareNetAudio } from '~/lib/netAudio'

const { t } = useI18n()
const lobby = useLobbyStore()

const open = ref(false)
const code = ref('')
const name = ref('')
const joining = ref(false)
const error = ref<string | null>(null)

const ready = computed(() => code.value.trim().length > 0 && cleanName(name.value, 64).length > 0)

// The vault offers no name of its own, so the one used last is suggested.
watch(open, async (isOpen) => {
  if (!isOpen) return
  error.value = null
  await lobby.loadDisplayName()
  if (!name.value) name.value = lobby.displayName
})

async function join() {
  if (!ready.value || joining.value) return
  // The game later starts without a tap of its own; its audio is unlocked here (research R-14).
  prepareNetAudio()
  joining.value = true
  error.value = null
  const player = cleanName(name.value, 64)
  const result = await lobby.join(code.value, player)
  joining.value = false
  if (result === 'ok') {
    void lobby.rememberDisplayName(player)
    open.value = false
    code.value = ''
  } else {
    error.value = t(`errors.${result}`)
  }
}
</script>

<template>
  <ShadcnDialog v-model:open="open">
    <ShadcnDialogTrigger as-child>
      <button
        type="button"
        class="doom-btn"
      >
        {{ t('join') }}
      </button>
    </ShadcnDialogTrigger>
    <ShadcnDialogContent class="max-w-md">
      <ShadcnDialogHeader>
        <ShadcnDialogTitle>{{ t('join') }}</ShadcnDialogTitle>
        <ShadcnDialogDescription>{{ t('hint') }}</ShadcnDialogDescription>
      </ShadcnDialogHeader>

      <form
        class="flex flex-col gap-3"
        @submit.prevent="join"
      >
        <label class="flex flex-col gap-1">
          <span class="text-sm text-muted-foreground">{{ t('code') }}</span>
          <ShadcnInput
            v-model="code"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm text-muted-foreground">{{ t('name') }}</span>
          <ShadcnInput
            v-model="name"
            maxlength="32"
            autocomplete="nickname"
          />
        </label>
        <p
          v-if="error"
          class="text-sm text-destructive"
          role="alert"
        >
          {{ error }}
        </p>
        <ShadcnButton
          type="submit"
          :disabled="!ready || joining"
        >
          {{ joining ? t('joining') : t('joinButton') }}
        </ShadcnButton>
      </form>
    </ShadcnDialogContent>
  </ShadcnDialog>
</template>

<i18n lang="yaml">
de:
  join: Mit Code beitreten
  hint: Gib den Beitrittscode des Gastgebers ein. Dein Name ist für die anderen sichtbar; er wird nicht überprüft, sofern du kein Kontakt des Gastgebers bist.
  code: Beitrittscode
  name: Dein Name
  joinButton: Beitreten
  joining: Tritt bei …
  errors:
    lobby_closed: Dieses Spiel ist nicht mehr offen.
    not_admitted: Nur Kontakte des Gastgebers können beitreten, oder du wurdest aus diesem Spiel entfernt.
    network_unavailable: Der Gastgeber ist nicht erreichbar.
    limit: Zu viele offene Spiele oder Mitspieler.
    busy: Du kannst gerade nicht beitreten.
    failed: Die Verbindung zum Spiel ist fehlgeschlagen.
en:
  join: Join with a code
  hint: Enter the join code of the host. Your name is visible to the others; it is not verified unless you are a contact of the host.
  code: Join code
  name: Your name
  joinButton: Join
  joining: Joining …
  errors:
    lobby_closed: This game is no longer open.
    not_admitted: Only the host's contacts may join, or you were removed from this game.
    network_unavailable: The host cannot be reached.
    limit: Too many open games or players.
    busy: You cannot join right now.
    failed: The connection to the game failed.
</i18n>
