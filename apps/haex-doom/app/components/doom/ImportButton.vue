<script setup lang="ts">
import { toast } from 'vue-sonner'

const { t } = useI18n()
const games = useGamesStore()

const input = ref<HTMLInputElement | null>(null)
const importing = ref(false)

// A plain file input needs no permission and no round trip through the vault (research R-9).
async function onPicked() {
  const file = input.value?.files?.[0]
  if (input.value) input.value.value = ''
  if (!file) return

  importing.value = true
  try {
    const result = await games.importFile(file)
    if (result.ok) toast.success(t('imported', { title: result.title }))
    else toast.error(t(`rejected.${result.reason}`))
  } catch (error) {
    console.error('[haex-doom] Could not import the game file:', error)
    toast.error(t('failed'))
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div>
    <input
      ref="input"
      type="file"
      accept=".wad,.WAD"
      class="hidden"
      @change="onPicked"
    >
    <button
      type="button"
      class="doom-btn w-full"
      :disabled="importing"
      @click="input?.click()"
    >
      {{ importing ? t('importing') : t('import') }}
    </button>
  </div>
</template>

<i18n lang="yaml">
de:
  import: Eigene Spieldatei importieren
  importing: Wird importiert …
  imported: "{title} ist jetzt verfügbar."
  failed: Die Datei konnte nicht importiert werden.
  rejected:
    too-small: Das ist keine DOOM-Spieldatei.
    not-wad: Das ist keine DOOM-Spieldatei.
    too-large: Die Datei ist zu groß für eine DOOM-Spieldatei.
    pwad: Das ist eine Modifikation, keine Spieldatei. Mods werden noch nicht unterstützt.
    truncated: Die Datei ist beschädigt oder unvollständig.
    unknown-game: Diese Spieldatei enthält kein bekanntes DOOM-Spiel.
    already-available: Dieses Spiel ist schon verfügbar.
    storage-failed: Die Datei konnte nicht im Vault gespeichert werden.
en:
  import: Import your own game file
  importing: Importing …
  imported: "{title} is now available."
  failed: The file could not be imported.
  rejected:
    too-small: This is not a DOOM game file.
    not-wad: This is not a DOOM game file.
    too-large: The file is too large for a DOOM game file.
    pwad: This is a modification, not a game file. Mods are not supported yet.
    truncated: The file is damaged or incomplete.
    unknown-game: This game file does not contain a known DOOM game.
    already-available: This game is already available.
    storage-failed: The file could not be stored in the vault.
</i18n>
