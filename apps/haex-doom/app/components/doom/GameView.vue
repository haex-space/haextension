<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { resumeIfSuspended } from '~/lib/audioUnlock'

const { t } = useI18n()
const engine = useEngine()
const { mode } = useInputMode()

const lobby = useLobbyStore()
/** A multiplayer game cannot be paused: the others keep playing (FR-006, FR-033). */
const netgame = computed(() => lobby.phase === 'running')

const portrait = useMediaQuery('(orientation: portrait)')
/** Phones are played in landscape (FR-013); the game waits while the device is upright. */
const askToRotate = computed(() => mode.value === 'touch' && portrait.value)

const canvas = ref<HTMLCanvasElement | null>(null)
const container = ref<HTMLElement | null>(null)
const { lock } = usePointerLock(canvas)
const fullscreen = useFullscreen(container)
/** Set when the app went to the background; the player resumes with a tap (FR-006). */
const waitingToContinue = ref(false)

// Keys the frame would otherwise use to scroll or move focus away from the game.
const CAPTURED_KEYS = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'])

function onKeydown(event: KeyboardEvent) {
  if (CAPTURED_KEYS.has(event.code) || /^F\d+$/.test(event.code)) event.preventDefault()
  resumeIfSuspended(engine.audioContext())
}

function onBlur() {
  if (!netgame.value) engine.setPaused(true)
}

function onFocus() {
  if (!netgame.value && !waitingToContinue.value && !askToRotate.value) engine.setPaused(false)
}

// Losing the gamepad in the middle of a single-player game pauses it until the player continues (US7).
useGamepad(() => {
  if (netgame.value) return
  engine.setPaused(true)
  waitingToContinue.value = true
})

watch(askToRotate, (rotate) => {
  if (netgame.value) return
  if (rotate) engine.setPaused(true)
  else if (!waitingToContinue.value) engine.setPaused(false)
})

function onVisibilityChange() {
  if (!netgame.value && document.visibilityState === 'hidden') {
    engine.setPaused(true)
    waitingToContinue.value = true
  }
}

function continueGame() {
  waitingToContinue.value = false
  resumeIfSuspended(engine.audioContext())
  engine.setPaused(false)
  canvas.value?.focus()
}

onMounted(() => {
  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('focus', onFocus)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

defineExpose({ canvas })
</script>

<template>
  <div
    ref="container"
    class="relative w-full h-full bg-black"
  >
    <!-- SDL2 finds its canvas through the selector `#canvas`. -->
    <canvas
      id="canvas"
      ref="canvas"
      tabindex="0"
      class="block w-full h-full object-contain outline-none"
      @keydown="onKeydown"
      @pointerdown="resumeIfSuspended(engine.audioContext()); lock($event)"
      @contextmenu.prevent
    />
    <DoomFullscreenButton
      v-if="fullscreen.available.value && mode !== 'touch'"
      :active="fullscreen.active.value"
      @toggle="fullscreen.toggle"
    />
    <DoomTouchOverlay v-if="mode === 'touch' && !askToRotate && !waitingToContinue" />
    <div
      v-if="askToRotate"
      class="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-white"
    >
      {{ t('rotate') }}
    </div>
    <div
      v-else-if="waitingToContinue"
      class="absolute inset-0 flex items-center justify-center bg-black/70"
    >
      <ShadcnButton
        size="lg"
        @click="continueGame"
      >
        {{ t('continue') }}
      </ShadcnButton>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  continue: Weiterspielen
  rotate: Bitte dreh dein Gerät ins Querformat.
en:
  continue: Continue
  rotate: Please turn your device to landscape.
</i18n>
