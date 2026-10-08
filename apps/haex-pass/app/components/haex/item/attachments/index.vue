<template>
  <div class="space-y-4">
    <!-- Existing Attachments -->
    <div
      v-if="attachments.length"
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2"
    >
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="flex items-center gap-2 p-3 border rounded-lg transition-colors"
        :class="
          editingAttachment === attachment.id
            ? 'bg-muted'
            : 'cursor-pointer hover:bg-muted/50'
        "
        @click="
          editingAttachment !== attachment.id ? openViewer(attachment) : null
        "
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
        <FileText
          v-else-if="getFileType(attachment.fileName) === 'pdf'"
          class="h-5 w-5 text-red-500 shrink-0"
        />
        <!-- Text Icon -->
        <FileTypeIcon
          v-else-if="getFileType(attachment.fileName) === 'text'"
          class="h-5 w-5 text-blue-500 shrink-0"
        />
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
            <p class="text-sm font-medium truncate">
              {{ attachment.fileName }}
            </p>
            <p v-if="attachment.size" class="text-xs text-muted-foreground">
              {{ formatFileSize(attachment.size) }}
            </p>
          </template>
        </div>

        <!-- Edit mode buttons -->
        <template v-if="!readOnly && editingAttachment === attachment.id">
          <UiButton
            :icon="Check"
            variant="ghost"
            size="icon-sm"
            @click.stop="saveFileName(attachment)"
          />
          <UiButton
            :icon="X"
            variant="ghost"
            size="icon-sm"
            @click.stop="cancelEditing"
          />
        </template>

        <!-- Normal mode buttons -->
        <template v-else>
          <template v-if="!readOnly">
            <UiButton
              :icon="Pencil"
              variant="ghost"
              size="icon-sm"
              @click.stop="startEditingFileName(attachment)"
            />
            <UiButton
              :icon="Trash2"
              variant="ghost"
              size="icon-sm"
              @click.stop="removeExistingAttachment(attachment)"
            />
          </template>
          <UiButton
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
          :class="
            editingAttachment === attachment.id
              ? 'bg-muted'
              : 'cursor-pointer hover:bg-muted'
          "
          @click="
            editingAttachment !== attachment.id ? openViewer(attachment) : null
          "
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
          <FileText
            v-else-if="getFileType(attachment.fileName) === 'pdf'"
            class="h-5 w-5 text-red-500 shrink-0"
          />
          <!-- Text Icon -->
          <FileTypeIcon
            v-else-if="getFileType(attachment.fileName) === 'text'"
            class="h-5 w-5 text-blue-500 shrink-0"
          />
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
              <p class="text-sm font-medium truncate">
                {{ attachment.fileName }}
              </p>
              <p v-if="attachment.size" class="text-xs text-muted-foreground">
                {{ formatFileSize(attachment.size) }}
              </p>
            </template>
          </div>

          <!-- Edit mode buttons -->
          <template v-if="!readOnly && editingAttachment === attachment.id">
            <UiButton
              :icon="Check"
              variant="ghost"
              size="icon-sm"
              @click.stop="saveFileName(attachment)"
            />
            <UiButton
              :icon="X"
              variant="ghost"
              size="icon-sm"
              @click.stop="cancelEditing"
            />
          </template>

          <!-- Normal mode buttons -->
          <template v-else>
            <template v-if="!readOnly">
              <UiButton
                :icon="Pencil"
                variant="ghost"
                size="icon-sm"
                @click.stop="startEditingFileName(attachment)"
              />
              <UiButton
                :icon="Trash2"
                variant="ghost"
                size="icon-sm"
                @click.stop="removeNewAttachment(attachment)"
              />
            </template>
            <UiButton
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
    <div>
      <input
        v-if="!readOnly"
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        @change="onFileChange"
      />
      <UiButtonPrimary
        :icon="Plus"
        :disabled="readOnly"
        @click="fileInput?.click()"
      >
        {{ t("addAttachment") }}
      </UiButtonPrimary>
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
import {
  Plus,
  File,
  FileText,
  FileType as FileTypeIcon,
  Trash2,
  X,
  Pencil,
  Check,
  Download,
} from "@lucide/vue";
import { getFileType, isImage, formatFileSize } from "~/utils/fileTypes";
import type { AttachmentWithSize } from "~/types/attachment";

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

// Edit mode state
const editingAttachment = ref<string | null>(null);
const editingFileName = ref<string>("");

const { viewerState, getAttachmentData, openViewer, downloadAttachment } =
  useAttachmentViewer(attachments, attachmentsToAdd, t);

// Remove existing attachment
function removeExistingAttachment(attachment: AttachmentWithSize) {
  attachmentsToDelete.value = [...attachmentsToDelete.value, attachment];
  attachments.value = attachments.value.filter((a) => a.id !== attachment.id);
}

// Remove new attachment
function removeNewAttachment(attachment: AttachmentWithSize) {
  attachmentsToAdd.value = attachmentsToAdd.value.filter(
    (a) => a.id !== attachment.id
  );
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
