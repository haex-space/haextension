import type { BookmarkStatus } from '~/bookmarks/messages'
import type { BookmarkCollectionSummary } from '~/bookmarks/vaultClient'
import { computed, ref } from 'vue'
import { BOOKMARKS_GET_STATUS, BOOKMARKS_LIST_COLLECTIONS, BOOKMARKS_SWITCH_COLLECTION, BOOKMARKS_SYNC_NOW, shownBookmarkError } from '~/bookmarks/messages'
import { useI18n } from '~/locales'

/** Bookmark sync status and the collection switcher, as Popup and Options show them. */
export function useBookmarkSync() {
  const { t } = useI18n()

  const status = ref<BookmarkStatus | null>(null)
  const collections = ref<BookmarkCollectionSummary[]>([])
  const switchTargetId = ref<string | null>(null)
  const switchError = ref<string | null>(null)
  const switching = ref(false)
  const syncing = ref(false)

  const activeCollectionId = computed(() => (status.value?.mode === 'active' ? status.value.collectionId : null))
  const otherCollections = computed(() => collections.value.filter(c => c.id !== activeCollectionId.value))
  const switchTarget = computed(() => collections.value.find(c => c.id === switchTargetId.value) ?? null)
  // Switching replaces the native tree, so it waits until local edits are pushed.
  const switchLocked = computed(() => status.value?.mode === 'active' && status.value.dirty)

  async function loadStatus() {
    try {
      const response = (await browser.runtime.sendMessage({ type: BOOKMARKS_GET_STATUS })) as {
        success: boolean
        data?: { status: BookmarkStatus | null }
      }
      status.value = response?.data?.status ?? null
    } catch {
      status.value = null
    }
  }

  async function loadCollections() {
    try {
      const response = (await browser.runtime.sendMessage({ type: BOOKMARKS_LIST_COLLECTIONS })) as {
        success: boolean
        data?: { collections: BookmarkCollectionSummary[] }
      }
      if (response?.success && response.data)
        collections.value = response.data.collections
    } catch {
      collections.value = []
    }
  }

  async function syncNow() {
    syncing.value = true
    try {
      await browser.runtime.sendMessage({ type: BOOKMARKS_SYNC_NOW })
      await loadStatus()
    } finally {
      syncing.value = false
    }
  }

  /** Switches to the chosen collection; true when it worked, else `switchError` says why. */
  async function confirmSwitch(): Promise<boolean> {
    const target = switchTarget.value
    if (!target)
      return false
    switching.value = true
    switchError.value = null
    try {
      const response = (await browser.runtime.sendMessage({
        type: BOOKMARKS_SWITCH_COLLECTION,
        collectionId: target.id,
        collectionName: target.name,
      })) as { success: boolean, error?: string }
      if (!response?.success) {
        switchError.value = shownBookmarkError(response?.error, t('settings.bookmarks.notSupported')) ?? t('settings.bookmarks.error.generic')
        return false
      }
      await loadStatus()
      return true
    } catch (err) {
      switchError.value = String(err)
      return false
    } finally {
      switching.value = false
    }
  }

  return {
    status,
    collections,
    switchTargetId,
    switchError,
    switching,
    syncing,
    activeCollectionId,
    otherCollections,
    switchTarget,
    switchLocked,
    loadStatus,
    loadCollections,
    syncNow,
    confirmSwitch,
  }
}
