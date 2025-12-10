<script setup lang="ts">
import { sendMessage } from 'webext-bridge/popup'
import { Loader2, PlugZap, Shield, ShieldCheck, ShieldOff } from 'lucide-vue-next'

interface ConnectionState {
  state: 'disconnected' | 'connecting' | 'connected' | 'paired'
  clientID: string | null
  error: string | null
}

const connection = ref<ConnectionState>({
  state: 'disconnected',
  clientID: null,
  error: null,
})

const isConnecting = ref(false)

const statusIcon = computed(() => {
  switch (connection.value.state) {
    case 'paired':
      return ShieldCheck
    case 'connected':
      return Shield
    case 'connecting':
      return Loader2
    default:
      return ShieldOff
  }
})

const statusText = computed(() => {
  switch (connection.value.state) {
    case 'paired':
      return 'Connected & Paired'
    case 'connected':
      return 'Connected (not paired)'
    case 'connecting':
      return 'Connecting...'
    default:
      return 'Disconnected'
  }
})

const statusClass = computed(() => {
  switch (connection.value.state) {
    case 'paired':
      return 'text-green-500'
    case 'connected':
      return 'text-yellow-500'
    case 'connecting':
      return 'text-blue-500'
    default:
      return 'text-red-500'
  }
})

async function fetchConnectionState() {
  try {
    const state = await sendMessage('get-connection-state', {})
    connection.value = state as ConnectionState
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
          haex-pass
        </h1>
        <p class="text-xs text-muted-foreground">
          Password Manager
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
            connection.state === 'connecting' ? 'animate-spin' : '',
          ]"
        />
        <span class="font-medium" :class="statusClass">
          {{ statusText }}
        </span>
      </div>

      <p v-if="connection.error" class="text-xs text-red-500 mb-2">
        {{ connection.error }}
      </p>

      <p v-if="connection.state === 'disconnected'" class="text-xs text-muted-foreground mb-3">
        Make sure haex-vault is running on your computer.
      </p>

      <div class="flex gap-2">
        <button
          v-if="connection.state === 'disconnected'"
          class="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          :disabled="isConnecting"
          @click="connect"
        >
          <PlugZap class="w-4 h-4" />
          Connect
        </button>

        <button
          v-else
          class="flex-1 inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          @click="disconnect"
        >
          Disconnect
        </button>
      </div>
    </div>

    <!-- Quick Actions -->
    <div v-if="connection.state === 'paired'" class="space-y-2">
      <p class="text-xs text-muted-foreground mb-2">
        Auto-fill is active. Click on the haex-pass icon in any login form to fill credentials.
      </p>
    </div>

    <!-- Footer -->
    <div class="pt-3 border-t mt-4">
      <button
        class="text-xs text-muted-foreground hover:text-foreground"
        @click="openOptions"
      >
        Settings
      </button>
    </div>
  </main>
</template>
