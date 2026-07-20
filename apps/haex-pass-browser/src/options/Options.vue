<script setup lang="ts">
import type { BookmarkStatus, OnboardingDecisionMessage } from '~/bookmarks/messages'
import type { BookmarkCollectionSummary } from '~/bookmarks/vaultClient'
import type { SupportedLocale } from '~/locales'
import type { PasskeyPrefs } from '~/logic/settings'
import { canExternalClientSendRequests, ExternalConnectionState } from '@haex-space/vault-sdk'
import { PlugZap } from 'lucide-vue-next'
import {
  BOOKMARKS_CONFIRM_DELETIONS,
  BOOKMARKS_GET_STATUS,
  BOOKMARKS_LIST_COLLECTIONS,
  BOOKMARKS_ONBOARDING_DECISION,
  BOOKMARKS_REJECT_DELETIONS,
  BOOKMARKS_SWITCH_COLLECTION,
  BOOKMARKS_SYNC_NOW,
} from '~/bookmarks/messages'
import { validateTrimmedText } from '~/bookmarks/model'
import { getLocaleSetting, setLocale, useI18n } from '~/locales'
import {
  MSG_CONNECT,
  MSG_CONNECTION_STATE,
  MSG_DISCONNECT,
  MSG_GET_CONNECTION_STATE,
} from '~/logic/messages'
import {
  getAllPasskeyPrefs,
  getWebSocketPort,

  removePasskeyPref,
  setWebSocketPort,
} from '~/logic/settings'
import logoUrl from '../../extension/assets/haex-pass-logo.png'

const { t } = useI18n()

const currentLocale = ref<SupportedLocale>('auto')
const currentPort = ref<number>(19455)
const portInput = ref<string>('19455')
const portError = ref<string | null>(null)
const portSaved = ref(false)
const connectionState = ref<ExternalConnectionState>(ExternalConnectionState.DISCONNECTED)
const isConnecting = ref(false)
const passkeyPrefs = ref<PasskeyPrefs>({})

const passkeyPrefList = computed(() => {
  return Object.entries(passkeyPrefs.value)
    .map(([rpId, value]) => ({ rpId, ...value }))
    .sort((a, b) => a.rpId.localeCompare(b.rpId))
})

async function reloadPasskeyPrefs() {
  passkeyPrefs.value = await getAllPasskeyPrefs()
}

async function handleRemovePref(rpId: string) {
  await removePasskeyPref(rpId)
  await reloadPasskeyPrefs()
}

// Show disconnect button only when paired
const showDisconnectButton = computed(() => canExternalClientSendRequests(connectionState.value))

const statusText = computed(() => {
  switch (connectionState.value) {
    case ExternalConnectionState.PAIRED:
      return t('status.connected')
    case ExternalConnectionState.PENDING_APPROVAL:
      return t('status.pendingApproval')
    case ExternalConnectionState.CONNECTED:
      return t('status.connectedNotPaired')
    case ExternalConnectionState.CONNECTING:
      return t('status.connecting')
    default:
      return t('status.disconnected')
  }
})

const statusClass = computed(() => {
  switch (connectionState.value) {
    case ExternalConnectionState.PAIRED:
      return 'text-green-500'
    case ExternalConnectionState.PENDING_APPROVAL:
      return 'text-orange-500'
    case ExternalConnectionState.CONNECTED:
      return 'text-yellow-500'
    case ExternalConnectionState.CONNECTING:
      return 'text-blue-500'
    default:
      return 'text-red-500'
  }
})

async function fetchConnectionState() {
  try {
    const response = (await browser.runtime.sendMessage({
      type: MSG_GET_CONNECTION_STATE,
    })) as { state?: ExternalConnectionState }
    connectionState.value = response?.state ?? ExternalConnectionState.DISCONNECTED
  } catch {
    connectionState.value = ExternalConnectionState.DISCONNECTED
  }
}

async function handleDisconnect() {
  try {
    await browser.runtime.sendMessage({ type: MSG_DISCONNECT })
    connectionState.value = ExternalConnectionState.DISCONNECTED
  } catch (err) {
    console.error('Failed to disconnect:', err)
  }
}

async function handleConnect() {
  isConnecting.value = true
  try {
    await browser.runtime.sendMessage({ type: MSG_CONNECT })
    await fetchConnectionState()
  } catch (err) {
    console.error('Failed to connect:', err)
  } finally {
    isConnecting.value = false
  }
}

// Listen for connection state updates
browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as {
    type?: string
    state?: { state?: ExternalConnectionState }
  }
  if (msg.type === MSG_CONNECTION_STATE && msg.state?.state !== undefined) {
    connectionState.value = msg.state.state
  }
})

const languageOptions = computed(() => [
  { value: 'auto', label: t('settings.language.auto') },
  { value: 'en', label: t('settings.language.english') },
  { value: 'de', label: t('settings.language.german') },
])

async function handleLocaleChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const newLocale = target.value as SupportedLocale
  currentLocale.value = newLocale
  await setLocale(newLocale)
}

async function handlePortSave() {
  const port = Number.parseInt(portInput.value, 10)
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    portError.value = t('settings.port.invalid')
    return
  }

  portError.value = null
  await setWebSocketPort(port)
  currentPort.value = port
  portSaved.value = true
  setTimeout(() => {
    portSaved.value = false
  }, 2000)
}

function handlePortInput(event: Event) {
  const target = event.target as HTMLInputElement
  portInput.value = target.value
  portError.value = null
  portSaved.value = false
}

// -----------------------------------------------------------------------
// Bookmark sync
// -----------------------------------------------------------------------

const bookmarkStatus = ref<BookmarkStatus | null>(null)
const bookmarkCollections = ref<BookmarkCollectionSummary[]>([])
const bookmarkSwitcherOpen = ref(false)
const bookmarkCreateMode = ref(false)
const bookmarkSwitchTargetId = ref<string | null>(null)
const bookmarkSwitchError = ref<string | null>(null)
const bookmarkSwitchInProgress = ref(false)
const bookmarkSyncNowInProgress = ref(false)
const bookmarkNewName = ref('')
const bookmarkNewNameError = ref<string | null>(null)

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

async function loadBookmarkCollections() {
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

function openBookmarkSwitcher() {
  bookmarkSwitcherOpen.value = true
  bookmarkCreateMode.value = false
  bookmarkSwitchTargetId.value = null
  bookmarkSwitchError.value = null
  void loadBookmarkCollections()
}

function closeBookmarkSwitcher() {
  bookmarkSwitcherOpen.value = false
}

async function confirmBookmarkSwitch() {
  const target = bookmarkSwitchTarget.value
  if (!target)
    return
  bookmarkSwitchInProgress.value = true
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
    bookmarkSwitchInProgress.value = false
  }
}

async function confirmBookmarkCreate() {
  if (bookmarkStatus.value?.mode !== 'active')
    return
  const nameError = validateTrimmedText(bookmarkNewName.value, 1, 60)
  bookmarkNewNameError.value = nameError
  if (nameError)
    return

  bookmarkSwitchInProgress.value = true
  bookmarkSwitchError.value = null
  try {
    const decision: OnboardingDecisionMessage = {
      type: BOOKMARKS_ONBOARDING_DECISION,
      decision: 'create',
      name: bookmarkNewName.value.trim(),
      replicaId: bookmarkStatus.value.replicaId,
      browserFamily: bookmarkStatus.value.browserFamily,
      deviceLabel: bookmarkStatus.value.deviceLabel,
    }
    const response = (await browser.runtime.sendMessage(decision)) as { success: boolean, error?: string }
    if (response?.success) {
      bookmarkSwitcherOpen.value = false
      bookmarkNewName.value = ''
      await loadBookmarkStatus()
    } else {
      bookmarkSwitchError.value = response?.error ?? t('settings.bookmarks.error.generic')
    }
  } catch (err) {
    bookmarkSwitchError.value = String(err)
  } finally {
    bookmarkSwitchInProgress.value = false
  }
}

async function handleBookmarkSyncNow() {
  bookmarkSyncNowInProgress.value = true
  try {
    await browser.runtime.sendMessage({ type: BOOKMARKS_SYNC_NOW })
    await loadBookmarkStatus()
  } finally {
    bookmarkSyncNowInProgress.value = false
  }
}

async function handleBookmarkDisable() {
  await browser.runtime.sendMessage({ type: BOOKMARKS_ONBOARDING_DECISION, decision: 'disabled' })
  await loadBookmarkStatus()
}

async function handleBookmarkRevokePermission() {
  await browser.permissions.remove({ permissions: ['bookmarks'] })
  await loadBookmarkStatus()
}

async function handleBookmarkConfirmDeletions() {
  await browser.runtime.sendMessage({ type: BOOKMARKS_CONFIRM_DELETIONS })
  await loadBookmarkStatus()
}

async function handleBookmarkRejectDeletions() {
  await browser.runtime.sendMessage({ type: BOOKMARKS_REJECT_DELETIONS })
  await loadBookmarkStatus()
}

async function handleBookmarkRecreateCollection() {
  if (bookmarkStatus.value?.mode !== 'active')
    return
  bookmarkSwitchInProgress.value = true
  try {
    const decision: OnboardingDecisionMessage = {
      type: BOOKMARKS_ONBOARDING_DECISION,
      decision: 'create',
      name: bookmarkStatus.value.collectionName,
      replicaId: bookmarkStatus.value.replicaId,
      browserFamily: bookmarkStatus.value.browserFamily,
      deviceLabel: bookmarkStatus.value.deviceLabel,
    }
    await browser.runtime.sendMessage(decision)
    await loadBookmarkStatus()
  } finally {
    bookmarkSwitchInProgress.value = false
  }
}

function openBookmarkOnboarding() {
  browser.tabs.create({ url: browser.runtime.getURL('dist/onboarding/index.html') }).catch(() => {})
}

onMounted(async () => {
  currentLocale.value = await getLocaleSetting()
  currentPort.value = await getWebSocketPort()
  portInput.value = currentPort.value.toString()
  await reloadPasskeyPrefs()
  await fetchConnectionState()
  await loadBookmarkStatus()
})
</script>

<template>
  <main class="min-h-screen bg-background text-foreground p-8">
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="flex items-center gap-4 mb-8">
        <img :src="logoUrl" alt="haex-pass" class="w-12 h-12">
        <div>
          <h1 class="text-2xl font-bold">
            {{ t('extension.name') }}
          </h1>
          <p class="text-muted-foreground">
            {{ t('settings.title') }}
          </p>
        </div>
      </div>

      <!-- Settings -->
      <div class="space-y-6">
        <!-- Language Setting -->
        <div class="rounded-lg border p-4">
          <label for="language-select" class="block font-medium mb-1">
            {{ t('settings.language.label') }}
          </label>
          <p class="text-sm text-muted-foreground mb-3">
            {{ t('settings.language.description') }}
          </p>
          <select
            id="language-select"
            :value="currentLocale"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            @change="handleLocaleChange"
          >
            <option v-for="option in languageOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <!-- Connection Setting -->
        <div class="rounded-lg border p-4">
          <h3 class="font-medium mb-1">
            {{ t('settings.connection.label') }}
          </h3>
          <p class="text-sm text-muted-foreground mb-4">
            {{ t('settings.connection.description') }}
          </p>

          <div class="space-y-3">
            <div>
              <label for="port-input" class="block text-sm font-medium mb-1">
                {{ t('settings.port.label') }}
              </label>
              <p class="text-xs text-muted-foreground mb-2">
                {{ t('settings.port.description') }}
              </p>
              <div class="flex gap-2">
                <input
                  id="port-input"
                  type="number"
                  min="1"
                  max="65535"
                  :value="portInput"
                  :placeholder="t('settings.port.placeholder')"
                  class="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  @input="handlePortInput"
                >
                <button
                  class="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  :disabled="portInput === currentPort.toString()"
                  @click="handlePortSave"
                >
                  {{ t('settings.save') }}
                </button>
              </div>
              <p v-if="portError" class="text-sm text-red-500 mt-1">
                {{ portError }}
              </p>
              <p v-else-if="portSaved" class="text-sm text-green-500 mt-1">
                {{ t('settings.saved') }}
              </p>
            </div>

            <p v-if="portSaved" class="text-xs text-amber-500">
              {{ t('settings.restartRequired') }}
            </p>
          </div>

          <!-- Connection Status & Buttons -->
          <div class="pt-3 border-t">
            <label class="block text-sm font-medium mb-1">
              {{ t('settings.connection.status') }}
            </label>
            <div class="flex items-center gap-2 mb-3">
              <span
                class="inline-block w-2 h-2 rounded-full"
                :class="statusClass.replace('text-', 'bg-')"
              />
              <span class="text-sm" :class="statusClass">{{ statusText }}</span>
            </div>
            <button
              v-if="!showDisconnectButton"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              :disabled="isConnecting"
              @click="handleConnect"
            >
              <PlugZap class="w-4 h-4" />
              {{ t('button.connect') }}
            </button>
            <button
              v-else
              class="px-4 py-2 rounded-md border text-sm font-medium hover:bg-accent"
              @click="handleDisconnect"
            >
              {{ t('settings.disconnect.button') }}
            </button>
          </div>
        </div>

        <!-- Bookmark sync -->
        <div class="rounded-lg border p-4">
          <h3 class="font-medium mb-1">
            {{ t('settings.bookmarks.label') }}
          </h3>
          <p class="text-sm text-muted-foreground mb-3">
            {{ t('settings.bookmarks.description') }}
          </p>

          <div v-if="!bookmarkStatus" class="text-sm text-muted-foreground italic">
            {{ t('settings.bookmarks.loading') }}
          </div>

          <div v-else-if="bookmarkStatus.mode === 'disabled'">
            <p class="text-sm text-muted-foreground mb-3">
              {{ t('settings.bookmarks.disabledHint') }}
            </p>
            <button class="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium" @click="openBookmarkOnboarding">
              {{ t('settings.bookmarks.enable') }}
            </button>
          </div>

          <div v-else class="space-y-3">
            <div class="text-sm">
              <div><span class="text-muted-foreground">{{ t('settings.bookmarks.collection') }}:</span> {{ bookmarkStatus.collectionName }}</div>
              <div><span class="text-muted-foreground">{{ t('settings.bookmarks.device') }}:</span> {{ bookmarkStatus.deviceLabel }} ({{ bookmarkStatus.replicaId.slice(0, 8) }})</div>
              <div>
                <span class="text-muted-foreground">{{ t('settings.bookmarks.status') }}:</span>
                <span v-if="bookmarkStatus.lastError" class="text-red-500">{{ bookmarkStatus.lastError }}</span>
                <span v-else-if="bookmarkStatus.dirty" class="text-amber-500">{{ t('settings.bookmarks.dirty') }}</span>
                <span v-else class="text-green-500">{{ t('settings.bookmarks.synced') }}</span>
              </div>
            </div>

            <!-- OWN_COLLECTION_MISSING -->
            <div v-if="bookmarkStatus.ownCollectionMissing" class="rounded-md border border-red-500/50 p-3 text-sm space-y-2">
              <p>{{ t('settings.bookmarks.ownCollectionMissing') }}</p>
              <button class="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium" @click="handleBookmarkRecreateCollection">
                {{ t('settings.bookmarks.recreate') }}
              </button>
            </div>

            <!-- Bulk-delete quarantine -->
            <div v-if="bookmarkStatus.pendingDeletionReview" class="rounded-md border border-amber-500/50 p-3 text-sm space-y-2">
              <p>
                {{ t('settings.bookmarks.pendingDeletionReview', {
                  count: bookmarkStatus.pendingDeletionReview.deletedCount,
                  total: bookmarkStatus.pendingDeletionReview.mappedNodeCountBefore,
                }) }}
              </p>
              <div class="flex gap-2">
                <button class="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium" @click="handleBookmarkConfirmDeletions">
                  {{ t('settings.bookmarks.applyDeletions') }}
                </button>
                <button class="px-3 py-1 rounded-md border text-xs font-medium" @click="handleBookmarkRejectDeletions">
                  {{ t('settings.bookmarks.rejectDeletions') }}
                </button>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                class="px-3 py-1.5 rounded-md border text-sm font-medium hover:bg-accent disabled:opacity-50"
                :disabled="bookmarkSyncNowInProgress"
                @click="handleBookmarkSyncNow"
              >
                {{ t('settings.bookmarks.syncNow') }}
              </button>
              <button class="px-3 py-1.5 rounded-md border text-sm font-medium hover:bg-accent" @click="openBookmarkSwitcher">
                {{ t('settings.bookmarks.switchCollection') }}
              </button>
              <button class="px-3 py-1.5 rounded-md border text-sm font-medium hover:bg-accent" @click="handleBookmarkDisable">
                {{ t('settings.bookmarks.disable') }}
              </button>
              <button class="px-3 py-1.5 rounded-md border text-sm font-medium text-red-500 hover:bg-accent" @click="handleBookmarkRevokePermission">
                {{ t('settings.bookmarks.revokePermission') }}
              </button>
            </div>

            <!-- Collection switcher -->
            <div v-if="bookmarkSwitcherOpen" class="rounded-md border p-3 space-y-3">
              <div class="flex gap-2 text-sm">
                <button
                  class="px-2 py-1 rounded-md"
                  :class="!bookmarkCreateMode ? 'bg-accent' : ''"
                  @click="bookmarkCreateMode = false"
                >
                  {{ t('settings.bookmarks.switchExisting') }}
                </button>
                <button
                  class="px-2 py-1 rounded-md"
                  :class="bookmarkCreateMode ? 'bg-accent' : ''"
                  @click="bookmarkCreateMode = true"
                >
                  {{ t('settings.bookmarks.switchNew') }}
                </button>
              </div>

              <template v-if="!bookmarkCreateMode">
                <p v-if="otherBookmarkCollections.length === 0" class="text-sm text-muted-foreground italic">
                  {{ t('settings.bookmarks.noOtherCollections') }}
                </p>
                <ul v-else class="space-y-1">
                  <li
                    v-for="collection in otherBookmarkCollections"
                    :key="collection.id"
                    class="rounded-md border px-2 py-1.5 text-sm cursor-pointer"
                    :class="{ 'ring-2 ring-primary': bookmarkSwitchTargetId === collection.id }"
                    @click="bookmarkSwitchTargetId = collection.id"
                  >
                    {{ collection.name }} ({{ collection.bookmarkCount }})
                  </li>
                </ul>
                <p v-if="bookmarkSwitchTarget" class="text-sm text-amber-500">
                  {{ t('settings.bookmarks.replaceWarning', { name: bookmarkSwitchTarget.name }) }}
                </p>
                <p v-if="bookmarkSwitchLocked" class="text-xs text-muted-foreground">
                  {{ t('settings.bookmarks.lockedWhileDirty') }}
                </p>
                <p v-if="bookmarkSwitchError" class="text-sm text-red-500">
                  {{ bookmarkSwitchError }}
                </p>
                <div class="flex gap-2">
                  <button
                    class="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                    :disabled="!bookmarkSwitchTarget || bookmarkSwitchLocked || bookmarkSwitchInProgress"
                    @click="confirmBookmarkSwitch"
                  >
                    {{ t('settings.bookmarks.confirmSwitch') }}
                  </button>
                  <button class="px-3 py-1 rounded-md border text-xs font-medium" @click="closeBookmarkSwitcher">
                    {{ t('createEntry.cancel') }}
                  </button>
                </div>
              </template>

              <template v-else>
                <input
                  v-model="bookmarkNewName"
                  type="text"
                  :placeholder="t('onboarding.create.namePlaceholder')"
                  class="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                <p v-if="bookmarkNewNameError" class="text-sm text-red-500">
                  {{ t(`onboarding.validation.${bookmarkNewNameError}`) }}
                </p>
                <p v-if="bookmarkSwitchError" class="text-sm text-red-500">
                  {{ bookmarkSwitchError }}
                </p>
                <div class="flex gap-2">
                  <button
                    class="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                    :disabled="bookmarkSwitchInProgress"
                    @click="confirmBookmarkCreate"
                  >
                    {{ t('settings.bookmarks.confirmCreate') }}
                  </button>
                  <button class="px-3 py-1 rounded-md border text-xs font-medium" @click="closeBookmarkSwitcher">
                    {{ t('createEntry.cancel') }}
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Passkey handler decisions per site -->
        <div class="rounded-lg border p-4">
          <h3 class="font-medium mb-1">
            {{ t('settings.passkeyPrefs.label') }}
          </h3>
          <p class="text-sm text-muted-foreground mb-3">
            {{ t('settings.passkeyPrefs.description') }}
          </p>
          <p v-if="passkeyPrefList.length === 0" class="text-sm text-muted-foreground italic">
            {{ t('settings.passkeyPrefs.empty') }}
          </p>
          <ul v-else class="space-y-2">
            <li
              v-for="pref in passkeyPrefList"
              :key="pref.rpId"
              class="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <div class="min-w-0 flex-1">
                <div class="font-mono truncate">
                  {{ pref.rpId }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ pref.choice === 'haex-pass' ? t('settings.passkeyPrefs.choice.haexPass') : t('settings.passkeyPrefs.choice.browser') }}
                </div>
              </div>
              <button
                class="px-3 py-1 rounded-md border text-xs font-medium hover:bg-accent"
                @click="handleRemovePref(pref.rpId)"
              >
                {{ t('settings.passkeyPrefs.remove') }}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </main>
</template>
