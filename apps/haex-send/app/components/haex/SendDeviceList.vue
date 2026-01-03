<template>
  <div class="space-y-4">
    <!-- Header with refresh -->
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">{{ t("devices") }}</h2>
      <ShadcnButton variant="ghost" size="icon" :disabled="isScanning" @click="onRefresh">
        <RefreshCw :class="['w-4 h-4', { 'animate-spin': isScanning }]" />
      </ShadcnButton>
    </div>

    <!-- Device list -->
    <div v-if="devices.length > 0" class="space-y-2">
      <ShadcnItemGroup>
        <ShadcnItem
          v-for="device in devices"
          :key="device.fingerprint"
          class="cursor-pointer hover:bg-accent"
          @click="onSelectDevice(device)"
        >
          <ShadcnItemMedia variant="icon">
            <component :is="getDeviceIcon(device.deviceType)" class="w-4 h-4" />
          </ShadcnItemMedia>
          <ShadcnItemContent>
            <ShadcnItemTitle>{{ device.alias }}</ShadcnItemTitle>
            <ShadcnItemDescription>
              {{ device.address }}:{{ device.port }}
            </ShadcnItemDescription>
          </ShadcnItemContent>
          <ShadcnItemActions>
            <ChevronRight class="w-4 h-4 text-muted-foreground" />
          </ShadcnItemActions>
        </ShadcnItem>
      </ShadcnItemGroup>
    </div>

    <!-- Empty state -->
    <div v-else class="text-center py-8 text-muted-foreground">
      <Wifi class="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p>{{ t("noDevices") }}</p>
      <p class="text-sm mt-2">{{ t("noDevicesHint") }}</p>
    </div>

    <!-- Send dialog -->
    <HaexSendFileDialog
      v-model:open="showSendDialog"
      :device="selectedDevice"
      @sent="onFileSent"
    />
  </div>
</template>

<script setup lang="ts">
import {
  RefreshCw,
  ChevronRight,
  Wifi,
  Smartphone,
  Monitor,
  Globe,
  Server,
  HardDrive,
} from "lucide-vue-next";
import type { Device, DeviceType } from "@haex-space/vault-sdk";

const { t } = useI18n();
const localSendStore = useLocalSendStore();

const { devices, isScanning } = storeToRefs(localSendStore);

const selectedDevice = ref<Device | null>(null);
const showSendDialog = ref(false);

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

const onRefresh = async () => {
  await localSendStore.refreshDevicesAsync();
};

const onSelectDevice = (device: Device) => {
  selectedDevice.value = device;
  showSendDialog.value = true;
};

const onFileSent = () => {
  showSendDialog.value = false;
  selectedDevice.value = null;
};
</script>

<i18n lang="yaml">
de:
  devices: Geräte in der Nähe
  noDevices: Keine Geräte gefunden
  noDevicesHint: Stelle sicher, dass andere Geräte LocalSend geöffnet haben
en:
  devices: Nearby Devices
  noDevices: No devices found
  noDevicesHint: Make sure other devices have LocalSend open
</i18n>
