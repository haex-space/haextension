<template>
  <div class="flex gap-4 h-full">
    <!-- Left: Scrollable Timeline List -->
    <div class="w-16 sm:w-64 shrink-0 overflow-y-auto px-4 py-4">
      <div v-if="snapshots.length" class="space-y-4">
        <div
          v-for="snapshot in sortedSnapshots"
          :key="snapshot.id"
          class="flex gap-3 cursor-pointer"
          @click="selectedSnapshot = snapshot"
        >
          <!-- Timeline dot and line -->
          <div class="flex flex-col items-center w-8 shrink-0">
            <div
              :class="[
                'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                selectedSnapshot?.id === snapshot.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              ]"
            >
              <Clock class="w-4 h-4" />
            </div>
            <!-- Connecting line (except for last item) -->
            <div
              v-if="snapshot !== sortedSnapshots[sortedSnapshots.length - 1]"
              class="w-0.5 flex-1 bg-border mt-2"
            />
          </div>

          <!-- Content (hidden on mobile) -->
          <div class="hidden sm:block flex-1 pb-4">
            <div
              class="rounded-lg p-2 transition-colors"
              :class="[
                selectedSnapshot?.id === snapshot.id
                  ? 'bg-primary/10'
                  : 'hover:bg-muted/50',
              ]"
            >
              <h3 class="font-medium text-sm">
                {{ formatRelativeDate(snapshot.modifiedAt || snapshot.createdAt) }}
              </h3>
              <p class="text-xs text-muted-foreground">
                {{ formatSnapshotSize(snapshot.snapshotData) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- No History Message -->
      <div v-else class="text-center text-muted-foreground py-8">
        {{ t('noHistory') }}
      </div>
    </div>

    <!-- Right: Snapshot Detail -->
    <div class="flex-1 overflow-y-auto px-4 py-4 border-l border-border">
      <div v-if="selectedSnapshot && parsedSnapshotData" class="flex flex-col gap-4 max-w-2xl">
        <div>
          <p class="text-sm text-muted-foreground">
            {{ t('modified') }}: {{ formatDate(selectedSnapshot.modifiedAt) }}
          </p>
        </div>

        <!-- Title -->
        <div v-if="parsedSnapshotData.title">
          <ShadcnLabel>{{ t('title') }}</ShadcnLabel>
          <HaexInput
            :model-value="parsedSnapshotData.title"
            readonly
          />
        </div>

        <!-- Username -->
        <div v-if="parsedSnapshotData.username">
          <ShadcnLabel>{{ t('username') }}</ShadcnLabel>
          <HaexInput
            :model-value="parsedSnapshotData.username"
            readonly
          />
        </div>

        <!-- Password -->
        <div v-if="parsedSnapshotData.password">
          <ShadcnLabel>{{ t('password') }}</ShadcnLabel>
          <HaexInputPassword
            :model-value="parsedSnapshotData.password"
            read-only
          />
        </div>

        <!-- URL -->
        <div v-if="parsedSnapshotData.url">
          <ShadcnLabel>{{ t('url') }}</ShadcnLabel>
          <HaexInput
            :model-value="parsedSnapshotData.url"
            readonly
          />
        </div>

        <!-- Note -->
        <div v-if="parsedSnapshotData.note">
          <ShadcnLabel>{{ t('note') }}</ShadcnLabel>
          <ShadcnTextarea
            :model-value="parsedSnapshotData.note"
            disabled
            class="min-h-[100px]"
          />
        </div>

        <!-- Tags -->
        <div v-if="parsedSnapshotData.tags">
          <ShadcnLabel>{{ t('tags') }}</ShadcnLabel>
          <HaexInput
            :model-value="parsedSnapshotData.tags"
            readonly
          />
        </div>

        <!-- OTP Secret -->
        <div v-if="parsedSnapshotData.otpSecret">
          <ShadcnLabel>{{ t('otpSecret') }}</ShadcnLabel>
          <HaexInput
            :model-value="parsedSnapshotData.otpSecret"
            readonly
          />
        </div>

        <!-- Custom Fields -->
        <div v-if="parsedSnapshotData.keyValues?.length" class="space-y-3">
          <h3 class="text-sm font-semibold">{{ t('customFields') }}</h3>
          <div
            v-for="(kv, index) in parsedSnapshotData.keyValues"
            :key="index"
            class="p-3 rounded-lg border border-border gap-3 grid grid-cols-1 sm:grid-cols-2"
          >
            <div>
              <ShadcnLabel>{{ t('key') }}</ShadcnLabel>
              <HaexInput
                :model-value="kv.key"
                readonly
              />
            </div>
            <div>
              <ShadcnLabel>{{ t('value') }}</ShadcnLabel>
              <HaexInput
                :model-value="kv.value"
                readonly
              />
            </div>
          </div>
        </div>

        <!-- Attachments -->
        <div v-if="historyAttachments.length" class="space-y-3">
          <h3 class="text-sm font-semibold">{{ t('attachments') }}</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            <div
              v-for="attachment in historyAttachments"
              :key="attachment.binaryHash"
              class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
              @click="openViewer(attachment)"
            >
              <!-- Image Preview -->
              <div
                v-if="isImage(attachment.fileName) && attachment.dataUrl"
                class="h-12 w-12 rounded overflow-hidden shrink-0"
              >
                <img
                  :src="attachment.dataUrl"
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
                <p class="text-sm font-medium truncate">{{ attachment.fileName }}</p>
                <p v-if="attachment.size" class="text-xs text-muted-foreground">
                  {{ formatFileSize(attachment.size) }}
                </p>
              </div>

              <ShadcnButton
                :icon="Download"
                variant="ghost"
                size="icon-sm"
                @click.stop="downloadAttachment(attachment)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- No Snapshot Selected -->
      <div v-else class="text-center text-muted-foreground py-8">
        {{ t('selectSnapshot') }}
      </div>
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
import { Clock, File, FileText, FileType as FileTypeIcon, Download } from 'lucide-vue-next';
import { useTimeAgo } from '@vueuse/core';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import { eq } from 'drizzle-orm';
import { haexPasswordsBinaries } from '~/database';
import type { SelectHaexPasswordsItemSnapshots } from '~/database';
import { getFileType, isImage, formatFileSize, createDataUrl, type FileType } from '~/utils/fileTypes';

interface SnapshotData {
  title?: string;
  username?: string;
  password?: string;
  url?: string;
  note?: string;
  tags?: string;
  otpSecret?: string | null;
  keyValues?: Array<{ key: string; value: string }>;
  attachments?: Array<{ fileName: string; binaryHash: string }>;
}

interface HistoryAttachment {
  id: string;
  itemId: string;
  fileName: string;
  binaryHash: string;
  size?: number;
  dataUrl?: string;
}

const props = defineProps<{
  itemId: string;
}>();

const { t, locale } = useI18n();
const { readSnapshotsAsync } = usePasswordItemStore();
const haexhubStore = useHaexVaultStore();
const { orm } = storeToRefs(haexhubStore);
const client = haexhubStore.client;

const snapshots = ref<SelectHaexPasswordsItemSnapshots[]>([]);
const selectedSnapshot = ref<SelectHaexPasswordsItemSnapshots | null>(null);
const historyAttachments = ref<HistoryAttachment[]>([]);

// Viewer state
const viewerState = reactive<{
  open: boolean;
  attachment: HistoryAttachment | null;
  fileType: FileType | null;
  dataUrl: string | null;
}>({
  open: false,
  attachment: null,
  fileType: null,
  dataUrl: null,
});

// Load snapshots when component mounts or itemId changes
watch(() => props.itemId, async (newItemId) => {
  if (newItemId) {
    try {
      snapshots.value = await readSnapshotsAsync(newItemId);
    } catch (error) {
      console.error('Error loading snapshots:', error);
      snapshots.value = [];
    }
  }
}, { immediate: true });

// Sort snapshots by date (newest first)
const sortedSnapshots = computed(() => {
  return [...snapshots.value].sort((a, b) => {
    // Use modifiedAt if available, otherwise fall back to createdAt
    const dateA = new Date(a.modifiedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.modifiedAt || b.createdAt || 0).getTime();
    return dateB - dateA;
  });
});

// Auto-select first snapshot when list changes
watch(
  sortedSnapshots,
  (newSnapshots) => {
    if (newSnapshots.length > 0 && !selectedSnapshot.value) {
      selectedSnapshot.value = newSnapshots[0] ?? null;
    }
  },
  { immediate: true }
);

const parsedSnapshotData = computed<SnapshotData | null>(() => {
  if (!selectedSnapshot.value?.snapshotData) return null;

  try {
    return JSON.parse(selectedSnapshot.value.snapshotData) as SnapshotData;
  } catch {
    return null;
  }
});

// Load attachments when snapshot changes
watch(parsedSnapshotData, async (data) => {
  if (!data?.attachments?.length || !orm.value) {
    historyAttachments.value = [];
    return;
  }

  console.log('[History] Loading attachments:', data.attachments?.length, 'attachments');
  console.log('[History] Attachment details:', data.attachments);

  // Load binary data for each attachment
  const loadedAttachments = await Promise.all(
    data.attachments.map(async (att, index) => {
      console.log(`[History] Loading attachment ${index + 1}/${data.attachments?.length}:`, att.fileName, 'hash:', att.binaryHash);

      try {
        const result = await orm.value
          ?.select()
          .from(haexPasswordsBinaries)
          .where(eq(haexPasswordsBinaries.hash, att.binaryHash))
          .limit(1);

        console.log(`[History] Database result for ${att.fileName}:`, result?.length ? 'found' : 'NOT FOUND');

        if (!result?.length || !result[0]?.data) {
          console.warn(`[History] No data found for attachment ${att.fileName}`);
          return {
            id: att.binaryHash,
            itemId: props.itemId,
            fileName: att.fileName,
            binaryHash: att.binaryHash,
            dataUrl: undefined,
            size: undefined,
          };
        }

        const binary = result[0];
        const base64Data = binary.data;

        console.log(`[History] Binary data length for ${att.fileName}:`, base64Data?.length || 0, 'bytes, size:', binary.size);

        const fileType = getFileType(att.fileName);

        // Create data URL for images, PDFs, and text files (needed for viewer)
        if (fileType === 'image' || fileType === 'pdf' || fileType === 'text') {
          const dataUrl = createDataUrl(base64Data, att.fileName);
          console.log(`[History] Created data URL for ${fileType} ${att.fileName}`);

          return {
            id: att.binaryHash,
            itemId: props.itemId,
            fileName: att.fileName,
            binaryHash: att.binaryHash,
            dataUrl,
            size: binary.size ?? undefined,
          };
        }

        console.log(`[History] Other file type ${att.fileName}, type:`, fileType);
        return {
          id: att.binaryHash,
          itemId: props.itemId,
          fileName: att.fileName,
          binaryHash: att.binaryHash,
          dataUrl: undefined,
          size: binary.size ?? undefined,
        };
      } catch (error) {
        console.error(`[History] Error loading attachment ${att.fileName}:`, error);
        return {
          id: att.binaryHash,
          itemId: props.itemId,
          fileName: att.fileName,
          binaryHash: att.binaryHash,
          dataUrl: undefined,
          size: undefined,
        };
      }
    })
  );

  console.log('[History] All attachments loaded:', loadedAttachments.length);
  console.log('[History] Loaded attachment details:', loadedAttachments.map(a => ({ fileName: a.fileName, hasDataUrl: !!a.dataUrl, size: a.size })));

  historyAttachments.value = loadedAttachments;
}, { immediate: true });

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return t('unknown');

  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return t('unknown');
  }
}

function formatRelativeDate(dateString: string | null | undefined): string {
  if (!dateString) return t('unknown');

  try {
    // useTimeAgo has English built-in, only provide German translations
    const timeAgo = useTimeAgo(new Date(dateString), {
      messages:
        locale.value === 'de'
          ? {
              justNow: 'gerade eben',
              past: 'vor {0}',
              future: 'in {0}',
              second: (n: number) =>
                n === 1 ? 'einer Sekunde' : `${n} Sekunden`,
              minute: (n: number) =>
                n === 1 ? 'einer Minute' : `${n} Minuten`,
              hour: (n: number) => (n === 1 ? 'einer Stunde' : `${n} Stunden`),
              day: (n: number) => (n === 1 ? 'einem Tag' : `${n} Tagen`),
              week: (n: number) => (n === 1 ? 'einer Woche' : `${n} Wochen`),
              month: (n: number) => (n === 1 ? 'einem Monat' : `${n} Monaten`),
              year: (n: number) => (n === 1 ? 'einem Jahr' : `${n} Jahren`),
              invalid: '',
            }
          : undefined, // undefined = use built-in English messages
    });
    return timeAgo.value;
  } catch {
    return t('unknown');
  }
}

function formatSnapshotSize(snapshotData: string | null): string {
  if (!snapshotData) return '0 B';

  const bytes = new Blob([snapshotData]).size;
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Open viewer based on file type
function openViewer(attachment: HistoryAttachment) {
  const fileType = getFileType(attachment.fileName);

  // For images, use PhotoSwipe gallery
  if (fileType === 'image') {
    openGallery(attachment);
    return;
  }

  // For PDF and text, use the viewer dialog
  if (fileType === 'pdf' || fileType === 'text') {
    if (!attachment.dataUrl) return;

    viewerState.attachment = attachment;
    viewerState.fileType = fileType;
    viewerState.dataUrl = attachment.dataUrl;
    viewerState.open = true;
    return;
  }

  // For other types, do nothing (user can still download)
}

// Open PhotoSwipe gallery
async function openGallery(attachment: HistoryAttachment) {
  const images = historyAttachments.value.filter((a) => isImage(a.fileName));
  const imageIndex = images.findIndex((img) => img.binaryHash === attachment.binaryHash);

  if (imageIndex === -1) return;

  // Load images and get their actual dimensions
  const items = await Promise.all(
    images.map(async (img) => {
      const src = img.dataUrl || "";

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

// Download attachment
async function downloadAttachment(attachment: HistoryAttachment) {
  if (!client || !orm.value) {
    console.error("[History] Download - HaexHub client or ORM not available");
    return;
  }

  try {
    // Query the database for binary data
    const result = await orm.value
      .select()
      .from(haexPasswordsBinaries)
      .where(eq(haexPasswordsBinaries.hash, attachment.binaryHash))
      .limit(1);

    if (!result.length || !result[0]?.data) {
      console.error("[History] Download - Binary not found in database");
      return;
    }

    const base64Data = result[0].data;

    // Convert base64 to Uint8Array
    const base64Content = base64Data.split(',')[1] || base64Data;
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Use HaexHub Filesystem API to save file
    const saveResult = await client.filesystem.saveFileAsync(bytes, {
      defaultPath: attachment.fileName,
      title: t("saveFile"),
    });

    if (!saveResult) {
      // User cancelled
      return;
    }

    console.log("[History] Download - File saved successfully");
  } catch (error) {
    console.error("[History] Download error:", error);
  }
}
</script>

<i18n lang="yaml">
de:
  noHistory: Keine Versionshistorie vorhanden
  selectSnapshot: Wähle einen Snapshot aus der Liste
  modified: geändert am
  unknown: Unbekannt
  title: Titel
  username: Nutzername
  password: Passwort
  url: URL
  note: Notiz
  tags: Tags
  otpSecret: OTP Secret
  customFields: Benutzerdefinierte Felder
  key: Schlüssel
  value: Wert
  attachments: Anhänge
  hash: Hash
  saveFile: Datei speichern

en:
  noHistory: No version history available
  selectSnapshot: Select a snapshot from the list
  modified: modified at
  unknown: Unknown
  title: Title
  username: Username
  password: Password
  url: URL
  note: Note
  tags: Tags
  otpSecret: OTP Secret
  customFields: Custom Fields
  key: Key
  value: Value
  attachments: Attachments
  hash: Hash
  saveFile: Save file
</i18n>
