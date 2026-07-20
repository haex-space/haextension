<script setup lang="ts">
import type { BookmarkStatus } from '~/bookmarks/messages'
import type { BookmarkCollectionSummary } from '~/bookmarks/vaultClient'
import { Plus, Settings } from 'lucide-vue-next'
import { BOOKMARKS_GET_STATUS, BOOKMARKS_LIST_COLLECTIONS, BOOKMARKS_SWITCH_COLLECTION, BOOKMARKS_SYNC_NOW } from '~/bookmarks/messages'
import { useI18n } from '~/locales'
import logoUrl from '../../extension/assets/haex-pass-logo.png'
import ConnectionStatus from './components/ConnectionStatus.vue'
import CreateEntryForm from './components/CreateEntryForm.vue'

const { t } = useI18n()

const connectionStatusRef = ref<InstanceType<typeof ConnectionStatus> | null>(null)
const showCreateForm = ref(false)

const isPaired = computed(() => connectionStatusRef.value?.canSendRequests ?? false)

// Check if we should show CreateEntryForm on mount (set by content script)
onMounted(async () => {
  try {
    const result = await browser.storage.local.get('showCreateEntryForm')
    if (result.showCreateEntryForm) {
      showCreateForm.value = true
      // Clear the flag
      await browser.storage.local.remove('showCreateEntryForm')
    }
  } catch (err) {
    console.error('Failed to check showCreateEntryForm flag:', err)
  }
  await loadBookmarkStatus()
})

function openOptions() {
  browser.runtime.openOptionsPage()
}

function openCreateForm() {
  showCreateForm.value = true
}

function closeCreateForm() {
  showCreateForm.value = false
}

// -----------------------------------------------------------------------
// Bookmark quick switcher
// -----------------------------------------------------------------------

const bookmarkStatus = ref<BookmarkStatus | null>(null)
const bookmarkSyncing = ref(false)
const bookmarkSwitcherOpen = ref(false)
const bookmarkCollections = ref<BookmarkCollectionSummary[]>([])
const bookmarkSwitchTargetId = ref<string | null>(null)
const bookmarkSwitching = ref(false)
const bookmarkSwitchError = ref<string | null>(null)

const bookmarkActiveCollectionId = computed(() => (bookmarkStatus.value?.mode === 'active' ? bookmarkStatus.value.collectionId : null))
const otherBookmarkCollections = computed(() => bookmarkCollections.value.filter(c => c.id !== bookmarkActiveCollectionId.value))
const bookmarkSwitchTarget = computed(() => bookmarkCollections.value.find(c => c.id === bookmarkSwitchTargetId.value) ?? null)
const bookmarkSwitchLocked = computed(() => bookmarkStatus.value?.mode === 'active' && bookmarkStatus.value.dirty)

async function loadBookmarkStatus() {
  try {
    const response = (await browser.runtime.sendMessage({ type: BOOKMARKS_GET_STATUS })) as {
      success: boolean
      data?: { status: BookmarkStatus | null }
    }
    bookmarkStatus.value = response?.data?.status ?? null
  } catch {
    bookmarkStatus.value = null
  }
}

async function handleBookmarkSyncNow() {
  bookmarkSyncing.value = true
  try {
    await browser.runtime.sendMessage({ type: BOOKMARKS_SYNC_NOW })
    await loadBookmarkStatus()
  } finally {
    bookmarkSyncing.value = false
  }
}

async function toggleBookmarkSwitcher() {
  bookmarkSwitcherOpen.value = !bookmarkSwitcherOpen.value
  bookmarkSwitchTargetId.value = null
  bookmarkSwitchError.value = null
  if (bookmarkSwitcherOpen.value) {
    try {
      const response = (await browser.runtime.sendMessage({ type: BOOKMARKS_LIST_COLLECTIONS })) as {
        success: boolean
        data?: { collections: BookmarkCollectionSummary[] }
      }
      if (response?.success && response.data)
        bookmarkCollections.value = response.data.collections
    } catch {
      bookmarkCollections.value = []
    }
  }
}

async function confirmBookmarkSwitch() {
  const target = bookmarkSwitchTarget.value
  if (!target)
    return
  bookmarkSwitching.value = true
  bookmarkSwitchError.value = null
  try {
    const response = (await browser.runtime.sendMessage({
      type: BOOKMARKS_SWITCH_COLLECTION,
      collectionId: target.id,
      collectionName: target.name,
    })) as { success: boolean, error?: string }
    if (response?.success) {
      bookmarkSwitcherOpen.value = false
      await loadBookmarkStatus()
    } else {
      bookmarkSwitchError.value = response?.error ?? t('settings.bookmarks.error.generic')
    }
  } catch (err) {
    bookmarkSwitchError.value = String(err)
  } finally {
    bookmarkSwitching.value = false
  }
}
</script>

<template>
  <main class="w-[320px] p-4 bg-background text-foreground">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-4">
      <img :src="logoUrl" alt="haex-pass" class="w-10 h-10">
      <div>
        <h1 class="text-lg font-semibold">
          {{ t('extension.name') }}
        </h1>
        <p class="text-xs text-muted-foreground">
          {{ t('extension.description') }}
        </p>
      </div>
    </div>

    <!-- Connection Status -->
    <ConnectionStatus ref="connectionStatusRef" />

    <!-- Quick Actions (when paired) -->
    <div v-if="isPaired && !showCreateForm" class="space-y-3 mb-4">
      <p class="text-xs text-muted-foreground">
        {{ t('hint.autoFillActive') }}
      </p>

      <!-- Create Entry Button -->
      <button
        class="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90"
        @click="openCreateForm"
      >
        <Plus class="w-4 h-4" />
        {{ t('createEntry.label') }}
      </button>
    </div>

    <!-- Create Entry Form -->
    <CreateEntryForm v-if="showCreateForm" @close="closeCreateForm" />

    <!-- Bookmark quick switcher -->
    <div v-if="isPaired && !showCreateForm && bookmarkStatus?.mode === 'active'" class="mb-4 rounded-md border p-2 text-xs space-y-2">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0 truncate">
          <span class="text-muted-foreground">{{ t('settings.bookmarks.collection') }}:</span> {{ bookmarkStatus.collectionName }}
        </div>
        <button class="shrink-0 px-2 py-0.5 rounded border hover:bg-accent" :disabled="bookmarkSyncing" @click="handleBookmarkSyncNow">
          {{ t('settings.bookmarks.syncNow') }}
        </button>
      </div>
      <button class="w-full px-2 py-1 rounded border hover:bg-accent" @click="toggleBookmarkSwitcher">
        {{ t('settings.bookmarks.switchCollection') }}
      </button>

      <div v-if="bookmarkSwitcherOpen" class="space-y-2">
        <p v-if="otherBookmarkCollections.length === 0" class="text-muted-foreground italic">
          {{ t('settings.bookmarks.noOtherCollections') }}
        </p>
        <select v-else v-model="bookmarkSwitchTargetId" class="w-full rounded border bg-background px-2 py-1">
          <option :value="null" disabled>
            {{ t('settings.bookmarks.switchExisting') }}
          </option>
          <option v-for="collection in otherBookmarkCollections" :key="collection.id" :value="collection.id">
            {{ collection.name }} ({{ collection.bookmarkCount }})
          </option>
        </select>
        <p v-if="bookmarkSwitchTarget" class="text-amber-500">
          {{ t('settings.bookmarks.replaceWarning', { name: bookmarkSwitchTarget.name }) }}
        </p>
        <p v-if="bookmarkSwitchLocked" class="text-muted-foreground">
          {{ t('settings.bookmarks.lockedWhileDirty') }}
        </p>
        <p v-if="bookmarkSwitchError" class="text-red-500">
          {{ bookmarkSwitchError }}
        </p>
        <button
          class="w-full px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
          :disabled="!bookmarkSwitchTarget || bookmarkSwitchLocked || bookmarkSwitching"
          @click="confirmBookmarkSwitch"
        >
          {{ t('settings.bookmarks.confirmSwitch') }}
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div class="pt-3 border-t mt-4">
      <button
        class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        @click="openOptions"
      >
        <Settings class="w-3 h-3" />
        {{ t('button.settings') }}
      </button>
    </div>
  </main>
</template>
