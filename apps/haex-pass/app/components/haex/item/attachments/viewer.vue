<template>
  <UiDialog v-model:open="isOpen">
    <UiDialogContent class="max-w-4xl max-h-[90vh] flex flex-col">
      <UiDialogHeader>
        <UiDialogTitle>{{ attachment?.fileName }}</UiDialogTitle>
      </UiDialogHeader>

      <div class="flex-1 overflow-auto">
        <!-- PDF Viewer -->
        <div v-if="fileType === 'pdf' && pdfBlobUrl" class="h-[70vh]">
          <embed
            :src="pdfBlobUrl"
            type="application/pdf"
            class="w-full h-full"
          />
        </div>

        <!-- Text Viewer (XSS-safe with automatic escaping) -->
        <div v-else-if="fileType === 'text' && textContent" class="p-4 bg-muted rounded">
          <pre class="text-sm whitespace-pre-wrap break-words font-mono">{{ textContent }}</pre>
        </div>

        <!-- Fallback for unsupported types -->
        <div v-else class="text-center py-8 text-muted-foreground">
          {{ t('previewNotAvailable') }}
        </div>
      </div>

      <UiDialogFooter>
        <UiButton
          v-if="attachment"
          :icon="Download"
          variant="outline"
          @click="$emit('download', attachment)"
        >
          {{ t('download') }}
        </UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>

<script setup lang="ts">
import { Download } from "lucide-vue-next";
import type { SelectHaexPasswordsItemBinaries } from "~/database";

interface AttachmentWithSize extends SelectHaexPasswordsItemBinaries {
  size?: number;
}

type FileType = 'image' | 'pdf' | 'text' | 'other';

const props = defineProps<{
  attachment: AttachmentWithSize | null;
  fileType: FileType | null;
  dataUrl: string | null;
}>();

defineEmits<{
  download: [attachment: AttachmentWithSize];
}>();

const isOpen = defineModel<boolean>('open', { default: false });

const { t } = useI18n();

// Create blob URL for PDF (works better than data URL in iframe)
const pdfBlobUrl = ref<string | null>(null);

watchEffect(() => {
  // Clean up old blob URL
  if (pdfBlobUrl.value) {
    URL.revokeObjectURL(pdfBlobUrl.value);
    pdfBlobUrl.value = null;
  }

  // Create new blob URL for PDF
  if (props.fileType === 'pdf' && props.dataUrl) {
    try {
      // Extract base64 content from data URL
      const base64Content = props.dataUrl.split(',')[1] || props.dataUrl;
      // Decode base64 to binary
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      // Create blob and URL
      const blob = new Blob([bytes], { type: 'application/pdf' });
      pdfBlobUrl.value = URL.createObjectURL(blob);
    } catch (error) {
      console.error('[Viewer] Failed to create PDF blob URL:', error);
    }
  }
});

// Clean up blob URL on unmount
onUnmounted(() => {
  if (pdfBlobUrl.value) {
    URL.revokeObjectURL(pdfBlobUrl.value);
  }
});

// Decode text content from base64
const textContent = computed(() => {
  if (props.fileType !== 'text' || !props.dataUrl) return null;

  try {
    // Extract base64 content from data URL
    const base64Content = props.dataUrl.split(',')[1] || props.dataUrl;
    // Decode base64 to text (atob returns binary string, decode as UTF-8)
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // Decode UTF-8
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  } catch (error) {
    console.error('[Viewer] Failed to decode text content:', error);
    return null;
  }
});
</script>

<i18n lang="yaml">
de:
  previewNotAvailable: Vorschau nicht verfügbar
  download: Herunterladen

en:
  previewNotAvailable: Preview not available
  download: Download
</i18n>
