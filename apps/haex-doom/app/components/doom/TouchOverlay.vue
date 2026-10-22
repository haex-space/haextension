<script setup lang="ts">
import type { Component } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { buttonMask, stickToAxes, swipeToTurn, type StickAxes, type VirtualButton } from '~/lib/touchMapping'

const EV_MOUSE = 2
const EV_JOYSTICK = 3
const STICK_RADIUS = 56

const { t } = useI18n()
const engine = useEngine()
const settings = useSettingsStore()

const pressed = reactive(new Set<VirtualButton>())
const axes = ref<StickAxes>({ strafe: 0, move: 0, directions: 0 })

/** The floating stick: where the left thumb went down and where it is now. */
const stick = ref<{ pointerId: number, originX: number, originY: number, x: number, y: number } | null>(null)
const turn = ref<{ pointerId: number, lastX: number, carry: number } | null>(null)

// The engine keeps the last joystick state, so it only needs to hear about changes.
function sendJoystick() {
  const { move, strafe, directions } = axes.value
  engine.postEvent(EV_JOYSTICK, buttonMask(pressed), 0, move, strafe, 0, directions)
}

function onStickDown(event: PointerEvent) {
  if (stick.value) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  stick.value = { pointerId: event.pointerId, originX: event.clientX, originY: event.clientY, x: event.clientX, y: event.clientY }
}

function onStickMove(event: PointerEvent) {
  if (stick.value?.pointerId !== event.pointerId) return
  stick.value.x = event.clientX
  stick.value.y = event.clientY
  const next = stickToAxes(event.clientX - stick.value.originX, event.clientY - stick.value.originY, STICK_RADIUS)
  if (next.move !== axes.value.move || next.strafe !== axes.value.strafe || next.directions !== axes.value.directions) {
    axes.value = next
    sendJoystick()
  }
}

function onStickUp(event: PointerEvent) {
  if (stick.value?.pointerId !== event.pointerId) return
  stick.value = null
  axes.value = { strafe: 0, move: 0, directions: 0 }
  sendJoystick()
}

/** Where the knob is drawn, kept inside the stick's ring. */
const knobOffset = computed(() => {
  if (!stick.value) return { x: 0, y: 0 }
  const dx = stick.value.x - stick.value.originX
  const dy = stick.value.y - stick.value.originY
  const scale = Math.min(1, STICK_RADIUS / (Math.hypot(dx, dy) || 1))
  return { x: dx * scale, y: dy * scale }
})

function onTurnDown(event: PointerEvent) {
  if (turn.value) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  turn.value = { pointerId: event.pointerId, lastX: event.clientX, carry: 0 }
}

function onTurnMove(event: PointerEvent) {
  if (turn.value?.pointerId !== event.pointerId) return
  const step = swipeToTurn(event.clientX - turn.value.lastX, settings.touchTurnSensitivity, turn.value.carry)
  turn.value.lastX = event.clientX
  turn.value.carry = step.carry
  if (step.turn !== 0) engine.postEvent(EV_MOUSE, 0, step.turn)
}

function onTurnUp(event: PointerEvent) {
  if (turn.value?.pointerId === event.pointerId) turn.value = null
}

function press(button: VirtualButton, event: PointerEvent) {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  pressed.add(button)
  sendJoystick()
}

function release(button: VirtualButton) {
  if (!pressed.delete(button)) return
  sendJoystick()
}

onBeforeUnmount(() => {
  pressed.clear()
  axes.value = { strafe: 0, move: 0, directions: 0 }
  sendJoystick()
})

interface ButtonSpec { id: VirtualButton, class: string, icon?: Component }

// Corners only, so the centre of the picture stays visible (FR-012).
const BUTTONS: ButtonSpec[] = [
  { id: 'fire', class: 'right-6 bottom-24 size-20 text-base' },
  { id: 'use', class: 'right-30 bottom-10 size-16 text-sm' },
  { id: 'prevWeapon', class: 'right-30 bottom-32 size-11 text-xs', icon: ChevronLeft },
  { id: 'nextWeapon', class: 'right-6 bottom-48 size-11 text-xs', icon: ChevronRight },
  { id: 'automap', class: 'right-20 top-4 size-11 text-xs' },
  { id: 'menu', class: 'right-4 top-4 size-11 text-xs' },
]
</script>

<template>
  <div class="absolute inset-0 select-none touch-none">
    <div
      class="absolute left-0 top-0 bottom-0 w-1/2"
      @pointerdown="onStickDown"
      @pointermove="onStickMove"
      @pointerup="onStickUp"
      @pointercancel="onStickUp"
    >
      <div
        v-if="stick"
        class="absolute rounded-full border-2 border-white/40 bg-white/10 pointer-events-none"
        :style="{ width: `${STICK_RADIUS * 2}px`, height: `${STICK_RADIUS * 2}px`, left: `${stick.originX - STICK_RADIUS}px`, top: `${stick.originY - STICK_RADIUS}px` }"
      >
        <div
          class="absolute size-12 rounded-full bg-white/50"
          :style="{ left: `${STICK_RADIUS - 24 + knobOffset.x}px`, top: `${STICK_RADIUS - 24 + knobOffset.y}px` }"
        />
      </div>
    </div>

    <div
      class="absolute right-0 top-0 bottom-0 w-1/2"
      @pointerdown="onTurnDown"
      @pointermove="onTurnMove"
      @pointerup="onTurnUp"
      @pointercancel="onTurnUp"
    />

    <button
      v-for="button in BUTTONS"
      :key="button.id"
      type="button"
      class="absolute rounded-full border-2 border-white/50 bg-black/30 text-white/90 font-semibold backdrop-blur-sm"
      :class="[button.class, pressed.has(button.id) ? 'bg-white/40' : '']"
      :aria-label="t(`names.${button.id}`)"
      @pointerdown.stop="press(button.id, $event)"
      @pointerup="release(button.id)"
      @pointercancel="release(button.id)"
      @contextmenu.prevent
    >
      <component
        :is="button.icon"
        v-if="button.icon"
        class="size-5 mx-auto"
      />
      <template v-else>
        {{ t(`labels.${button.id}`) }}
      </template>
    </button>
  </div>
</template>

<i18n lang="yaml">
de:
  labels:
    fire: Feuer
    use: Benutzen
    automap: Karte
    menu: Menü
  names:
    fire: Feuer
    use: Benutzen
    prevWeapon: Vorherige Waffe
    nextWeapon: Nächste Waffe
    automap: Karte
    menu: Menü
en:
  labels:
    fire: Fire
    use: Use
    automap: Map
    menu: Menu
  names:
    fire: Fire
    use: Use
    prevWeapon: Previous weapon
    nextWeapon: Next weapon
    automap: Map
    menu: Menu
</i18n>
