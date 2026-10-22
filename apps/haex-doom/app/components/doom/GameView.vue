<script setup lang="ts">
import { resumeIfSuspended } from '~/lib/audioUnlock'

const { t } = useI18n()
const engine = useEngine()

const canvas = ref<HTMLCanvasElement | null>(null)
/** Set when the app went to the background; the player resumes with a tap (FR-006). */
const waitingToContinue = ref(false)

// Keys the frame would otherwise use to scroll or move focus away from the game.
const CAPTURED_KEYS = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'])

function onKeydown(event: KeyboardEvent) {
  if (CAPTURED_KEYS.has(event.code) || /^F\d+$/.test(event.code)) event.preventDefault()
  resumeIfSuspended(engine.audioContext())
}

function onBlur() {
  engine.setPaused(true)
}

function onFocus() {
  if (!waitingToContinue.value) engine.setPaused(false)
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
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
  <div class="relative w-full h-full bg-black">
    <!-- SDL2 finds its canvas through the selector `#canvas`. -->
    <canvas
      id="canvas"
      ref="canvas"
      tabindex="0"
      class="block w-full h-full object-contain outline-none"
      @keydown="onKeydown"
      @pointerdown="resumeIfSuspended(engine.audioContext())"
      @contextmenu.prevent
    />
    <div
      v-if="waitingToContinue"
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
en:
  continue: Continue
</i18n>
