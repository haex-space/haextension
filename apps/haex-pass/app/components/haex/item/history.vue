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
                {{
                  formatRelativeDate(snapshot.modifiedAt || snapshot.createdAt)
                }}
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
        {{ t("noHistory") }}
      </div>
    </div>

    <!-- Right: Snapshot Detail -->
    <div class="flex-1 overflow-y-auto px-4 py-4 border-l border-border">
      <div
        v-if="selectedSnapshot && parsedSnapshotData"
        class="flex flex-col gap-4 max-w-2xl mx-auto"
      >
        <div>
          <p class="text-sm text-muted-foreground">
            {{ t("modified") }}: {{ formatDate(selectedSnapshot.modifiedAt) }}
          </p>
        </div>

        <!-- Title -->
        <div v-if="parsedSnapshotData.title">
          <ShadcnLabel>{{ t("title") }}</ShadcnLabel>
          <HaexInput :model-value="parsedSnapshotData.title" readonly />
        </div>

        <!-- Username -->
        <div v-if="parsedSnapshotData.username">
          <ShadcnLabel>{{ t("username") }}</ShadcnLabel>
          <HaexInput :model-value="parsedSnapshotData.username" readonly />
        </div>

        <!-- Password -->
        <div v-if="parsedSnapshotData.password">
          <ShadcnLabel>{{ t("password") }}</ShadcnLabel>
          <HaexInputPassword
            :model-value="parsedSnapshotData.password"
            read-only
          />
        </div>

        <!-- URL -->
        <div v-if="parsedSnapshotData.url">
          <ShadcnLabel>{{ t("url") }}</ShadcnLabel>
          <HaexInput :model-value="parsedSnapshotData.url" readonly />
        </div>

        <!-- Note -->
        <div v-if="parsedSnapshotData.note">
          <ShadcnLabel>{{ t("note") }}</ShadcnLabel>
          <UiTextarea
            :model-value="parsedSnapshotData.note"
            readonly
            class="min-h-[100px]"
            with-copy
          />
        </div>

        <!-- Tags -->
        <div v-if="parsedSnapshotData.tags">
          <ShadcnLabel>{{ t("tags") }}</ShadcnLabel>
          <HaexInput :model-value="parsedSnapshotData.tags" readonly />
        </div>

        <!-- OTP Secret -->
        <div v-if="parsedSnapshotData.otpSecret">
          <ShadcnLabel>{{ t("otpSecret") }}</ShadcnLabel>
          <HaexInput :model-value="parsedSnapshotData.otpSecret" readonly />
        </div>

        <!-- Custom Fields -->
        <div v-if="parsedSnapshotData.keyValues?.length" class="space-y-3">
          <h3 class="text-sm font-semibold">{{ t("customFields") }}</h3>
          <div
            v-for="(kv, index) in parsedSnapshotData.keyValues"
            :key="index"
            class="p-3 rounded-lg border border-border gap-3 grid grid-cols-1 sm:grid-cols-2"
          >
            <div>
              <ShadcnLabel>{{ t("key") }}</ShadcnLabel>
              <HaexInput :model-value="kv.key" readonly />
            </div>
            <div>
              <ShadcnLabel>{{ t("value") }}</ShadcnLabel>
              <HaexInput :model-value="kv.value" readonly />
            </div>
          </div>
        </div>

        <!-- Attachments -->
        <div v-if="historyAttachments.length" class="space-y-3">
          <h3 class="text-sm font-semibold">{{ t("attachments") }}</h3>
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
                <p class="text-sm font-medium truncate">
                  {{ attachment.fileName }}
                </p>
                <p v-if="attachment.size" class="text-xs text-muted-foreground">
                  {{ formatFileSize(attachment.size) }}
                </p>
              </div>

              <UiButton
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
        {{ t("selectSnapshot") }}
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
import {
  Clock,
  File,
  FileText,
  FileType as FileTypeIcon,
  Download,
} from "@lucide/vue";
import { useTimeAgo } from "@vueuse/core";
import type { SelectHaexPasswordsItemSnapshots } from "~/database";
import { getFileType, isImage, formatFileSize } from "~/utils/fileTypes";

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

const props = defineProps<{
  itemId: string;
}>();

const { t, locale } = useI18n();
const { readSnapshotsAsync } = usePasswordItemStore();

const snapshots = ref<SelectHaexPasswordsItemSnapshots[]>([]);
const selectedSnapshot = ref<SelectHaexPasswordsItemSnapshots | null>(null);

// Load snapshots when component mounts or itemId changes
watch(
  () => props.itemId,
  async (newItemId) => {
    if (newItemId) {
      try {
        snapshots.value = await readSnapshotsAsync(newItemId);
      } catch (error) {
        console.error("Error loading snapshots:", error);
        snapshots.value = [];
      }
    }
  },
  { immediate: true }
);

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

const { historyAttachments, viewerState, openViewer, downloadAttachment } =
  useHistoryAttachments(props, parsedSnapshotData, t);

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return t("unknown");

  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return t("unknown");
  }
}

function formatRelativeDate(dateString: string | null | undefined): string {
  if (!dateString) return t("unknown");

  try {
    // useTimeAgo has English built-in, only provide German translations
    const timeAgo = useTimeAgo(new Date(dateString), {
      messages:
        locale.value === "de"
          ? {
              justNow: "gerade eben",
              past: "vor {0}",
              future: "in {0}",
              second: (n: number) =>
                n === 1 ? "einer Sekunde" : `${n} Sekunden`,
              minute: (n: number) =>
                n === 1 ? "einer Minute" : `${n} Minuten`,
              hour: (n: number) => (n === 1 ? "einer Stunde" : `${n} Stunden`),
              day: (n: number) => (n === 1 ? "einem Tag" : `${n} Tagen`),
              week: (n: number) => (n === 1 ? "einer Woche" : `${n} Wochen`),
              month: (n: number) => (n === 1 ? "einem Monat" : `${n} Monaten`),
              year: (n: number) => (n === 1 ? "einem Jahr" : `${n} Jahren`),
              invalid: "",
            }
          : undefined, // undefined = use built-in English messages
    });
    return timeAgo.value;
  } catch {
    return t("unknown");
  }
}

function formatSnapshotSize(snapshotData: string | null): string {
  if (!snapshotData) return "0 B";

  const bytes = new Blob([snapshotData]).size;
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
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
