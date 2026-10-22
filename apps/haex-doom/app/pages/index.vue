<script setup lang="ts">
import { unlockAudio } from '~/lib/audioUnlock'
import { BUNDLED_GAMES, type BundledGame } from '~/lib/bundledGames'
import { setConfigValue, widescreenFor } from '~/lib/engineConfig'
import { parseSavePath, saveDescription } from '~/lib/saveStore'
import { loadBundledWad } from '~/lib/wadLoader'
import { toast } from 'vue-sonner'

const { t } = useI18n()
const engine = useEngine()
const settings = useSettingsStore()
const saves = useSavesStore()

onMounted(() => {
  void settings.load()
})

const hostSupportsEngine = canCompileWebAssembly()
const playing = ref(false)
const gameView = ref<{ canvas: HTMLCanvasElement | null } | null>(null)

async function loadDefaultConfigs(): Promise<Record<string, string>> {
  const names = ['default.cfg', 'crispy-doom.cfg']
  const texts = await Promise.all(names.map(async (name) => {
    const response = await fetch(new URL(`engine/config/${name}`, document.baseURI))
    if (!response.ok) throw new Error(`Could not load ${name}: HTTP ${response.status}`)
    return response.text()
  }))
  return Object.fromEntries(names.map((name, i) => [name, texts[i]!]))
}

/** Saves of the game, or none when the vault cannot be read; the game still starts. */
async function loadSaves(fingerprint: string): Promise<Map<number, Uint8Array>> {
  try {
    return await saves.listForGame(fingerprint)
  } catch (error) {
    console.error('[haex-doom] Could not load saves:', error)
    toast.error(t('savesUnavailable'))
    return new Map()
  }
}

/** Stores what the engine wrote: save games in the vault, config files on the device. */
async function onFileWritten(path: string) {
  const data = engine.readFile(path)
  if (!data) return
  const save = parseSavePath(path)
  try {
    if (save) {
      await saves.upsert(save.fingerprint, save.slot, saveDescription(data), data)
    }
    else if (path.startsWith('/config/')) {
      await settings.storeEngineConfig(path.slice('/config/'.length), new TextDecoder().decode(data))
    }
  }
  catch (error) {
    console.error('[haex-doom] Could not store', path, error)
    if (save) toast.error(t('saveFailed'))
  }
}

async function startGame(game: BundledGame) {
  // Must run inside the tap, before any await (research R-14).
  const audioContext = unlockAudio()
  playing.value = true
  await nextTick()
  const canvas = gameView.value?.canvas
  if (!canvas) return

  try {
    await settings.load()
    const [wad, configs, gameSaves] = await Promise.all([
      loadBundledWad(new URL(game.asset, document.baseURI).href),
      loadDefaultConfigs().then(settings.engineConfigs),
      loadSaves(game.fingerprint),
    ])
    configs['crispy-doom.cfg'] = setConfigValue(
      configs['crispy-doom.cfg'] ?? '',
      'crispy_widescreen',
      widescreenFor(canvas.clientWidth, canvas.clientHeight),
    )
    await engine.start({
      canvas, wad, fileName: game.fileName, fingerprint: game.fingerprint, configs, saves: gameSaves, audioContext,
      imports: { haptic: settings.vibrate, fileWritten: (path) => void onFileWritten(path) },
    })
    canvas.focus()
  } catch (error) {
    console.error('[haex-doom] Could not start the game:', error)
    playing.value = false
  }
}

// Back to the start screen when the engine quits or fails.
watch(engine.state, (state) => {
  if (state === 'idle' || state === 'failed') playing.value = false
})
</script>

<template>
  <div class="h-screen w-full overflow-hidden select-none">
    <DoomGameView
      v-if="playing"
      ref="gameView"
    />
    <div
      v-if="playing && engine.state.value === 'loading'"
      class="absolute inset-0 flex items-center justify-center bg-black text-white"
    >
      {{ t('loading') }}
    </div>

    <main
      v-if="!playing"
      class="h-full flex flex-col items-center justify-center gap-6 p-6 max-w-md mx-auto"
    >
      <h1 class="text-4xl font-black tracking-wide">
        DOOM
      </h1>

      <p
        v-if="!hostSupportsEngine || engine.error.value === 'host-outdated'"
        class="text-center text-destructive"
      >
        {{ t('hostOutdated') }}
      </p>
      <template v-else>
        <p
          v-if="engine.error.value"
          class="text-center text-destructive"
        >
          {{ t(`errors.${engine.error.value}`) }}
        </p>
        <DoomGameList
          :games="BUNDLED_GAMES"
          :disabled="engine.state.value === 'loading'"
          @start="startGame"
        />
      </template>

      <div class="flex gap-2">
        <DoomSettingsDialog />
        <DoomAboutDialog />
      </div>
    </main>
  </div>
</template>

<i18n lang="yaml">
de:
  savesUnavailable: Spielstände konnten nicht geladen werden. Das Spiel startet ohne sie.
  saveFailed: Der Spielstand wurde nicht im Vault gespeichert. Bitte versuche es erneut.
  loading: Lädt …
  hostOutdated: Bitte aktualisiere deinen Vault, um DOOM zu spielen. Diese Version erlaubt Erweiterungen noch kein WebAssembly.
  errors:
    load-failed: Das Spiel konnte nicht geladen werden.
    crashed: Das Spiel wurde unerwartet beendet.
    host-outdated: ''
en:
  savesUnavailable: Save games could not be loaded. The game starts without them.
  saveFailed: The save game was not stored in the vault. Please try again.
  loading: Loading …
  hostOutdated: Please update your vault to play DOOM. This version does not let extensions run WebAssembly yet.
  errors:
    load-failed: The game could not be loaded.
    crashed: The game stopped unexpectedly.
    host-outdated: ''
</i18n>
