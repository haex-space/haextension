<script setup lang="ts">
import { toast } from 'vue-sonner'
import { availableDifficulties, difficultyById } from '~/lib/difficulty'
import { chooseGrid } from '~/lib/grid'
import type { AddResult, DifficultyId, LibraryItem, Rejection } from '~/types/puzzle'

const { t } = useI18n()
const library = useLibraryStore()
const { addPictures, adding } = usePictureImport()
const puzzle = usePuzzle()
// A hook for trying the app by script when it runs standalone (`HAEX_STANDALONE=1 pnpm dev`); never in a release build.
if (useStandalone()) (window as unknown as { __puzzle: unknown }).__puzzle = puzzle
const { state: puzzleState, phase, loading: starting, finishedMs } = puzzle

/** Whether the finished-puzzle dialog was closed; the next puzzle shows it again. */
const dismissed = ref(false)

onMounted(async () => {
  try {
    await library.load()
  } catch (error) {
    console.error('[haex-puzzle] Could not load the library:', error)
    toast.error(t('loadFailed'))
  }
})

/** One message for everything that went wrong in a multi-file add (US3 scenario 8). */
function summarize(results: AddResult[]) {
  const failed = results.filter((r): r is Extract<AddResult, { ok: false }> => !r.ok)
  const added = results.filter(r => r.ok && !r.duplicate).length
  if (failed.length > 0) {
    const reasons = [...new Set(failed.map(f => t(`reason.${f.reason as Rejection}`)))].join(' ')
    toast.error(t('someFailed', { names: failed.map(f => f.name).join(', '), reasons }, failed.length))
  } else if (added === 0 && results.length > 0) {
    toast.info(t('alreadyThere'))
  }
}

async function onAdd() {
  try {
    const results = await addPictures({ title: t('selectTitle'), images: t('images') })
    summarize(results)
  } catch (error) {
    console.error('[haex-puzzle] Could not add pictures:', error)
    toast.error(t('addFailed'))
  }
}

// The step between the library and the puzzle: which level for the picked picture.
const picked = ref<LibraryItem | null>(null)
const choosing = computed({
  get: () => picked.value !== null,
  set: (open) => { if (!open) picked.value = null },
})
const difficulty = ref<DifficultyId>('easy')

function onPick(item: LibraryItem) {
  picked.value = item
  // The easiest level is always available: pictures too small for it are refused when added.
  if (!availableDifficulties(item.width, item.height).includes(difficulty.value)) difficulty.value = 'easy'
}

const grid = computed(() => picked.value
  ? chooseGrid(picked.value.width, picked.value.height, difficultyById(difficulty.value).target)
  : null)

async function start() {
  const item = picked.value
  if (!item) return
  try {
    await puzzle.begin(item, difficulty.value)
    dismissed.value = false
    picked.value = null
  } catch (error) {
    console.error('[haex-puzzle] Could not start the puzzle:', error)
    toast.error(t('openFailed'))
  }
}

function playAgain() {
  puzzle.restart()
  dismissed.value = false
}

function leave() {
  puzzle.leave()
}
</script>

<template>
  <div v-if="puzzleState" class="h-screen flex flex-col">
    <PuzzleHud :confirm="phase !== 'complete'" @leave="leave" />
    <div class="flex-1 min-h-0">
      <PuzzleTable :puzzle="puzzle" />
    </div>
    <PuzzleCompleteDialog
      :open="phase === 'complete' && !dismissed"
      :elapsed-ms="finishedMs"
      @update:open="dismissed = !$event"
      @again="playAgain"
      @leave="leave"
    />
  </div>

  <div v-else class="h-screen overflow-y-auto p-4 md:p-6">
    <PuzzleLibraryGrid :adding="adding" @add="onAdd" @pick="onPick" />

    <ShadcnDialog v-model:open="choosing">
      <ShadcnDialogContent v-if="picked" class="sm:max-w-md">
        <ShadcnDialogHeader>
          <ShadcnDialogTitle class="truncate">
            {{ picked.name }}
          </ShadcnDialogTitle>
          <ShadcnDialogDescription>{{ t('chooseHint') }}</ShadcnDialogDescription>
        </ShadcnDialogHeader>

        <PuzzleDifficultyPicker v-model="difficulty" :width="picked.width" :height="picked.height" />
        <p v-if="grid" class="text-sm text-muted-foreground">
          {{ t('grid', { columns: grid.columns, rows: grid.rows, count: grid.columns * grid.rows }, grid.columns * grid.rows) }}
        </p>

        <ShadcnDialogFooter>
          <ShadcnButton :disabled="starting" @click="start">
            {{ starting ? t('starting') : t('start') }}
          </ShadcnButton>
        </ShadcnDialogFooter>
      </ShadcnDialogContent>
    </ShadcnDialog>
  </div>
</template>

<i18n lang="yaml">
de:
  chooseHint: Wie schwer soll das Puzzle werden?
  grid: "{columns} × {rows} = {count} Teil | {columns} × {rows} = {count} Teile"
  start: Puzzle starten
  starting: Wird vorbereitet …
  openFailed: Das Bild konnte nicht geöffnet werden. Entferne es aus der Bibliothek und füge es erneut hinzu.
  selectTitle: Bilder auswählen
  images: Bilder
  loadFailed: Die Bibliothek konnte nicht geladen werden.
  addFailed: Die Bilder konnten nicht hinzugefügt werden.
  alreadyThere: Dieses Bild ist schon in der Bibliothek.
  someFailed: "{names} konnte nicht verwendet werden. {reasons} | {names} konnten nicht verwendet werden. {reasons}"
  reason:
    unsupported: Die Datei ist kein lesbares Bild.
    too-large: Das Bild ist zu groß.
    too-small: Das Bild ist zu klein für ein Puzzle.
    storage-failed: Es konnte nicht gespeichert werden.
    read-failed: Die Datei konnte nicht gelesen werden.
en:
  chooseHint: How hard should the puzzle be?
  grid: "{columns} × {rows} = {count} piece | {columns} × {rows} = {count} pieces"
  start: Start puzzle
  starting: Preparing …
  openFailed: The picture could not be opened. Remove it from the library and add it again.
  selectTitle: Select pictures
  images: Pictures
  loadFailed: The library could not be loaded.
  addFailed: The pictures could not be added.
  alreadyThere: This picture is already in the library.
  someFailed: "{names} could not be used. {reasons} | {names} could not be used. {reasons}"
  reason:
    unsupported: The file is not a readable picture.
    too-large: The picture is too large.
    too-small: The picture is too small for a puzzle.
    storage-failed: It could not be stored.
    read-failed: The file could not be read.
</i18n>
