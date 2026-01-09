<script setup lang="ts">
import type { SupportedLocale } from '~/locales'
import { canExternalClientSendRequests, ExternalConnectionState } from '@haex-space/vault-sdk'
import { PlugZap } from 'lucide-vue-next'
import { getLocaleSetting, setLocale, useI18n } from '~/locales'
import {
  MSG_CONNECT,
  MSG_CONNECTION_STATE,
  MSG_DISCONNECT,
  MSG_GET_CONNECTION_STATE,
} from '~/logic/messages'
import { getWebSocketPort, setWebSocketPort } from '~/logic/settings'
import logoUrl from '../../extension/assets/haex-pass-logo.png'

const { t } = useI18n()

const currentLocale = ref<SupportedLocale>('auto')
const currentPort = ref<number>(19455)
const portInput = ref<string>('19455')
const portError = ref<string | null>(null)
const portSaved = ref(false)
const connectionState = ref<ExternalConnectionState>(ExternalConnectionState.DISCONNECTED)
const isConnecting = ref(false)

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

onMounted(async () => {
  currentLocale.value = await getLocaleSetting()
  currentPort.value = await getWebSocketPort()
  portInput.value = currentPort.value.toString()
  await fetchConnectionState()
})
</script>

<template>
  <main class="min-h-screen bg-background text-foreground p-8">
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="flex items-center gap-4 mb-8">
        <img :src="logoUrl" alt="haex-pass" class="w-12 h-12" />
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
                />
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
      </div>
    </div>
  </main>
</template>
