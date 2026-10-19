import type { ExternalConnection } from '@haex-space/vault-sdk'
import { canExternalClientSendRequests, ExternalConnectionErrorCode, ExternalConnectionState } from '@haex-space/vault-sdk'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '~/locales'
import { MSG_CONNECT, MSG_CONNECTION_STATE, MSG_DISCONNECT, MSG_GET_CONNECTION_STATE } from '~/logic/messages'

function disconnected(): ExternalConnection {
  return {
    state: ExternalConnectionState.DISCONNECTED,
    clientId: null,
    errorCode: ExternalConnectionErrorCode.NONE,
    errorMessage: null,
  }
}

const STATUS_TEXT_KEYS: Partial<Record<ExternalConnectionState, string>> = {
  [ExternalConnectionState.PAIRED]: 'status.connected',
  [ExternalConnectionState.PENDING_APPROVAL]: 'status.pendingApproval',
  [ExternalConnectionState.CONNECTED]: 'status.connectedNotPaired',
  [ExternalConnectionState.CONNECTING]: 'status.connecting',
}

const STATUS_CLASSES: Partial<Record<ExternalConnectionState, string>> = {
  [ExternalConnectionState.PAIRED]: 'text-green-500',
  [ExternalConnectionState.PENDING_APPROVAL]: 'text-orange-500',
  [ExternalConnectionState.CONNECTED]: 'text-yellow-500',
  [ExternalConnectionState.CONNECTING]: 'text-blue-500',
}

/**
 * The background's vault connection as an extension page sees it: kept
 * current by the background's state broadcasts, plus connect/disconnect.
 * Call `refresh()` once the page is ready to show it.
 */
export function useVaultConnectionState() {
  const { t } = useI18n()
  const connection = ref<ExternalConnection>(disconnected())
  const isConnecting = ref(false)

  const canSendRequests = computed(() => canExternalClientSendRequests(connection.value.state))
  const statusText = computed(() => t(STATUS_TEXT_KEYS[connection.value.state] ?? 'status.disconnected'))
  const statusClass = computed(() => STATUS_CLASSES[connection.value.state] ?? 'text-red-500')

  async function refresh() {
    try {
      const response = await browser.runtime.sendMessage({ type: MSG_GET_CONNECTION_STATE }) as Partial<ExternalConnection> | undefined
      connection.value = { ...disconnected(), ...response }
    } catch (err) {
      console.error('Failed to get connection state:', err)
      connection.value = disconnected()
    }
  }

  async function connect() {
    isConnecting.value = true
    try {
      await browser.runtime.sendMessage({ type: MSG_CONNECT })
    } catch (err) {
      console.error('Failed to connect:', err)
    } finally {
      isConnecting.value = false
    }
    await refresh()
  }

  async function disconnect() {
    try {
      await browser.runtime.sendMessage({ type: MSG_DISCONNECT })
    } catch (err) {
      console.error('Failed to disconnect:', err)
    }
    await refresh()
  }

  const onBroadcast = (message: unknown) => {
    const msg = message as { type?: string, state?: Partial<ExternalConnection> }
    if (msg.type === MSG_CONNECTION_STATE && msg.state?.state !== undefined)
      connection.value = { ...disconnected(), ...msg.state }
  }
  onMounted(() => browser.runtime.onMessage.addListener(onBroadcast))
  onUnmounted(() => browser.runtime.onMessage.removeListener(onBroadcast))

  return { connection, isConnecting, canSendRequests, statusText, statusClass, refresh, connect, disconnect }
}
