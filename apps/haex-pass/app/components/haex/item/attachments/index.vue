<template>
  <div class="space-y-4">
    <!-- Existing Attachments -->
    <div v-if="attachments.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="flex items-center gap-2 p-3 border rounded-lg transition-colors"
        :class="editingAttachment === attachment.id ? 'bg-muted' : 'cursor-pointer hover:bg-muted/50'"
        @click="editingAttachment !== attachment.id ? openViewer(attachment) : null"
      >
        <!-- Image Preview -->
        <div
          v-if="isImage(attachment.fileName) && getAttachmentData(attachment)"
          class="h-12 w-12 rounded overflow-hidden shrink-0"
        >
          <img
            :src="getAttachmentData(attachment)"
            :alt="attachment.fileName"
            class="h-full w-full object-cover"
          />
        </div>
        <!-- PDF Icon -->
        <FileText v-else-if="getFileType(attachment.fileName) === 'pdf'" class="h-5 w-5 text-red-500 shrink-0" />
        <!-- Text Icon -->
        <FileTypeIcon v-else-if="getFileType(attachment.fileName) === 'text'" class="h-5 w-5 text-blue-500 shrink-0" />
        <!-- File Icon -->
        <File v-else class="h-5 w-5 text-muted-foreground shrink-0" />

        <div class="flex-1 min-w-0">
          <!-- Edit mode -->
          <input
            v-if="editingAttachment === attachment.id"
            v-model="editingFileName"
            class="text-sm font-medium w-full bg-background border rounded px-2 py-1"
            @click.stop
            @keyup.enter="saveFileName(attachment)"
            @keyup.esc="cancelEditing"
          />
          <!-- Display mode -->
          <template v-else>
            <p class="text-sm font-medium truncate">{{ attachment.fileName }}</p>
            <p v-if="attachment.size" class="text-xs text-muted-foreground">
              {{ formatFileSize(attachment.size) }}
            </p>
          </template>
        </div>

        <!-- Edit mode buttons -->
        <template v-if="!readOnly && editingAttachment === attachment.id">
          <ShadcnButton
            :icon="Check"
            variant="ghost"
            size="icon-sm"
            @click.stop="saveFileName(attachment)"
          />
          <ShadcnButton
            :icon="X"
            variant="ghost"
            size="icon-sm"
            @click.stop="cancelEditing"
          />
        </template>

        <!-- Normal mode buttons -->
        <template v-else>
          <template v-if="!readOnly">
            <ShadcnButton
              :icon="Pencil"
              variant="ghost"
              size="icon-sm"
              @click.stop="startEditingFileName(attachment)"
            />
            <ShadcnButton
              :icon="Trash2"
              variant="ghost"
              size="icon-sm"
              @click.stop="removeExistingAttachment(attachment)"
            />
          </template>
          <ShadcnButton
            :icon="Download"
            variant="ghost"
            size="icon-sm"
            @click.stop="downloadAttachment(attachment)"
          />
        </template>
      </div>
    </div>

    <!-- Attachments to Add -->
    <div v-if="attachmentsToAdd.length" class="space-y-2">
      <p v-if="!readOnly" class="text-sm text-muted-foreground">
        {{ t("newAttachments") }}
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <div
          v-for="attachment in attachmentsToAdd"
          :key="attachment.id"
          class="flex items-center gap-2 p-3 border rounded-lg bg-muted/50 transition-colors"
          :class="editingAttachment === attachment.id ? 'bg-muted' : 'cursor-pointer hover:bg-muted'"
          @click="editingAttachment !== attachment.id ? openViewer(attachment) : null"
        >
        <!-- Image Preview for new attachments -->
        <div
          v-if="isImage(attachment.fileName) && getAttachmentData(attachment)"
          class="h-12 w-12 rounded overflow-hidden shrink-0"
        >
          <img
            :src="getAttachmentData(attachment)"
            :alt="attachment.fileName"
            class="h-full w-full object-cover"
          />
        </div>
        <!-- PDF Icon -->
        <FileText v-else-if="getFileType(attachment.fileName) === 'pdf'" class="h-5 w-5 text-red-500 shrink-0" />
        <!-- Text Icon -->
        <FileTypeIcon v-else-if="getFileType(attachment.fileName) === 'text'" class="h-5 w-5 text-blue-500 shrink-0" />
        <!-- File Icon -->
        <File v-else class="h-5 w-5 text-muted-foreground shrink-0" />

        <div class="flex-1 min-w-0">
          <!-- Edit mode -->
          <input
            v-if="editingAttachment === attachment.id"
            v-model="editingFileName"
            class="text-sm font-medium w-full bg-background border rounded px-2 py-1"
            @click.stop
            @keyup.enter="saveFileName(attachment)"
            @keyup.esc="cancelEditing"
          />
          <!-- Display mode -->
          <template v-else>
            <p class="text-sm font-medium truncate">{{ attachment.fileName }}</p>
            <p v-if="attachment.size" class="text-xs text-muted-foreground">
              {{ formatFileSize(attachment.size) }}
            </p>
          </template>
        </div>

        <!-- Edit mode buttons -->
        <template v-if="!readOnly && editingAttachment === attachment.id">
          <ShadcnButton
            :icon="Check"
            variant="ghost"
            size="icon-sm"
            @click.stop="saveFileName(attachment)"
          />
          <ShadcnButton
            :icon="X"
            variant="ghost"
            size="icon-sm"
            @click.stop="cancelEditing"
          />
        </template>

        <!-- Normal mode buttons -->
        <template v-else>
          <template v-if="!readOnly">
            <ShadcnButton
              :icon="Pencil"
              variant="ghost"
              size="icon-sm"
              @click.stop="startEditingFileName(attachment)"
            />
            <ShadcnButton
              :icon="Trash2"
              variant="ghost"
              size="icon-sm"
              @click.stop="removeNewAttachment(attachment)"
            />
          </template>
          <ShadcnButton
            :icon="Download"
            variant="ghost"
            size="icon-sm"
            @click.stop="downloadAttachment(attachment)"
          />
        </template>
        </div>
      </div>
    </div>

    <!-- No Attachments Message -->
    <div
      v-if="!attachments.length && !attachmentsToAdd.length"
      class="text-center text-muted-foreground py-8"
    >
      {{ t("noAttachments") }}
    </div>

    <!-- Upload Button -->
    <div v-if="!readOnly">
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        @change="onFileChange"
      />
      <ShadcnButton
        :icon="Plus"
        variant="outline"
        class="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
        @click="fileInput?.click()"
      >
        {{ t('addAttachment') }}
      </ShadcnButton>
    </div>

    <!-- File Viewer -->
    <HaexItemAttachmentsViewer
      v-model:open="viewerState.open"
      :attachment="viewerState.attachment"
      :file-type="viewerState.fileType"
      :data-url="viewerState.dataUrl"
      @download="downloadAttachment"
    />
  </div>
</template>

<script setup lang="ts">
import { Plus, File, FileText, FileType as FileTypeIcon, Trash2, X, Pencil, Check, Download } from "lucide-vue-next";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";
import { eq } from "drizzle-orm";
import { haexPasswordsBinaries } from "~/database";
import { getFileType, isImage, formatFileSize, type FileType } from "~/utils/fileTypes";
import type { AttachmentWithSize } from "~/types/attachment";

// Type guard to check if attachment has data (new attachment)
function isNewAttachment(attachment: AttachmentWithSize): boolean {
  return 'data' in attachment && typeof attachment.data === 'string';
}

defineProps<{
  itemId: string;
  readOnly?: boolean;
}>();

const attachments = defineModel<AttachmentWithSize[]>({ default: [] });
const attachmentsToAdd = defineModel<AttachmentWithSize[]>("attachmentsToAdd", {
  default: [],
});
const attachmentsToDelete = defineModel<AttachmentWithSize[]>(
  "attachmentsToDelete",
  { default: [] }
);

const { t } = useI18n();
const fileInput = ref<HTMLInputElement>();
const haexhubStore = useHaexVaultStore();
const { orm } = storeToRefs(haexhubStore);
const client = haexhubStore.client;

// Edit mode state
const editingAttachment = ref<string | null>(null);
const editingFileName = ref<string>("");

// Viewer state
const viewerState = reactive<{
  open: boolean;
  attachment: AttachmentWithSize | null;
  fileType: FileType | null;
  dataUrl: string | null;
}>({
  open: false,
  attachment: null,
  fileType: null,
  dataUrl: null,
});

// Get attachment data
function getAttachmentData(attachment: AttachmentWithSize): string | undefined {
  // Check if this is a new attachment with data
  if (!isNewAttachment(attachment) || !attachment.data) {
    return undefined;
  }

  // Create data URL with appropriate MIME type
  return createDataUrl(attachment.data, attachment.fileName);
}

// Open viewer based on file type
function openViewer(attachment: AttachmentWithSize) {
  const fileType = getFileType(attachment.fileName);

  // For images, use PhotoSwipe gallery
  if (fileType === 'image') {
    openGallery(attachment);
    return;
  }

  // For PDF and text, use the viewer dialog
  if (fileType === 'pdf' || fileType === 'text') {
    const dataUrl = getAttachmentData(attachment);
    if (!dataUrl) return;

    viewerState.attachment = attachment;
    viewerState.fileType = fileType;
    viewerState.dataUrl = dataUrl;
    viewerState.open = true;
    return;
  }

  // For other types, do nothing (user can still download)
}

// Open PhotoSwipe gallery
async function openGallery(attachment: AttachmentWithSize) {
  // Combine all attachments (existing + new)
  const allAttachments = [...attachments.value, ...attachmentsToAdd.value];
  const images = allAttachments.filter((a) => isImage(a.fileName));
  const imageIndex = images.findIndex((img) => img.id === attachment.id);

  if (imageIndex === -1) return;

  // Load images and get their actual dimensions
  const items = await Promise.all(
    images.map(async (img) => {
      const src = getAttachmentData(img) || "";

      // Load image to get actual dimensions
      const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
        const image = new Image();
        image.onload = () => {
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => {
          // Fallback dimensions if image fails to load
          resolve({ width: 1920, height: 1080 });
        };
        image.src = src;
      });

      return {
        src,
        width: dimensions.width,
        height: dimensions.height,
        alt: img.fileName,
      };
    })
  );

  const lightbox = new PhotoSwipeLightbox({
    dataSource: items,
    pswpModule: () => import("photoswipe"),
    index: imageIndex,
    showHideAnimationType: 'zoom',
    preload: [1, 2],
  });

  lightbox.init();
  lightbox.loadAndOpen(imageIndex);
}

// Remove existing attachment
function removeExistingAttachment(attachment: AttachmentWithSize) {
  attachmentsToDelete.value = [...attachmentsToDelete.value, attachment];
  attachments.value = attachments.value.filter((a) => a.id !== attachment.id);
}

// Remove new attachment
function removeNewAttachment(attachment: AttachmentWithSize) {
  attachmentsToAdd.value = attachmentsToAdd.value.filter((a) => a.id !== attachment.id);
}

// Start editing attachment filename
function startEditingFileName(attachment: AttachmentWithSize) {
  editingAttachment.value = attachment.id;
  editingFileName.value = attachment.fileName;
}

// Save edited filename
function saveFileName(attachment: AttachmentWithSize) {
  if (editingFileName.value.trim()) {
    attachment.fileName = editingFileName.value.trim();
  }
  editingAttachment.value = null;
  editingFileName.value = "";
}

// Cancel editing
function cancelEditing() {
  editingAttachment.value = null;
  editingFileName.value = "";
}

// Download attachment
async function downloadAttachment(attachment: AttachmentWithSize) {
  if (!client) {
    console.error("[Attachments] Download - HaexHub client not available");
    return;
  }

  console.log("[Attachments] Download - attachment:", attachment);
  console.log("[Attachments] Download - binaryHash:", attachment.binaryHash);

  try {
    let base64Data: string;

    // Check if this is a new attachment (has data property) or existing (needs DB lookup)
    if (isNewAttachment(attachment) && attachment.data) {
      // New attachment - use the data directly
      base64Data = attachment.data;
      console.log("[Attachments] Download - Using data from new attachment");
    } else if (attachment.binaryHash && orm.value) {
      // Existing attachment - query the database
      const result = await orm.value
        .select()
        .from(haexPasswordsBinaries)
        .where(eq(haexPasswordsBinaries.hash, attachment.binaryHash))
        .limit(1);

      console.log("[Attachments] Download - query result:", result);
      console.log("[Attachments] Download - result length:", result.length);
      console.log(
        "[Attachments] Download - has data:",
        result[0]?.data ? "yes" : "no"
      );

      if (!result.length || !result[0]?.data) {
        console.error("[Attachments] Download - Binary not found in database");
        return;
      }

      base64Data = result[0].data;
    } else {
      console.error("[Attachments] Download - No data available for attachment");
      return;
    }

    // Convert base64 to Uint8Array
    console.log("[Attachments] Download - base64Data length:", base64Data.length);
    console.log("[Attachments] Download - base64Data starts with:", base64Data.substring(0, 50));

    const base64Content = base64Data.split(',')[1] || base64Data;
    console.log("[Attachments] Download - base64Content length:", base64Content.length);
    console.log("[Attachments] Download - base64Content starts with:", base64Content.substring(0, 50));

    const binaryString = atob(base64Content);
    console.log("[Attachments] Download - binaryString length:", binaryString.length);

    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    console.log("[Attachments] Download - bytes length:", bytes.length);
    console.log("[Attachments] Download - bytes first 10:", Array.from(bytes.slice(0, 10)));

    // Use HaexHub Filesystem API to save file
    console.log("[Attachments] Download - Calling saveFileAsync with", bytes.length, "bytes");
    const saveResult = await client.filesystem.saveFileAsync(bytes, {
      defaultPath: attachment.fileName,
      title: t("saveFile"),
    });

    console.log("[Attachments] Download - saveResult:", saveResult);

    if (!saveResult) {
      // User cancelled
      return;
    }

    console.log("[Attachments] Download - File saved successfully");
  } catch (error) {
    console.error("[Attachments] Download error:", error);
  }
}

// Handle file selection
async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);

  if (!files.length) return;

  // Convert files to base64 and add to attachmentsToAdd
  for (const file of files) {
    const reader = new FileReader();

    reader.onload = () => {
      const base64Data = reader.result as string;

      // Create a temporary attachment object
      const newAttachment: AttachmentWithSize = {
        id: crypto.randomUUID(),
        itemId: "", // Will be set when saving
        binaryHash: "", // Will be calculated when saving
        fileName: file.name,
        size: file.size,
        data: base64Data, // base64 data with data URL prefix
      };

      attachmentsToAdd.value = [...attachmentsToAdd.value, newAttachment];
    };

    reader.readAsDataURL(file);
  }

  // Reset input
  if (fileInput.value) {
    fileInput.value.value = "";
  }
}
</script>

<i18n lang="yaml">
de:
  noAttachments: Keine Anhänge vorhanden
  newAttachments: Neue Anhänge
  addAttachment: Anhang hinzufügen
  saveFile: Datei speichern

en:
  noAttachments: No attachments
  newAttachments: New attachments
  addAttachment: Add attachment
  saveFile: Save file
</i18n>
