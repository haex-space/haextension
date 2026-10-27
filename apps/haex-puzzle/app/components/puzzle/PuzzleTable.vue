<script setup lang="ts">
import { drawTable, type TableColors } from '~/lib/drawTable'
import { fitView } from '~/lib/zoomPan'
import type { PuzzleApi } from '~/composables/usePuzzle'
import type { View } from '~/types/puzzle'

const props = defineProps<{ puzzle: PuzzleApi }>()

const container = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const size = ref({ width: 0, height: 0 })
const view = ref<View>({ scale: 1, x: 0, y: 0 })
/** Bumped when the theme changes, so the table is drawn again in the new colours. */
const themeVersion = ref(0)

const PADDING = 8

const table = computed(() => {
  void props.puzzle.version.value
  return props.puzzle.state.value?.table ?? null
})

function refit() {
  const area = table.value
  if (!area || size.value.width === 0) return
  const fitted = fitView(
    { width: size.value.width - 2 * PADDING, height: size.value.height - 2 * PADDING },
    { width: area.width, height: area.height },
  )
  view.value = { scale: fitted.scale, x: fitted.x + PADDING, y: fitted.y + PADDING }
}

/** A colour of the host's theme for the canvas, or a fallback when the variable is no usable colour. */
function themeColor(context: CanvasRenderingContext2D, name: string, fallback: string): string {
  const value = getComputedStyle(canvas.value!).getPropertyValue(name).trim()
  if (!value) return fallback
  context.fillStyle = '#010203'
  context.fillStyle = value
  return context.fillStyle === '#010203' ? fallback : value
}

let frame = 0
function request() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    render()
  })
}

function render() {
  const element = canvas.value
  const { state, sprites, image } = props.puzzle
  if (!element || !state.value || !sprites.value || !image.value) return
  const ratio = window.devicePixelRatio || 1
  const width = Math.round(size.value.width * ratio)
  const height = Math.round(size.value.height * ratio)
  if (element.width !== width || element.height !== height) {
    element.width = width
    element.height = height
  }
  const context = element.getContext('2d')!
  const colors: TableColors = {
    table: themeColor(context, '--muted', 'rgba(128, 128, 128, 0.15)'),
    frame: themeColor(context, '--muted-foreground', 'rgba(128, 128, 128, 0.7)'),
  }
  drawTable(context, {
    state: state.value, sprites: sprites.value, image: image.value, view: view.value,
    colors, ratio, width: size.value.width, height: size.value.height,
  })
}

usePuzzleInput({ canvas, puzzle: props.puzzle, view, table })

watch([() => props.puzzle.version.value, view, size, themeVersion], request)
watch(size, refit)

let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

onMounted(() => {
  const element = container.value!
  size.value = { width: element.clientWidth, height: element.clientHeight }
  resizeObserver = new ResizeObserver(() => {
    size.value = { width: element.clientWidth, height: element.clientHeight }
  })
  resizeObserver.observe(element)
  themeObserver = new MutationObserver(() => { themeVersion.value++ })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  refit()
  request()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <div ref="container" class="relative w-full h-full overflow-hidden">
    <canvas
      ref="canvas"
      class="absolute inset-0 w-full h-full select-none cursor-grab"
      style="touch-action: none"
    />
  </div>
</template>
