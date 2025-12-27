<script setup lang="ts">
import type { ExternalConnection } from '@haex-space/vault-sdk'
import {
  canExternalClientSendRequests,
  ExternalConnectionErrorCode,
  ExternalConnectionState,
} from '@haex-space/vault-sdk'
import { Clock, Loader2, PlugZap, Shield, ShieldOff } from 'lucide-vue-next'
import { useI18n } from '~/locales'
import { MSG_CONNECT, MSG_CONNECTION_STATE, MSG_DISCONNECT, MSG_GET_CONNECTION_STATE } from '~/logic/messages'

const { t } = useI18n()

const connection = ref<ExternalConnection>({
  state: ExternalConnectionState.DISCONNECTED,
  clientId: null,
  errorCode: ExternalConnectionErrorCode.NONE,
  errorMessage: null,
})

const isConnecting = ref(false)

// Expose connection state to parent
defineExpose({
  connection,
  canSendRequests: computed(() => canExternalClientSendRequests(connection.value.state)),
})

// Translate error code to localized message
const errorText = computed(() => {
  const code = connection.value.errorCode
  if (code === ExternalConnectionErrorCode.NONE) {
    return null
  }

  const errorKeyMap: Record<string, string> = {
    client_not_authorized: 'error.clientNotAuthorized',
    client_blocked: 'error.clientBlocked',
    connection_failed: 'error.connectionFailed',
    connection_timeout: 'error.connectionTimeout',
    connection_closed: 'error.connectionClosed',
    decryption_failed: 'error.decryptionFailed',
    invalid_message: 'error.invalidMessage',
  }

  const translationKey = errorKeyMap[code] || 'error.unknown'
  return t(translationKey)
})

const showDisconnectButton = computed(() => canExternalClientSendRequests(connection.value.state))

const statusIcon = computed(() => {
  switch (connection.value.state) {
    case ExternalConnectionState.PAIRED:
      return Shield
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
    const state = await browser.runtime.sendMessage({ type: MSG_GET_CONNECTION_STATE })
    connection.value = state as ExternalConnection
  } catch (err) {
    console.error('Failed to get connection state:', err)
  }
}

async function connect() {
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

async function disconnect() {
  try {
    await browser.runtime.sendMessage({ type: MSG_DISCONNECT })
    await fetchConnectionState()
  } catch (err) {
    console.error('Failed to disconnect:', err)
  }
}

// Listen for connection state updates
browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as { type?: string, state?: ExternalConnection }
  if (msg.type === MSG_CONNECTION_STATE && msg.state) {
    connection.value = msg.state
  }
})

onMounted(() => {
  fetchConnectionState()
})
</script>

<template>
  <div class="rounded-lg border p-3 mb-4">
    <div class="flex items-center gap-2 mb-2">
      <component
        :is="statusIcon"
        class="w-5 h-5"
        :class="[
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
      {{ t('hint.vaultNotRunning') }}
    </p>

    <p v-if="connection.state === ExternalConnectionState.PENDING_APPROVAL" class="text-xs text-muted-foreground mb-3">
      {{ t('hint.pendingApproval') }}
    </p>

    <div class="flex gap-2">
      <button
        v-if="!showDisconnectButton"
        class="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        :disabled="isConnecting"
        @click="connect"
      >
        <PlugZap class="w-4 h-4" />
        {{ t('button.connect') }}
      </button>

      <button
        v-else
        class="flex-1 inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
        @click="disconnect"
      >
        {{ t('button.disconnect') }}
      </button>
    </div>
  </div>
</template>
