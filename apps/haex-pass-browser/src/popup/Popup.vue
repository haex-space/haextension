<script setup lang="ts">
import type { ExternalConnection } from '@haex-space/vault-sdk'
import {
  canExternalClientSendRequests,
  ExternalConnectionErrorCode,
  ExternalConnectionState,
} from '@haex-space/vault-sdk'
import { Clock, Loader2, PlugZap, Shield, ShieldCheck, ShieldOff } from 'lucide-vue-next'
import { sendMessage } from 'webext-bridge/popup'
import { useI18n } from '~/locales'

const { t } = useI18n()

const connection = ref<ExternalConnection>({
  state: ExternalConnectionState.DISCONNECTED,
  clientId: null,
  errorCode: ExternalConnectionErrorCode.NONE,
  errorMessage: null,
})

// Translate error code to localized message
const errorText = computed(() => {
  const code = connection.value.errorCode
  if (code === ExternalConnectionErrorCode.NONE) return null

  // Try to get translation for error code, fallback to errorMessage
  const translationKey = `error_${code}`
  const translated = t(translationKey)

  // If no translation found (returns key), use errorMessage as fallback
  return translated !== translationKey ? translated : connection.value.errorMessage
})

const isConnecting = ref(false)

// Show disconnect button only when paired (can send requests)
// For pending_approval, user should be able to retry connecting
const showDisconnectButton = computed(() => canExternalClientSendRequests(connection.value.state))

const statusIcon = computed(() => {
  switch (connection.value.state) {
    case ExternalConnectionState.PAIRED:
      return ShieldCheck
    case ExternalConnectionState.PENDING_APPROVAL:
      return Clock
    case ExternalConnectionState.CONNECTED:
      return Shield
    case ExternalConnectionState.CONNECTING:
      return Loader2
    default:
      return ShieldOff
  }
})

const statusText = computed(() => {
  switch (connection.value.state) {
    case ExternalConnectionState.PAIRED:
      return t('statusConnected')
    case ExternalConnectionState.PENDING_APPROVAL:
      return t('statusPendingApproval')
    case ExternalConnectionState.CONNECTED:
      return t('statusConnectedNotPaired')
    case ExternalConnectionState.CONNECTING:
      return t('statusConnecting')
    default:
      return t('statusDisconnected')
  }
})

const statusClass = computed(() => {
  switch (connection.value.state) {
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
    const state = await sendMessage('get-connection-state', {})
    connection.value = state as unknown as ExternalConnection
  }
  catch (err) {
    console.error('Failed to get connection state:', err)
  }
}

async function connect() {
  isConnecting.value = true
  try {
    await sendMessage('connect', {})
    await fetchConnectionState()
  }
  catch (err) {
    console.error('Failed to connect:', err)
  }
  finally {
    isConnecting.value = false
  }
}

async function disconnect() {
  try {
    await sendMessage('disconnect', {})
    await fetchConnectionState()
  }
  catch (err) {
    console.error('Failed to disconnect:', err)
  }
}

function openOptions() {
  browser.runtime.openOptionsPage()
}

// Listen for connection state updates
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'connection-state') {
    connection.value = message.state
  }
})

onMounted(() => {
  fetchConnectionState()
})
</script>

<template>
  <main class="w-[320px] p-4 bg-background text-foreground">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-4">
      <ShieldCheck class="w-10 h-10 text-primary" />
      <div>
        <h1 class="text-lg font-semibold">
          {{ t('extensionName') }}
        </h1>
        <p class="text-xs text-muted-foreground">
          {{ t('extensionDescription') }}
        </p>
      </div>
    </div>

    <!-- Connection Status -->
    <div class="rounded-lg border p-3 mb-4">
      <div class="flex items-center gap-2 mb-2">
        <component
          :is="statusIcon"
          :class="[
            'w-5 h-5',
            statusClass,
            connection.state === ExternalConnectionState.CONNECTING ? 'animate-spin' : '',
          ]"
        />
        <span class="font-medium" :class="statusClass">
          {{ statusText }}
        </span>
      </div>

      <p v-if="errorText" class="text-xs text-red-500 mb-2">
        {{ errorText }}
      </p>

      <p v-if="connection.state === ExternalConnectionState.DISCONNECTED" class="text-xs text-muted-foreground mb-3">
        {{ t('hintVaultNotRunning') }}
      </p>

      <p v-if="connection.state === ExternalConnectionState.PENDING_APPROVAL" class="text-xs text-muted-foreground mb-3">
        {{ t('hintPendingApproval') }}
      </p>

      <div class="flex gap-2">
        <button
          v-if="!showDisconnectButton"
          class="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          :disabled="isConnecting"
          @click="connect"
        >
          <PlugZap class="w-4 h-4" />
          {{ t('buttonConnect') }}
        </button>

        <button
          v-else
          class="flex-1 inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          @click="disconnect"
        >
          {{ t('buttonDisconnect') }}
        </button>
      </div>
    </div>

    <!-- Quick Actions -->
    <div v-if="connection.state === ExternalConnectionState.PAIRED" class="space-y-2">
      <p class="text-xs text-muted-foreground mb-2">
        {{ t('hintAutoFillActive') }}
      </p>
    </div>

    <!-- Footer -->
    <div class="pt-3 border-t mt-4">
      <button
        class="text-xs text-muted-foreground hover:text-foreground"
        @click="openOptions"
      >
        {{ t('buttonSettings') }}
      </button>
    </div>
  </main>
</template>
