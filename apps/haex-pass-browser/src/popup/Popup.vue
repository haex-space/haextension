<script setup lang="ts">
import { Plus, Settings } from '@lucide/vue'
import { useBookmarkSync } from '~/composables/useBookmarkSync'
import { useI18n } from '~/locales'
import logoUrl from '../../extension/assets/haex-pass-logo.png'
import ConnectionStatus from './components/ConnectionStatus.vue'
import CreateEntryForm from './components/CreateEntryForm.vue'

const { t } = useI18n()

const connectionStatusRef = ref<InstanceType<typeof ConnectionStatus> | null>(null)
const showCreateForm = ref(false)

const isPaired = computed(() => connectionStatusRef.value?.canSendRequests ?? false)

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

const {
  status: bookmarkStatus,
  switchTargetId: bookmarkSwitchTargetId,
  switchError: bookmarkSwitchError,
  switching: bookmarkSwitching,
  syncing: bookmarkSyncing,
  otherCollections: otherBookmarkCollections,
  switchTarget: bookmarkSwitchTarget,
  switchLocked: bookmarkSwitchLocked,
  loadStatus: loadBookmarkStatus,
  loadCollections: loadBookmarkCollections,
  syncNow: handleBookmarkSyncNow,
  confirmSwitch,
} = useBookmarkSync()
const bookmarkSwitcherOpen = ref(false)

async function toggleBookmarkSwitcher() {
  bookmarkSwitcherOpen.value = !bookmarkSwitcherOpen.value
  bookmarkSwitchTargetId.value = null
  bookmarkSwitchError.value = null
  if (bookmarkSwitcherOpen.value)
    await loadBookmarkCollections()
}

async function confirmBookmarkSwitch() {
  if (await confirmSwitch())
    bookmarkSwitcherOpen.value = false
}

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
