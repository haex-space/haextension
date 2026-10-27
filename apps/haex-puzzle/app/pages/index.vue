<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { AddResult, LibraryItem, Rejection } from '~/types/puzzle'

const { t } = useI18n()
const library = useLibraryStore()
const { addPictures, adding } = usePictureImport()

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

function onPick(_item: LibraryItem) {
  // The difficulty step and the puzzle follow in the next stories.
}
</script>

<template>
  <div class="h-screen overflow-y-auto p-4 md:p-6">
    <PuzzleLibraryGrid :adding="adding" @add="onAdd" @pick="onPick" />
  </div>
</template>

<i18n lang="yaml">
de:
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
