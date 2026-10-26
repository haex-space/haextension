<script setup lang="ts">
import { toast } from 'vue-sonner'
import { engineNet } from '~/lib/engineNet'
import type { Notice, StartRequest } from '~/lib/lobby'

const emit = defineEmits<{ start: [request: StartRequest] }>()

const { t } = useI18n()
const engine = useEngine()
const lobby = useLobbyStore()

/** The last engine run was a netgame, and whether the player was already told why it ended. */
let endedNetgame = false
let toldWhy = false

function describe(notice: Notice): string {
  switch (notice.kind) {
    case 'guest-left': return t('notices.guest-left', { name: notice.name })
    case 'rejected': return t(`notices.rejected.${notice.reason}`)
    case 'incompatible': return t(`notices.incompatible.${notice.reason}`, { game: notice.game })
    default: return t(`notices.${notice.kind}`)
  }
}

watch(() => lobby.notice, (notice) => {
  if (!notice) return
  toldWhy = true
  toast.info(describe(notice))
})

watch(() => lobby.startRequest, (request) => {
  if (!request) return
  toldWhy = false
  lobby.clearStartRequest()
  emit('start', request)
})

// The session ends with the engine: the host's quit ends the game for all (FR-032).
watch(engine.state, (state) => {
  if (state === 'loading') endedNetgame = false
  if (state !== 'idle' && state !== 'failed') return
  endedNetgame = lobby.phase === 'running'
  void lobby.engineStopped()
})

// A consistency failure or another error stops the game for everyone with a notice (FR-034).
const exit = engineNet(engine).lastExit
if (exit) {
  watch(exit, (reason) => {
    if (reason?.isError && !toldWhy && (lobby.phase === 'running' || endedNetgame)) {
      toast.error(t('gameEnded', { message: reason.message }))
    }
  })
}
</script>

<template>
  <span class="hidden" />
</template>

<i18n lang="yaml">
de:
  gameEnded: "Das Spiel wurde beendet: {message}"
  notices:
    guest-left: "{name} hat das Spiel verlassen."
    host-left: Der Gastgeber hat das Spiel beendet.
    connection-lost: Die Verbindung zum Gastgeber ist abgebrochen.
    invalid-invitation: Diese Einladung stammt nicht von einer passenden DOOM-Version.
    busy: Du spielst gerade. Schließe das Spiel und lass dich erneut einladen.
    rejected:
      game-missing: Du hast das Spiel des Gastgebers nicht.
      version: Du und der Gastgeber habt verschiedene DOOM-Versionen. Aktualisiert die Erweiterung.
      full: Das Spiel ist voll.
      removed: Der Gastgeber hat dich aus dem Spiel entfernt.
    incompatible:
      game-missing: "Du kannst nicht beitreten: Dir fehlt die Spieldatei „{game}“. Importiere sie unter „Eigene Spieldatei importieren“."
      version: Du kannst nicht beitreten: Du und der Gastgeber habt verschiedene DOOM-Versionen. Aktualisiert die Erweiterung.
en:
  gameEnded: "The game ended: {message}"
  notices:
    guest-left: "{name} left the game."
    host-left: The host ended the game.
    connection-lost: The connection to the host was lost.
    invalid-invitation: This invitation does not come from a matching DOOM version.
    busy: You are playing right now. Close the game and ask to be invited again.
    rejected:
      game-missing: You do not have the host's game.
      version: You and the host have different DOOM versions. Please update the extension.
      full: The game is full.
      removed: The host removed you from the game.
    incompatible:
      game-missing: "You cannot join: the game file \"{game}\" is missing. Import it with \"Import your own game file\"."
      version: You cannot join: you and the host have different DOOM versions. Please update the extension.
</i18n>
