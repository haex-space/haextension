<template>
  <div class="space-y-6">
    <!-- Device Info -->
    <ShadcnCard>
      <ShadcnCardHeader class="pb-2">
        <ShadcnCardTitle class="text-base">{{ t("deviceInfo") }}</ShadcnCardTitle>
      </ShadcnCardHeader>
      <ShadcnCardContent class="space-y-4">
        <div class="space-y-2">
          <ShadcnLabel for="alias">{{ t("deviceName") }}</ShadcnLabel>
          <div class="flex gap-2">
            <ShadcnInput
              id="alias"
              v-model="aliasInput"
              :placeholder="t('deviceNamePlaceholder')"
            />
            <ShadcnButton
              size="icon"
              variant="outline"
              :disabled="aliasInput === deviceInfo?.alias || !aliasInput"
              @click="onSaveAlias"
            >
              <Check class="w-4 h-4" />
            </ShadcnButton>
          </div>
        </div>

        <div v-if="deviceInfo" class="space-y-1 text-sm text-muted-foreground">
          <p>{{ t("deviceType") }}: {{ deviceInfo.deviceType }}</p>
          <p>{{ t("model") }}: {{ deviceInfo.deviceModel ?? "-" }}</p>
          <p class="font-mono text-xs break-all">
            {{ t("fingerprint") }}: {{ deviceInfo.fingerprint }}
          </p>
        </div>
      </ShadcnCardContent>
    </ShadcnCard>

    <!-- Transfer Settings -->
    <ShadcnCard>
      <ShadcnCardHeader class="pb-2">
        <ShadcnCardTitle class="text-base">{{ t("transferSettings") }}</ShadcnCardTitle>
      </ShadcnCardHeader>
      <ShadcnCardContent class="space-y-4">
        <!-- Port -->
        <div class="space-y-2">
          <ShadcnLabel for="port">{{ t("port") }}</ShadcnLabel>
          <ShadcnInput
            id="port"
            v-model.number="localSettings.port"
            type="number"
            :min="1024"
            :max="65535"
          />
          <p class="text-xs text-muted-foreground">{{ t("portHint") }}</p>
        </div>

        <!-- Save Directory -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("saveDirectory") }}</ShadcnLabel>
          <div class="flex gap-2">
            <ShadcnInput
              :model-value="localSettings.saveDirectory ?? t('notSet')"
              readonly
              class="flex-1"
            />
            <ShadcnButton variant="outline" @click="onSelectSaveDir">
              <FolderOpen class="w-4 h-4" />
            </ShadcnButton>
          </div>
        </div>

        <!-- Auto Accept -->
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <ShadcnLabel>{{ t("autoAccept") }}</ShadcnLabel>
            <p class="text-xs text-muted-foreground">{{ t("autoAcceptHint") }}</p>
          </div>
          <ShadcnSwitch v-model:checked="localSettings.autoAccept" />
        </div>

        <!-- Notifications -->
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <ShadcnLabel>{{ t("notifications") }}</ShadcnLabel>
            <p class="text-xs text-muted-foreground">{{ t("notificationsHint") }}</p>
          </div>
          <ShadcnSwitch v-model:checked="localSettings.showNotifications" />
        </div>
      </ShadcnCardContent>
    </ShadcnCard>

    <!-- PIN Protection -->
    <ShadcnCard>
      <ShadcnCardHeader class="pb-2">
        <ShadcnCardTitle class="text-base">{{ t("security") }}</ShadcnCardTitle>
      </ShadcnCardHeader>
      <ShadcnCardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <ShadcnLabel>{{ t("requirePin") }}</ShadcnLabel>
            <p class="text-xs text-muted-foreground">{{ t("requirePinHint") }}</p>
          </div>
          <ShadcnSwitch v-model:checked="localSettings.requirePin" />
        </div>

        <div v-if="localSettings.requirePin" class="space-y-2">
          <ShadcnLabel for="pin">{{ t("pin") }}</ShadcnLabel>
          <ShadcnInput
            id="pin"
            :model-value="localSettings.pin ?? ''"
            type="text"
            inputmode="numeric"
            maxlength="6"
            :placeholder="t('pinPlaceholder')"
            @update:model-value="localSettings.pin = ($event as string) || null"
          />
        </div>
      </ShadcnCardContent>
    </ShadcnCard>

    <!-- Save Button -->
    <ShadcnButton
      class="w-full"
      :disabled="!hasChanges"
      @click="onSaveSettings"
    >
      <Save class="w-4 h-4 mr-2" />
      {{ t("saveSettings") }}
    </ShadcnButton>
  </div>
</template>

<script setup lang="ts">
import { Check, FolderOpen, Save } from "lucide-vue-next";
import type { LocalSendSettings } from "@haex-space/vault-sdk";

const { t } = useI18n();
const localSendStore = useLocalSendStore();
const haexVaultStore = useHaexVaultStore();

const { deviceInfo, settings } = storeToRefs(localSendStore);

const aliasInput = ref("");

const localSettings = ref<LocalSendSettings>({
  alias: "",
  port: 53317,
  autoAccept: false,
  saveDirectory: null,
  requirePin: false,
  pin: null,
  showNotifications: true,
});

const hasChanges = computed(() => {
  if (!settings.value) return false;
  return JSON.stringify(localSettings.value) !== JSON.stringify(settings.value);
});

// Initialize from store settings
watch(
  settings,
  (newSettings) => {
    if (newSettings) {
      localSettings.value = { ...newSettings };
    }
  },
  { immediate: true }
);

watch(
  deviceInfo,
  (info) => {
    if (info) {
      aliasInput.value = info.alias;
    }
  },
  { immediate: true }
);

const onSaveAlias = async () => {
  if (aliasInput.value && aliasInput.value !== deviceInfo.value?.alias) {
    await localSendStore.setAliasAsync(aliasInput.value);
  }
};

const onSelectSaveDir = async () => {
  const dir = await haexVaultStore.client.filesystem.selectFolder({
    title: t("selectSaveDirectory"),
  });

  if (dir) {
    localSettings.value.saveDirectory = dir;
  }
};

const onSaveSettings = async () => {
  await localSendStore.updateSettingsAsync(localSettings.value);
};
</script>

<i18n lang="yaml">
de:
  deviceInfo: Geräte-Info
  deviceName: Gerätename
  deviceNamePlaceholder: Mein Gerät
  deviceType: Gerätetyp
  model: Modell
  fingerprint: Fingerabdruck
  transferSettings: Übertragungseinstellungen
  port: Port
  portHint: Standard ist 53317. Nur ändern bei Konflikten.
  saveDirectory: Speicherort
  notSet: Nicht festgelegt
  selectSaveDirectory: Speicherort auswählen
  autoAccept: Automatisch akzeptieren
  autoAcceptHint: Übertragungen von bekannten Geräten automatisch akzeptieren
  notifications: Benachrichtigungen
  notificationsHint: Bei eingehenden Übertragungen benachrichtigen
  security: Sicherheit
  requirePin: PIN erforderlich
  requirePinHint: Eingehende Übertragungen erfordern PIN
  pin: PIN
  pinPlaceholder: 4-6 Ziffern
  saveSettings: Einstellungen speichern
en:
  deviceInfo: Device Info
  deviceName: Device Name
  deviceNamePlaceholder: My Device
  deviceType: Device Type
  model: Model
  fingerprint: Fingerprint
  transferSettings: Transfer Settings
  port: Port
  portHint: Default is 53317. Only change if there are conflicts.
  saveDirectory: Save Directory
  notSet: Not set
  selectSaveDirectory: Select Save Directory
  autoAccept: Auto Accept
  autoAcceptHint: Automatically accept transfers from known devices
  notifications: Notifications
  notificationsHint: Show notifications for incoming transfers
  security: Security
  requirePin: Require PIN
  requirePinHint: Incoming transfers require a PIN
  pin: PIN
  pinPlaceholder: 4-6 digits
  saveSettings: Save Settings
</i18n>
