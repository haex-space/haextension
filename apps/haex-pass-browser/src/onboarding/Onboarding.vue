<script setup lang="ts">
import type { BrowserFamily } from '~/bookmarks/model'
import type { BackgroundAckResponse, OnboardingDecisionMessage } from '~/bookmarks/messages'
import type { BookmarkCollectionSummary } from '~/bookmarks/vaultClient'
import { ExternalConnectionState } from '@haex-space/vault-sdk'
import { validateTrimmedText } from '~/bookmarks/model'
import { BOOKMARKS_LIST_COLLECTIONS, BOOKMARKS_ONBOARDING_DECISION } from '~/bookmarks/messages'
import { MSG_CONNECT, MSG_CONNECTION_STATE, MSG_GET_CONNECTION_STATE } from '~/logic/messages'
import { useI18n } from '~/locales'
import logoUrl from '../../extension/assets/haex-pass-logo.png'

const { t } = useI18n()

type Mode = 'choose' | 'create' | 'activate'

const connectionState = ref<ExternalConnectionState>(ExternalConnectionState.DISCONNECTED)
const mode = ref<Mode>('choose')

const collections = ref<BookmarkCollectionSummary[]>([])
const collectionsLoaded = ref(false)
const collectionsError = ref<string | null>(null)

const newCollectionName = ref('')
const newCollectionNameError = ref<string | null>(null)

const selectedCollectionId = ref<string | null>(null)

const deviceLabel = ref('')
const deviceLabelError = ref<string | null>(null)

const decisionInProgress = ref(false)
const decisionError = ref<string | null>(null)
const decisionDone = ref<'disabled' | 'create' | 'activate' | null>(null)

let replicaId = ''
let browserFamily: BrowserFamily = 'other'

const selectedCollection = computed(() =>
  collections.value.find(c => c.id === selectedCollectionId.value) ?? null,
)

const isPaired = computed(() => connectionState.value === ExternalConnectionState.PAIRED)

async function detectBrowserFamily(): Promise<BrowserFamily> {
  const getBrowserInfo = (browser.runtime as unknown as { getBrowserInfo?: () => Promise<{ name: string }> }).getBrowserInfo
  if (typeof getBrowserInfo === 'function') {
    try {
      const info = await getBrowserInfo()
      if (/firefox/i.test(info.name))
        return 'firefox'
    } catch {
      // fall through to UA sniffing
    }
  }
  const ua = navigator.userAgent
  if (/firefox/i.test(ua))
    return 'firefox'
  if (/edg\//i.test(ua))
    return 'edge'
  if (/chrome|chromium/i.test(ua))
    return 'chromium'
  return 'other'
}

function detectOsLabel(): string {
  const ua = navigator.userAgent
  if (/windows/i.test(ua))
    return 'Windows'
  if (/mac os|macintosh/i.test(ua))
    return 'macOS'
  if (/android/i.test(ua))
    return 'Android'
  if (/iphone|ipad|ios/i.test(ua))
    return 'iOS'
  if (/linux/i.test(ua))
    return 'Linux'
  return 'Unknown'
}

function browserLabel(family: BrowserFamily): string {
  switch (family) {
    case 'firefox': return 'Firefox'
    case 'chromium': return 'Chrome'
    case 'edge': return 'Edge'
    default: return 'Browser'
  }
}

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

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as { type?: string, state?: { state?: ExternalConnectionState } }
  if (msg.type === MSG_CONNECTION_STATE && msg.state?.state !== undefined) {
    connectionState.value = msg.state.state
  }
})

async function loadCollections() {
  collectionsError.value = null
  try {
    const response = (await browser.runtime.sendMessage({ type: BOOKMARKS_LIST_COLLECTIONS })) as {
      success: boolean
      data?: { collections: BookmarkCollectionSummary[] }
      error?: string
    }
    if (response?.success && response.data) {
      collections.value = response.data.collections
    } else {
      collectionsError.value = response?.error ?? t('onboarding.collectionsLoadError')
    }
  } catch (err) {
    collectionsError.value = String(err)
  } finally {
    collectionsLoaded.value = true
  }
}

watch(connectionState, async (state) => {
  if (state === ExternalConnectionState.PAIRED && !collectionsLoaded.value) {
    await loadCollections()
  }
})

onMounted(async () => {
  replicaId = crypto.randomUUID()
  browserFamily = await detectBrowserFamily()
  deviceLabel.value = `${browserLabel(browserFamily)} · ${detectOsLabel()} · ${replicaId.slice(0, 6)}`

  await fetchConnectionState()
  if (connectionState.value !== ExternalConnectionState.PAIRED) {
    // Onboarding always opens right after a fresh install/reconnect; kick a
    // connect attempt so pairing can proceed without the user visiting Options first.
    try {
      await browser.runtime.sendMessage({ type: MSG_CONNECT })
    } catch {
      // ignore — status polling below will reflect the real state
    }
    await fetchConnectionState()
  }
  if (connectionState.value === ExternalConnectionState.PAIRED) {
    await loadCollections()
  }
})

function translateFieldError(code: string | null): string | null {
  if (!code)
    return null
  return t(`onboarding.validation.${code}`)
}

async function sendDecision(message: OnboardingDecisionMessage): Promise<BackgroundAckResponse> {
  return (await browser.runtime.sendMessage(message)) as BackgroundAckResponse
}

async function handleLater() {
  decisionInProgress.value = true
  decisionError.value = null
  try {
    const response = await sendDecision({ type: BOOKMARKS_ONBOARDING_DECISION, decision: 'disabled' })
    if (response?.success) {
      decisionDone.value = 'disabled'
    } else {
      decisionError.value = response?.error ?? t('onboarding.error.generic')
    }
  } catch (err) {
    decisionError.value = String(err)
  } finally {
    decisionInProgress.value = false
  }
}

async function handleCreateSubmit() {
  const nameError = validateTrimmedText(newCollectionName.value, 1, 60)
  newCollectionNameError.value = nameError
  const labelError = validateTrimmedText(deviceLabel.value, 1, 80)
  deviceLabelError.value = labelError
  if (nameError || labelError)
    return

  decisionInProgress.value = true
  decisionError.value = null
  try {
    // Must be the first await in this handler — permission requests are only
    // honored while still inside the click's user-gesture call stack.
    const granted = await browser.permissions.request({ permissions: ['bookmarks'] })
    if (!granted) {
      decisionError.value = t('onboarding.permissionDenied')
      return
    }
    const response = await sendDecision({
      type: BOOKMARKS_ONBOARDING_DECISION,
      decision: 'create',
      name: newCollectionName.value.trim(),
      replicaId,
      browserFamily,
      deviceLabel: deviceLabel.value.trim(),
    })
    if (response?.success) {
      decisionDone.value = 'create'
    } else {
      decisionError.value = response?.error ?? t('onboarding.error.generic')
    }
  } catch (err) {
    decisionError.value = String(err)
  } finally {
    decisionInProgress.value = false
  }
}

async function handleActivateSubmit() {
  const collection = selectedCollection.value
  if (!collection)
    return
  const labelError = validateTrimmedText(deviceLabel.value, 1, 80)
  deviceLabelError.value = labelError
  if (labelError)
    return

  decisionInProgress.value = true
  decisionError.value = null
  try {
    const granted = await browser.permissions.request({ permissions: ['bookmarks'] })
    if (!granted) {
      decisionError.value = t('onboarding.permissionDenied')
      return
    }
    const response = await sendDecision({
      type: BOOKMARKS_ONBOARDING_DECISION,
      decision: 'activate',
      collectionId: collection.id,
      collectionName: collection.name,
      replicaId,
      browserFamily,
      deviceLabel: deviceLabel.value.trim(),
    })
    if (response?.success) {
      decisionDone.value = 'activate'
    } else {
      decisionError.value = response?.error ?? t('onboarding.error.generic')
    }
  } catch (err) {
    decisionError.value = String(err)
  } finally {
    decisionInProgress.value = false
  }
}
</script>

<template>
  <main class="min-h-screen bg-background text-foreground p-8">
    <div class="max-w-xl mx-auto space-y-6">
      <div class="flex items-center gap-4">
        <img :src="logoUrl" alt="haex-pass" class="w-12 h-12">
        <h1 class="text-2xl font-bold">
          {{ t('onboarding.title') }}
        </h1>
      </div>

      <div v-if="decisionDone" class="rounded-lg border p-4 text-sm">
        {{ t(`onboarding.done.${decisionDone}`) }}
      </div>

      <template v-else>
        <div v-if="!isPaired" class="rounded-lg border p-4 text-sm text-muted-foreground">
          {{ connectionState === ExternalConnectionState.PENDING_APPROVAL
            ? t('onboarding.pendingApproval')
            : t('onboarding.waitingForVault') }}
        </div>

        <template v-else>
          <p v-if="decisionError" class="text-sm text-red-500">
            {{ decisionError }}
          </p>

          <!-- Choice screen -->
          <div v-if="mode === 'choose'" class="space-y-3">
            <button
              class="w-full text-left rounded-lg border p-4 hover:bg-accent disabled:opacity-50"
              :disabled="decisionInProgress"
              @click="handleLater"
            >
              <div class="font-medium">
                {{ t('onboarding.later.label') }}
              </div>
              <div class="text-sm text-muted-foreground">
                {{ t('onboarding.later.description') }}
              </div>
            </button>

            <button
              class="w-full text-left rounded-lg border p-4 hover:bg-accent"
              @click="mode = 'create'"
            >
              <div class="font-medium">
                {{ t('onboarding.create.label') }}
              </div>
              <div class="text-sm text-muted-foreground">
                {{ t('onboarding.create.description') }}
              </div>
            </button>

            <button
              v-if="collectionsLoaded && collections.length > 0"
              class="w-full text-left rounded-lg border p-4 hover:bg-accent"
              @click="mode = 'activate'"
            >
              <div class="font-medium">
                {{ t('onboarding.activate.label') }}
              </div>
              <div class="text-sm text-muted-foreground">
                {{ t('onboarding.activate.description') }}
              </div>
            </button>

            <p v-if="collectionsError" class="text-sm text-red-500">
              {{ collectionsError }}
              <button class="underline" @click="loadCollections">
                {{ t('onboarding.retry') }}
              </button>
            </p>
          </div>

          <!-- Create new collection -->
          <div v-else-if="mode === 'create'" class="space-y-4">
            <div>
              <label for="new-collection-name" class="block text-sm font-medium mb-1">
                {{ t('onboarding.create.nameLabel') }}
              </label>
              <input
                id="new-collection-name"
                v-model="newCollectionName"
                type="text"
                :placeholder="t('onboarding.create.namePlaceholder')"
                class="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
              <p v-if="newCollectionNameError" class="text-sm text-red-500 mt-1">
                {{ translateFieldError(newCollectionNameError) }}
              </p>
            </div>

            <div>
              <label for="device-label-create" class="block text-sm font-medium mb-1">
                {{ t('onboarding.deviceLabel.label') }}
              </label>
              <input
                id="device-label-create"
                v-model="deviceLabel"
                type="text"
                class="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
              <p v-if="deviceLabelError" class="text-sm text-red-500 mt-1">
                {{ translateFieldError(deviceLabelError) }}
              </p>
            </div>

            <div class="flex gap-2">
              <button
                class="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                :disabled="decisionInProgress"
                @click="handleCreateSubmit"
              >
                {{ t('onboarding.create.submit') }}
              </button>
              <button class="px-4 py-2 rounded-md border text-sm" @click="mode = 'choose'">
                ←
              </button>
            </div>
          </div>

          <!-- Load an existing collection -->
          <div v-else class="space-y-4">
            <ul class="space-y-2">
              <li
                v-for="collection in collections"
                :key="collection.id"
                class="rounded-md border px-3 py-2 text-sm cursor-pointer"
                :class="{ 'ring-2 ring-primary': selectedCollectionId === collection.id }"
                @click="selectedCollectionId = collection.id"
              >
                <div class="font-medium">
                  {{ collection.name }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ t('onboarding.activate.bookmarkCount', { count: collection.bookmarkCount }) }}
                  <template v-if="collection.deviceLabels.length > 0">
                    · {{ t('onboarding.activate.devices', { devices: collection.deviceLabels.join(', ') }) }}
                  </template>
                </div>
              </li>
            </ul>

            <template v-if="selectedCollection">
              <p class="text-sm text-amber-500">
                {{ t('onboarding.activate.replaceWarning', { name: selectedCollection.name }) }}
              </p>

              <div>
                <label for="device-label-activate" class="block text-sm font-medium mb-1">
                  {{ t('onboarding.deviceLabel.label') }}
                </label>
                <input
                  id="device-label-activate"
                  v-model="deviceLabel"
                  type="text"
                  class="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                <p v-if="deviceLabelError" class="text-sm text-red-500 mt-1">
                  {{ translateFieldError(deviceLabelError) }}
                </p>
              </div>

              <button
                class="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                :disabled="decisionInProgress"
                @click="handleActivateSubmit"
              >
                {{ t('onboarding.activate.submit') }}
              </button>
            </template>

            <button class="px-4 py-2 rounded-md border text-sm" @click="mode = 'choose'">
              ←
            </button>
          </div>
        </template>
      </template>
    </div>
  </main>
</template>
