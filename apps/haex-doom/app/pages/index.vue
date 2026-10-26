<script setup lang="ts">
import { unlockAudio } from '~/lib/audioUnlock'
import { setConfigValue, widescreenFor } from '~/lib/engineConfig'
import { parseSavePath, saveDescription } from '~/lib/saveStore'
import { takeNetAudio } from '~/lib/netAudio'
import type { StartRequest } from '~/lib/lobby'
import { parseTimedemo, type TimedemoResult } from '~/lib/timedemo'
import { loadBundledWad } from '~/lib/wadLoader'
import { toast } from 'vue-sonner'
import type { PlayableGame } from '~/stores/games'

const { t } = useI18n()
const engine = useEngine()
const settings = useSettingsStore()
const saves = useSavesStore()
const games = useGamesStore()
const peers = usePeers()
const lobby = useLobbyStore()

/** The player is setting up a game to host. */
const hosting = ref(false)
const showLobby = computed(() => hosting.value || lobby.active)
watch(() => lobby.active, (active) => {
  if (!active) hosting.value = false
})

onMounted(() => {
  // Multiplayer needs peer channels in the vault; without them its entry stays hidden (SC-007).
  void peers.detect()
  void lobby.loadDisplayName()
  void settings.load()
  games.load().catch((error: unknown) => {
    // The bundled games still work without the vault's list of imported ones.
    console.error('[haex-doom] Could not list imported games:', error)
  })
})

function loadWad(game: PlayableGame): Promise<Uint8Array> {
  return game.asset
    ? loadBundledWad(new URL(game.asset, document.baseURI).href)
    : games.loadImported(game.fingerprint)
}

async function removeGame(game: PlayableGame) {
  try {
    await games.remove(game.fingerprint)
  } catch (error) {
    console.error('[haex-doom] Could not remove', game.title, error)
    toast.error(t('removeFailed'))
  }
}

const hostSupportsEngine = canCompileWebAssembly()
const playing = ref(false)
/** Game file and saves are being read, before the engine itself loads. */
const preparing = ref(false)
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
    } else if (path.startsWith('/config/')) {
      await settings.storeEngineConfig(path.slice('/config/'.length), new TextDecoder().decode(data))
    }
  } catch (error) {
    console.error('[haex-doom] Could not store', path, error)
    if (save) toast.error(t('saveFailed'))
  }
}

/** A save the player deleted in the game's menu goes from the vault too. */
async function onFileRemoved(path: string) {
  const save = parseSavePath(path)
  if (!save) return
  try {
    await saves.remove(save.fingerprint, save.slot)
  }
  catch (error) {
    console.error('[haex-doom] Could not remove', path, error)
    toast.error(t('saveRemoveFailed'))
  }
}

/** `netgame` starts a multiplayer game with the engine arguments the lobby chose; `args` alone adds engine arguments to a single-player game. */
async function startGame(game: PlayableGame, options: { args?: string[], netgame?: boolean } = {}) {
  const { args, netgame } = options
  // Must run inside the tap, before any await (research R-14); a netgame's context was made in the last tap of the lobby.
  const audioContext = netgame ? takeNetAudio() : unlockAudio()
  playing.value = true
  preparing.value = true
  await nextTick()
  const canvas = gameView.value?.canvas
  if (!canvas) {
    preparing.value = false
    void audioContext.close()
    return
  }

  try {
    await settings.load()
    const [wad, configs, gameSaves] = await Promise.all([
      loadWad(game),
      loadDefaultConfigs().then(settings.engineConfigs),
      loadSaves(game.fingerprint),
    ])
    configs['crispy-doom.cfg'] = setConfigValue(
      configs['crispy-doom.cfg'] ?? '',
      'crispy_widescreen',
      widescreenFor(canvas.clientWidth, canvas.clientHeight),
    )
    preparing.value = false
    await engine.start({
      canvas, wad, fileName: game.fileName, fingerprint: game.fingerprint, configs, saves: gameSaves, audioContext,
      args,
      imports: {
        haptic: settings.vibrate,
        fileWritten: (path) => void onFileWritten(path),
        fileRemoved: (path) => void onFileRemoved(path),
        ...(netgame ? peers.session().imports() : {}),
      },
    })
    canvas.focus()
  } catch (error) {
    console.error('[haex-doom] Could not start the game:', error)
    toast.error(t('errors.load-failed'))
    void audioContext.close()
    preparing.value = false
    playing.value = false
    if (netgame) void lobby.leave()
  }
}

/** The lobby started the game: the same game file as the host's runs here, with netgame arguments. */
function onNetgameStart(request: StartRequest) {
  const game = games.all.find(candidate => candidate.fingerprint === request.fingerprint)
  if (!game) {
    toast.error(t('gameMissing'))
    void lobby.leave()
    return
  }
  void startGame(game, { args: request.args, netgame: true })
}

// A hidden speed check (SC-002): seven taps on the title show it. The engine runs `-timedemo demo1`
// as fast as it can and reports game tics per second of real time; 35 is real time.
const titleTaps = ref(0)
const speedCheck = ref(false)
const speedResult = ref<TimedemoResult | null>(null)
const showSpeedCheck = computed(() => titleTaps.value >= 7)

function startSpeedCheck() {
  const game = games.all.find(candidate => candidate.family === 'doom1') ?? games.all[0]
  if (!game) return
  speedResult.value = null
  speedCheck.value = true
  void startGame(game, { args: ['-timedemo', 'demo1'] })
}

watch(engine.lastExit, (reason) => {
  if (!speedCheck.value || !reason) return
  speedCheck.value = false
  speedResult.value = parseTimedemo(reason.message)
  if (!speedResult.value) toast.error(t('speedCheckFailed', { message: reason.message }))
})

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
      v-if="playing && (preparing || engine.state.value === 'loading')"
      class="absolute inset-0 flex items-center justify-center bg-black text-white"
    >
      {{ t('loading') }}
    </div>

    <DoomMultiplayerEvents @start="onNetgameStart" />

    <main
      v-if="!playing"
      class="h-full flex flex-col items-center justify-center gap-6 p-6 max-w-md mx-auto overflow-y-auto"
    >
      <h1
        class="text-4xl font-black tracking-wide"
        @click="titleTaps++"
      >
        DOOM
      </h1>

      <DoomMultiplayerLobby
        v-if="hostSupportsEngine && showLobby"
        @close="hosting = false"
      />
      <p
        v-else-if="!hostSupportsEngine || engine.error.value === 'host-outdated'"
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
          :games="games.all"
          :disabled="engine.state.value === 'loading'"
          @start="startGame"
          @remove="removeGame"
        />
        <DoomImportButton class="w-full" />
        <section
          v-if="peers.available.value"
          class="w-full flex flex-col gap-2"
        >
          <h2 class="text-sm font-semibold text-muted-foreground">
            {{ t('multiplayer') }}
          </h2>
          <div class="flex gap-2">
            <ShadcnButton
              class="flex-1"
              variant="outline"
              :disabled="engine.state.value === 'loading'"
              @click="hosting = true"
            >
              {{ t('hostGame') }}
            </ShadcnButton>
            <DoomJoinByCode />
          </div>
        </section>
      </template>

      <section
        v-if="showSpeedCheck && hostSupportsEngine"
        class="w-full flex flex-col gap-2"
      >
        <ShadcnButton
          variant="outline"
          :disabled="engine.state.value === 'loading'"
          @click="startSpeedCheck"
        >
          {{ t('speedCheck') }}
        </ShadcnButton>
        <p
          v-if="speedResult"
          class="text-center text-sm"
        >
          {{ t('speedResult', { tics: speedResult.ticsPerSecond.toFixed(1), realtics: speedResult.realtics, gametics: speedResult.gametics }) }}
        </p>
      </section>

      <div class="flex gap-2">
        <DoomSettingsDialog />
        <DoomAboutDialog />
      </div>
    </main>
  </div>
</template>

<i18n lang="yaml">
de:
  removeFailed: Die Spieldatei konnte nicht entfernt werden.
  savesUnavailable: Spielstände konnten nicht geladen werden. Das Spiel startet ohne sie.
  saveFailed: Der Spielstand wurde nicht im Vault gespeichert. Bitte versuche es erneut.
  saveRemoveFailed: Der Spielstand wurde nicht aus dem Vault gelöscht und ist beim nächsten Start wieder da.
  loading: Lädt …
  multiplayer: Mehrspieler
  speedCheck: Geschwindigkeitsprüfung (Demo 1)
  speedResult: "{tics} Spiel-Tics pro Sekunde ({gametics} Tics in {realtics} Takten; ab 35 läuft das Spiel in Echtzeit)"
  speedCheckFailed: "Die Prüfung endete ohne Ergebnis: {message}"
  hostGame: Spiel hosten
  gameMissing: Die Spieldatei des Spiels fehlt auf diesem Gerät.
  hostOutdated: Bitte aktualisiere deinen Vault, um DOOM zu spielen. Diese Version erlaubt Erweiterungen noch kein WebAssembly.
  errors:
    load-failed: Das Spiel konnte nicht geladen werden.
    crashed: Das Spiel wurde unerwartet beendet.
    host-outdated: ''
en:
  removeFailed: The game file could not be removed.
  savesUnavailable: Save games could not be loaded. The game starts without them.
  saveFailed: The save game was not stored in the vault. Please try again.
  saveRemoveFailed: The save game was not removed from the vault and will be back next time.
  loading: Loading …
  multiplayer: Multiplayer
  speedCheck: Speed check (demo 1)
  speedResult: "{tics} game tics per second ({gametics} tics in {realtics} ticks; 35 or more runs in real time)"
  speedCheckFailed: "The check ended without a result: {message}"
  hostGame: Host a game
  gameMissing: This device does not have the game file of this game.
  hostOutdated: Please update your vault to play DOOM. This version does not let extensions run WebAssembly yet.
  errors:
    load-failed: The game could not be loaded.
    crashed: The game stopped unexpectedly.
    host-outdated: ''
</i18n>
