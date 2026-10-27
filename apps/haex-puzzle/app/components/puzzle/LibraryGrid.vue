<script setup lang="ts">
import { Check, ImageOff, ListChecks, Plus, Trash2, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { LibraryItem } from '~/types/puzzle'

defineProps<{ adding?: boolean }>()
const emit = defineEmits<{ add: []; pick: [item: LibraryItem] }>()

const { t } = useI18n()
const library = useLibraryStore()

const selecting = ref(false)
const selected = ref<Set<string>>(new Set())
const confirming = ref(false)
const removing = ref(false)

// Thumbnails as object URLs: made when an item appears, revoked when it goes and on unmount.
const urls = reactive(new Map<string, string>())

function thumbnailUrl(item: LibraryItem): string {
  const isJpeg = item.thumbnail[0] === 0xff && item.thumbnail[1] === 0xd8
  return URL.createObjectURL(new Blob([item.thumbnail as BlobPart], { type: isJpeg ? 'image/jpeg' : 'image/webp' }))
}

watch(
  () => library.items,
  (items) => {
    const present = new Set(items.map(item => item.id))
    for (const [id, url] of urls) {
      if (present.has(id)) continue
      URL.revokeObjectURL(url)
      urls.delete(id)
    }
    for (const item of items) {
      if (!urls.has(item.id)) urls.set(item.id, thumbnailUrl(item))
    }
    selected.value = new Set([...selected.value].filter(id => present.has(id)))
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
})

function toggleSelecting() {
  selecting.value = !selecting.value
  selected.value = new Set()
}

function toggle(id: string) {
  const next = new Set(selected.value)
  if (!next.delete(id)) next.add(id)
  selected.value = next
}

function selectAll() {
  selected.value = new Set(library.items.map(item => item.id))
}

function onCard(item: LibraryItem) {
  if (selecting.value) toggle(item.id)
  else emit('pick', item)
}

async function removeSelected() {
  const ids = [...selected.value]
  removing.value = true
  try {
    await library.remove(ids)
    confirming.value = false
    selecting.value = false
    selected.value = new Set()
  } catch (error) {
    // A removal is all or nothing: every picture is still there.
    console.error('[haex-puzzle] Could not remove pictures:', error)
    confirming.value = false
    toast.error(t('removeFailed', { count: ids.length }, ids.length))
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold mr-auto">
        {{ t('title') }}
      </h1>

      <template v-if="selecting">
        <ShadcnButton variant="outline" size="sm" class="h-11 sm:h-8" @click="selectAll">
          <ListChecks class="w-4 h-4 mr-2" />
          {{ t('selectAll') }}
        </ShadcnButton>
        <ShadcnButton
          variant="destructive"
          size="sm" class="h-11 sm:h-8"
          :disabled="selected.size === 0"
          @click="confirming = true"
        >
          <Trash2 class="w-4 h-4 mr-2" />
          {{ t('remove', { count: selected.size }) }}
        </ShadcnButton>
        <ShadcnButton variant="ghost" size="sm" class="h-11 sm:h-8" @click="toggleSelecting">
          <X class="w-4 h-4 mr-2" />
          {{ t('cancel') }}
        </ShadcnButton>
      </template>
      <template v-else>
        <ShadcnButton
          v-if="library.items.length > 0"
          variant="outline"
          size="sm" class="h-11 sm:h-8"
          @click="toggleSelecting"
        >
          <ListChecks class="w-4 h-4 mr-2" />
          {{ t('select') }}
        </ShadcnButton>
        <ShadcnButton size="sm" class="h-11 sm:h-8" :disabled="adding" @click="emit('add')">
          <Plus class="w-4 h-4 mr-2" />
          {{ t('add') }}
        </ShadcnButton>
      </template>
    </div>

    <div
      v-if="library.items.length === 0 && !library.loading"
      class="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground"
    >
      <p class="text-lg">
        {{ t('emptyTitle') }}
      </p>
      <p class="text-sm max-w-sm">
        {{ t('emptyHint') }}
      </p>
      <ShadcnButton size="lg" :disabled="adding" @click="emit('add')">
        <Plus class="w-5 h-5 mr-2" />
        {{ t('add') }}
      </ShadcnButton>
    </div>

    <ul v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      <li v-for="item in library.items" :key="item.id">
        <button
          type="button"
          class="group relative block w-full text-left rounded-lg overflow-hidden border bg-card focus-visible:outline-2 focus-visible:outline-ring"
          :class="selected.has(item.id) ? 'ring-2 ring-primary' : ''"
          :aria-pressed="selecting ? selected.has(item.id) : undefined"
          :aria-label="item.name"
          @click="onCard(item)"
        >
          <div class="aspect-[4/3] bg-muted">
            <img
              v-if="urls.get(item.id)"
              :src="urls.get(item.id)"
              :alt="item.name"
              class="w-full h-full object-cover"
              :class="library.unusable.has(item.id) ? 'opacity-30' : ''"
              loading="lazy"
              draggable="false"
            >
          </div>
          <div
            v-if="library.unusable.has(item.id)"
            class="absolute inset-x-0 top-0 aspect-[4/3] flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
          >
            <ImageOff class="w-6 h-6" />
            {{ t('unusable') }}
          </div>
          <div
            v-if="selecting"
            class="absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center bg-background/80"
            :class="selected.has(item.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground'"
          >
            <Check v-if="selected.has(item.id)" class="w-4 h-4" />
          </div>
          <p class="px-2 py-1.5 text-xs truncate">
            {{ item.name }}
          </p>
        </button>
      </li>
    </ul>

    <ShadcnAlertDialog v-model:open="confirming">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>{{ t('removeTitle', { count: selected.size }, selected.size) }}</ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>{{ t('removeHint', selected.size) }}</ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>{{ t('cancel') }}</ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction :disabled="removing" @click.prevent="removeSelected">
            {{ t('confirmRemove') }}
          </ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>
  </div>
</template>

<i18n lang="yaml">
de:
  title: Meine Bilder
  add: Bild hinzufügen
  select: Auswählen
  selectAll: Alle auswählen
  cancel: Abbrechen
  remove: "Entfernen ({count})"
  emptyTitle: Noch keine Bilder
  emptyHint: Füge ein Bild hinzu. Es bleibt in deiner Bibliothek, bis du es entfernst.
  unusable: Nicht lesbar
  removeTitle: "{count} Bild entfernen? | {count} Bilder entfernen?"
  removeHint: Das Bild wird endgültig aus der Bibliothek gelöscht. Deine Originaldatei bleibt unberührt. | Die Bilder werden endgültig aus der Bibliothek gelöscht. Deine Originaldateien bleiben unberührt.
  confirmRemove: Entfernen
  removeFailed: "Das Bild konnte nicht entfernt werden und bleibt in der Bibliothek. | Die {count} Bilder konnten nicht entfernt werden und bleiben in der Bibliothek."
en:
  title: My pictures
  add: Add picture
  select: Select
  selectAll: Select all
  cancel: Cancel
  remove: "Remove ({count})"
  emptyTitle: No pictures yet
  emptyHint: Add a picture. It stays in your library until you remove it.
  unusable: Unreadable
  removeTitle: "Remove {count} picture? | Remove {count} pictures?"
  removeHint: The picture is deleted from the library for good. Your original file is not touched. | The pictures are deleted from the library for good. Your original files are not touched.
  confirmRemove: Remove
  removeFailed: "The picture could not be removed and stays in the library. | The {count} pictures could not be removed and stay in the library."
</i18n>
