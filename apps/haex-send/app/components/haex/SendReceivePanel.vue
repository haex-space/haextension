<template>
  <div class="space-y-4">
    <!-- Server Status -->
    <ShadcnCard>
      <ShadcnCardHeader class="pb-2">
        <ShadcnCardTitle class="text-base flex items-center gap-2">
          <div
            :class="[
              'w-2 h-2 rounded-full',
              isServerRunning ? 'bg-green-500' : 'bg-red-500',
            ]"
          />
          {{ t("serverStatus") }}
        </ShadcnCardTitle>
      </ShadcnCardHeader>
      <ShadcnCardContent>
        <div v-if="isServerRunning" class="space-y-1 text-sm">
          <p class="text-muted-foreground">
            {{ t("listeningOn", { port: serverStatus?.port }) }}
          </p>
          <p v-if="serverStatus?.addresses?.length" class="text-muted-foreground">
            {{ serverStatus.addresses.join(", ") }}
          </p>
        </div>
        <div v-else class="space-y-2">
          <p class="text-sm text-muted-foreground">{{ t("serverStopped") }}</p>
          <ShadcnButton
            size="sm"
            :disabled="isServerStarting"
            @click="onStartServer"
          >
            <Power class="w-4 h-4 mr-2" />
            {{ t("startServer") }}
          </ShadcnButton>
        </div>
      </ShadcnCardContent>
    </ShadcnCard>

    <!-- Pending Transfers -->
    <div class="space-y-2">
      <h3 class="text-sm font-medium">{{ t("pendingTransfers") }}</h3>

      <div v-if="pendingTransfers.length > 0" class="space-y-2">
        <ShadcnCard v-for="transfer in pendingTransfers" :key="transfer.sessionId">
          <ShadcnCardContent class="p-4">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <component
                    :is="getDeviceIcon(transfer.sender.deviceType)"
                    class="w-4 h-4 shrink-0"
                  />
                  <span class="font-medium truncate">{{ transfer.sender.alias }}</span>
                </div>
                <p class="text-sm text-muted-foreground mt-1">
                  {{ t("filesCount", { count: transfer.files.length }) }} -
                  {{ formatFileSize(transfer.totalSize) }}
                </p>
                <div class="mt-2 space-y-1 max-h-20 overflow-y-auto">
                  <p
                    v-for="file in transfer.files.slice(0, 3)"
                    :key="file.id"
                    class="text-xs text-muted-foreground truncate"
                  >
                    {{ file.fileName }}
                  </p>
                  <p v-if="transfer.files.length > 3" class="text-xs text-muted-foreground">
                    {{ t("andMore", { count: transfer.files.length - 3 }) }}
                  </p>
                </div>
              </div>
              <div class="flex gap-2 shrink-0">
                <ShadcnButton
                  size="sm"
                  variant="outline"
                  @click="onReject(transfer.sessionId)"
                >
                  <X class="w-4 h-4" />
                </ShadcnButton>
                <ShadcnButton size="sm" @click="onAccept(transfer)">
                  <Check class="w-4 h-4" />
                </ShadcnButton>
              </div>
            </div>
          </ShadcnCardContent>
        </ShadcnCard>
      </div>

      <div v-else class="text-center py-8 text-muted-foreground">
        <Download class="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>{{ t("noPendingTransfers") }}</p>
      </div>
    </div>

    <!-- Active Transfers -->
    <div v-if="activeTransfersList.length > 0" class="space-y-2">
      <h3 class="text-sm font-medium">{{ t("activeTransfers") }}</h3>

      <ShadcnCard v-for="transfer in activeTransfersList" :key="transfer.sessionId">
        <ShadcnCardContent class="p-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm truncate">{{ transfer.fileName }}</span>
            <span class="text-sm text-muted-foreground">
              {{ Math.round((Number(transfer.bytesTransferred) / Number(transfer.totalBytes)) * 100) }}%
            </span>
          </div>
          <ShadcnProgress
            :model-value="Math.round((Number(transfer.bytesTransferred) / Number(transfer.totalBytes)) * 100)"
          />
          <p class="text-xs text-muted-foreground">
            {{ formatFileSize(transfer.speed) }}/s
          </p>
        </ShadcnCardContent>
      </ShadcnCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Power,
  Download,
  Check,
  X,
  Smartphone,
  Monitor,
  Globe,
  Server,
  HardDrive,
} from "lucide-vue-next";
import type { DeviceType, PendingTransfer } from "@haex-space/vault-sdk";

const { t } = useI18n();
const localSendStore = useLocalSendStore();
const haexVaultStore = useHaexVaultStore();

const {
  serverStatus,
  isServerRunning,
  isServerStarting,
  pendingTransfers,
  activeTransfers,
} = storeToRefs(localSendStore);

const activeTransfersList = computed(() =>
  Array.from(activeTransfers.value.values())
);

const getDeviceIcon = (type: DeviceType) => {
  switch (type) {
    case "mobile":
      return Smartphone;
    case "desktop":
      return Monitor;
    case "web":
      return Globe;
    case "server":
      return Server;
    case "headless":
      return HardDrive;
    default:
      return Monitor;
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const onStartServer = async () => {
  await localSendStore.startServerAsync();
};

const onAccept = async (transfer: PendingTransfer) => {
  // Let user select save directory
  const saveDir = await haexVaultStore.client.filesystem.selectFolder({
    title: t("selectSaveFolder"),
  });

  if (saveDir) {
    await localSendStore.acceptTransferAsync(transfer.sessionId, saveDir);
  }
};

const onReject = async (sessionId: string) => {
  await localSendStore.rejectTransferAsync(sessionId);
};
</script>

<i18n lang="yaml">
de:
  serverStatus: Server-Status
  listeningOn: "Port {port}"
  serverStopped: Server ist gestoppt
  startServer: Server starten
  pendingTransfers: Eingehende Übertragungen
  activeTransfers: Aktive Übertragungen
  noPendingTransfers: Keine eingehenden Übertragungen
  filesCount: "{count} Datei(en)"
  andMore: "und {count} weitere..."
  selectSaveFolder: Speicherort auswählen
en:
  serverStatus: Server Status
  listeningOn: "Port {port}"
  serverStopped: Server is stopped
  startServer: Start Server
  pendingTransfers: Incoming Transfers
  activeTransfers: Active Transfers
  noPendingTransfers: No incoming transfers
  filesCount: "{count} file(s)"
  andMore: "and {count} more..."
  selectSaveFolder: Select Save Folder
</i18n>
