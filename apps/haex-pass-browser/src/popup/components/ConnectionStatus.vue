<script setup lang="ts">
import { ExternalConnectionErrorCode, ExternalConnectionState } from '@haex-space/vault-sdk'
import { Clock, Loader2, PlugZap, Shield, ShieldOff } from '@lucide/vue'
import { useVaultConnectionState } from '~/composables/useVaultConnectionState'
import { useI18n } from '~/locales'

const { t } = useI18n()

const { connection, isConnecting, canSendRequests, statusText, statusClass, refresh, connect, disconnect } = useVaultConnectionState()

// Expose connection state to parent
defineExpose({
  connection,
  canSendRequests,
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

onMounted(() => {
  void refresh()
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
        v-if="!canSendRequests"
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
