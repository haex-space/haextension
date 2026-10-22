<script setup lang="ts">
import { unlockAudio } from '~/lib/audioUnlock'
import { BUNDLED_GAMES, type BundledGame } from '~/lib/bundledGames'
import { setConfigValue, widescreenFor } from '~/lib/engineConfig'
import { loadBundledWad } from '~/lib/wadLoader'

const { t } = useI18n()
const engine = useEngine()
const settings = useSettingsStore()

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

async function startGame(game: BundledGame) {
  // Must run inside the tap, before any await (research R-14).
  const audioContext = unlockAudio()
  playing.value = true
  await nextTick()
  const canvas = gameView.value?.canvas
  if (!canvas) return

  try {
    const [wad, configs] = await Promise.all([
      loadBundledWad(new URL(game.asset, document.baseURI).href),
      loadDefaultConfigs(),
    ])
    configs['crispy-doom.cfg'] = setConfigValue(
      configs['crispy-doom.cfg'] ?? '',
      'crispy_widescreen',
      widescreenFor(canvas.clientWidth, canvas.clientHeight),
    )
    await engine.start({
      canvas, wad, fileName: game.fileName, fingerprint: game.fingerprint, configs, audioContext,
      imports: { haptic: settings.vibrate },
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
  loading: Lädt …
  hostOutdated: Bitte aktualisiere deinen Vault, um DOOM zu spielen. Diese Version erlaubt Erweiterungen noch kein WebAssembly.
  errors:
    load-failed: Das Spiel konnte nicht geladen werden.
    crashed: Das Spiel wurde unerwartet beendet.
    host-outdated: ''
en:
  loading: Loading …
  hostOutdated: Please update your vault to play DOOM. This version does not let extensions run WebAssembly yet.
  errors:
    load-failed: The game could not be loaded.
    crashed: The game stopped unexpectedly.
    host-outdated: ''
</i18n>
