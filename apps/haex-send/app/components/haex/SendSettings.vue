<template>
  <div v-if="settings" class="space-y-6">
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
              @blur="onSaveAlias"
              @keyup.enter="onSaveAlias"
            />
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
            :model-value="settings.port"
            type="number"
            :min="1024"
            :max="65535"
            @blur="(e: FocusEvent) => onUpdateSetting('port', Number((e.target as HTMLInputElement).value))"
          />
          <p class="text-xs text-muted-foreground">{{ t("portHint") }}</p>
        </div>

        <!-- Save Directory -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("saveDirectory") }}</ShadcnLabel>
          <div class="flex gap-2">
            <ShadcnInput
              :model-value="settings.saveDirectory ?? t('notSet')"
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
          <ShadcnSwitch
            v-model="autoAccept"
          />
        </div>

        <!-- Notifications -->
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <ShadcnLabel>{{ t("notifications") }}</ShadcnLabel>
            <p class="text-xs text-muted-foreground">{{ t("notificationsHint") }}</p>
          </div>
          <ShadcnSwitch
            v-model="showNotifications"
          />
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
          <ShadcnSwitch
            v-model="requirePin"
          />
        </div>

        <div v-if="requirePin" class="space-y-2">
          <ShadcnLabel for="pin">{{ t("pin") }}</ShadcnLabel>
          <ShadcnInput
            id="pin"
            :model-value="settings.pin ?? ''"
            type="text"
            inputmode="numeric"
            maxlength="6"
            :placeholder="t('pinPlaceholder')"
            @blur="(e: FocusEvent) => onUpdateSetting('pin', (e.target as HTMLInputElement).value || null)"
          />
        </div>
      </ShadcnCardContent>
    </ShadcnCard>
  </div>
  <div v-else class="flex items-center justify-center h-32">
    <p class="text-muted-foreground">{{ t("loading") }}</p>
  </div>
</template>

<script setup lang="ts">
import { FolderOpen } from "lucide-vue-next";
import type { LocalSendSettings } from "@haex-space/vault-sdk";

const { t } = useI18n();
const localSendStore = useLocalSendStore();
const haexVaultStore = useHaexVaultStore();

const { deviceInfo, settings } = storeToRefs(localSendStore);

const aliasInput = ref("");
const autoAccept = ref(false);
const showNotifications = ref(true);
const requirePin = ref(false);

// Initialize from settings
watch(
  settings,
  (s) => {
    if (s) {
      autoAccept.value = s.autoAccept;
      showNotifications.value = s.showNotifications;
      requirePin.value = s.requirePin;
    }
  },
  { immediate: true }
);

// Initialize alias from device info
watch(
  deviceInfo,
  (info) => {
    if (info) {
      aliasInput.value = info.alias;
    }
  },
  { immediate: true }
);

// Save settings when local values change
watch(autoAccept, (v) => onUpdateSetting("autoAccept", v));
watch(showNotifications, (v) => onUpdateSetting("showNotifications", v));
watch(requirePin, (v) => onUpdateSetting("requirePin", v));

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
    await onUpdateSetting("saveDirectory", dir);
  }
};

// Update a single setting and save immediately
const onUpdateSetting = async <K extends keyof LocalSendSettings>(
  key: K,
  value: LocalSendSettings[K]
) => {
  if (!settings.value) return;

  // Skip if value hasn't changed
  if (settings.value[key] === value) return;

  const newSettings = { ...settings.value, [key]: value };
  await localSendStore.updateSettingsAsync(newSettings);
};
</script>

<i18n lang="yaml">
de:
  loading: Lade Einstellungen...
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
en:
  loading: Loading settings...
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
</i18n>
