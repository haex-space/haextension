<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('incomingTransfer')">
    <template #content>
      <div v-if="currentTransfer" class="space-y-4">
        <!-- Sender Info -->
        <div class="flex items-center gap-3">
          <div class="p-2 bg-muted rounded-full">
            <component
              :is="getDeviceIcon(currentTransfer.sender.deviceType)"
              class="w-5 h-5"
            />
          </div>
          <div>
            <p class="font-medium">{{ currentTransfer.sender.alias }}</p>
            <p class="text-sm text-muted-foreground">
              {{ currentTransfer.sender.address }}
            </p>
          </div>
        </div>

        <!-- File List -->
        <div>
          <p class="text-sm font-medium mb-2">
            {{ t("files", { count: currentTransfer.files.length }) }}
          </p>
          <div class="max-h-40 overflow-y-auto space-y-1 bg-muted rounded-md p-3">
            <div
              v-for="file in currentTransfer.files.slice(0, 10)"
              :key="file.id"
              class="flex items-center justify-between text-sm"
            >
              <span class="truncate flex-1 mr-2">{{ file.fileName }}</span>
              <span class="text-muted-foreground shrink-0">
                {{ formatFileSize(Number(file.size)) }}
              </span>
            </div>
            <p v-if="currentTransfer.files.length > 10" class="text-sm text-muted-foreground pt-1">
              {{ t("andMore", { count: currentTransfer.files.length - 10 }) }}
            </p>
          </div>
        </div>

        <!-- Total Size -->
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t("totalSize") }}</span>
          <span class="font-medium">{{ formatFileSize(Number(currentTransfer.totalSize)) }}</span>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex gap-2 w-full">
        <ShadcnButton variant="outline" class="flex-1" @click="onReject">
          <X class="w-4 h-4 mr-2" />
          {{ t("reject") }}
        </ShadcnButton>
        <ShadcnButton class="flex-1" @click="onAccept">
          <Check class="w-4 h-4 mr-2" />
          {{ t("accept") }}
        </ShadcnButton>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import {
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

const { pendingTransfers, settings } = storeToRefs(localSendStore);

const isOpen = computed({
  get: () => pendingTransfers.value.length > 0,
  set: () => {}, // Prevent external close - must accept or reject
});

const currentTransfer = computed(() => pendingTransfers.value[0] as PendingTransfer | undefined);

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

const onAccept = async () => {
  if (!currentTransfer.value) return;

  // Use default save directory from settings
  const saveDir = settings.value?.saveDirectory;

  if (saveDir) {
    await localSendStore.acceptTransferAsync(currentTransfer.value.sessionId, saveDir);
  } else {
    // Let user select folder if no default is set
    const selectedDir = await haexVaultStore.client.filesystem.selectFolder({
      title: t("selectSaveFolder"),
    });
    if (selectedDir) {
      await localSendStore.acceptTransferAsync(currentTransfer.value.sessionId, selectedDir);
    }
  }
};

const onReject = async () => {
  if (!currentTransfer.value) return;
  await localSendStore.rejectTransferAsync(currentTransfer.value.sessionId);
};
</script>

<i18n lang="yaml">
de:
  incomingTransfer: Eingehende Übertragung
  files: "{count} Datei(en)"
  andMore: "und {count} weitere..."
  totalSize: Gesamtgröße
  accept: Annehmen
  reject: Ablehnen
  selectSaveFolder: Speicherort auswählen
en:
  incomingTransfer: Incoming Transfer
  files: "{count} file(s)"
  andMore: "and {count} more..."
  totalSize: Total size
  accept: Accept
  reject: Reject
  selectSaveFolder: Select Save Folder
</i18n>
