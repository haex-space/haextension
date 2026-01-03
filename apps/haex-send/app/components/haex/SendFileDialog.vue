<template>
  <UiDrawerModal
    v-model:open="modelOpen"
    :title="t('title')"
    :description="t('description', { device: device?.alias ?? '' })"
  >
    <template #content>
      <div class="space-y-4">
        <!-- File selection -->
        <div class="space-y-2">
          <ShadcnButton variant="outline" class="w-full" @click="onSelectFiles">
            <FolderOpen class="w-4 h-4 mr-2" />
            {{ t("selectFiles") }}
          </ShadcnButton>

          <!-- Selected files list -->
          <div v-if="selectedFiles.length > 0" class="space-y-2 max-h-48 overflow-y-auto">
            <div
              v-for="(file, index) in selectedFiles"
              :key="index"
              class="flex items-center gap-2 p-2 bg-muted rounded-md"
            >
              <File class="w-4 h-4 shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-sm truncate">{{ file.fileName }}</p>
                <p class="text-xs text-muted-foreground">{{ formatFileSize(file.size) }}</p>
              </div>
              <ShadcnButton variant="ghost" size="icon" class="shrink-0" @click="onRemoveFile(index)">
                <X class="w-4 h-4" />
              </ShadcnButton>
            </div>
          </div>

          <!-- Total size -->
          <p v-if="selectedFiles.length > 0" class="text-sm text-muted-foreground">
            {{ t("totalSize", { size: formatFileSize(totalSize) }) }}
          </p>
        </div>

        <!-- Progress -->
        <div v-if="isSending" class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span>{{ t("sending") }}</span>
            <span>{{ progress }}%</span>
          </div>
          <ShadcnProgress :model-value="progress" />
        </div>
      </div>
    </template>

    <template #footer>
      <ShadcnButton variant="outline" :disabled="isSending" @click="modelOpen = false">
        {{ t("cancel") }}
      </ShadcnButton>
      <ShadcnButton
        :disabled="selectedFiles.length === 0 || isSending"
        @click="onSend"
      >
        <Send class="w-4 h-4 mr-2" />
        {{ t("send") }}
      </ShadcnButton>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { FolderOpen, File, X, Send } from "lucide-vue-next";
import type { Device, LocalSendFileInfo } from "@haex-space/vault-sdk";

const props = defineProps<{
  device: Device | null;
}>();

const emit = defineEmits<{
  sent: [];
}>();

const modelOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const localSendStore = useLocalSendStore();
const haexVaultStore = useHaexVaultStore();

const selectedFiles = ref<LocalSendFileInfo[]>([]);
const isSending = ref(false);
const progress = ref(0);
const currentSessionId = ref<string | null>(null);

const totalSize = computed(() =>
  selectedFiles.value.reduce((sum, f) => sum + f.size, 0)
);

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const onSelectFiles = async () => {
  const paths = await haexVaultStore.client.filesystem.selectFile({
    multiple: true,
  });

  if (paths && paths.length > 0) {
    const files = await localSendStore.prepareFilesAsync(paths);
    selectedFiles.value = [...selectedFiles.value, ...files];
  }
};

const onRemoveFile = (index: number) => {
  selectedFiles.value.splice(index, 1);
};

const onSend = async () => {
  if (!props.device || selectedFiles.value.length === 0) return;

  isSending.value = true;
  progress.value = 0;

  try {
    currentSessionId.value = await localSendStore.sendFilesAsync(
      props.device,
      selectedFiles.value
    );

    // Watch for progress updates
    const unwatch = watch(
      () => localSendStore.activeTransfers.get(currentSessionId.value!),
      (transferProgress) => {
        if (transferProgress) {
          const percent = Math.round(
            (Number(transferProgress.bytesTransferred) / Number(transferProgress.totalBytes)) * 100
          );
          progress.value = percent;

          if (percent >= 100) {
            unwatch();
            onSendComplete();
          }
        }
      },
      { immediate: true }
    );
  } catch (error) {
    console.error("[Send] Failed:", error);
    isSending.value = false;
  }
};

const onSendComplete = () => {
  isSending.value = false;
  selectedFiles.value = [];
  currentSessionId.value = null;
  emit("sent");
};

// Reset state when dialog closes
watch(modelOpen, (open) => {
  if (!open) {
    selectedFiles.value = [];
    progress.value = 0;
    isSending.value = false;
  }
});
</script>

<i18n lang="yaml">
de:
  title: Dateien senden
  description: "An {device} senden"
  selectFiles: Dateien auswählen
  totalSize: "Gesamt: {size}"
  sending: Wird gesendet...
  cancel: Abbrechen
  send: Senden
en:
  title: Send Files
  description: "Send to {device}"
  selectFiles: Select Files
  totalSize: "Total: {size}"
  sending: Sending...
  cancel: Cancel
  send: Send
</i18n>
