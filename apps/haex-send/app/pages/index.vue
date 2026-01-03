<template>
  <NuxtLayout name="default">
    <div class="h-full flex flex-col">
      <!-- Tab Navigation -->
      <div class="flex-none border-b border-border">
        <div class="flex">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="[
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground',
            ]"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" class="w-4 h-4 inline-block mr-2" />
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto">
        <!-- Send Tab -->
        <div v-if="activeTab === 'send'" class="p-4 space-y-4">
          <HaexSendDeviceList />
        </div>

        <!-- Receive Tab -->
        <div v-if="activeTab === 'receive'" class="p-4 space-y-4">
          <HaexSendReceivePanel />
        </div>

        <!-- Settings Tab -->
        <div v-if="activeTab === 'settings'" class="p-4 space-y-4">
          <HaexSendSettings />
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { Send, Download, Settings } from "lucide-vue-next";

const { t } = useI18n();
const localSendStore = useLocalSendStore();

const activeTab = ref<"send" | "receive" | "settings">("send");

const tabs = computed(() => [
  { id: "send" as const, label: t("tabs.send"), icon: Send },
  { id: "receive" as const, label: t("tabs.receive"), icon: Download },
  { id: "settings" as const, label: t("tabs.settings"), icon: Settings },
]);

// Initialize LocalSend when component mounts
onMounted(async () => {
  await localSendStore.initializeAsync();

  // Auto-start server and discovery
  if (!localSendStore.isServerRunning) {
    await localSendStore.startServerAsync();
  }

  // Start discovery on desktop
  await localSendStore.startDiscoveryAsync();
});

// Cleanup on unmount
onUnmounted(async () => {
  await localSendStore.stopDiscoveryAsync();
});
</script>

<i18n lang="yaml">
de:
  tabs:
    send: Senden
    receive: Empfangen
    settings: Einstellungen
en:
  tabs:
    send: Send
    receive: Receive
    settings: Settings
</i18n>
