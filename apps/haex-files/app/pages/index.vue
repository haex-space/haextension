<template>
  <div class="h-screen flex flex-col">
    <!-- Header -->
    <header class="border-b border-border px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <FolderSync class="size-6 text-primary" />
        <h1 class="text-lg font-semibold">{{ t("title") }}</h1>
      </div>
      <div class="flex items-center gap-2">
        <span
          v-if="syncStatus"
          class="text-sm text-muted-foreground flex items-center gap-1"
        >
          <component
            :is="syncStatusIcon"
            class="size-4"
            :class="syncStatusClass"
          />
          {{ syncStatusText }}
        </span>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 overflow-hidden flex">
      <!-- Sidebar -->
      <aside class="w-64 border-r border-border p-4 hidden md:block">
        <nav class="space-y-2">
          <button
            v-for="space in spaces"
            :key="space.id"
            class="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent text-left"
            :class="{ 'bg-accent': currentSpaceId === space.id }"
            @click="currentSpaceId = space.id"
          >
            <Folder class="size-4" />
            <span class="truncate">{{ space.name }}</span>
          </button>
        </nav>

        <div class="mt-6 pt-6 border-t border-border">
          <h3 class="text-sm font-medium text-muted-foreground mb-2">
            {{ t("backends") }}
          </h3>
          <div class="space-y-1">
            <div
              v-for="backend in backends"
              :key="backend.id"
              class="flex items-center gap-2 px-3 py-1 text-sm"
            >
              <Cloud class="size-4 text-muted-foreground" />
              <span class="truncate">{{ backend.name }}</span>
              <span
                class="ml-auto size-2 rounded-full"
                :class="backend.enabled ? 'bg-success' : 'bg-muted'"
              />
            </div>
          </div>
        </div>
      </aside>

      <!-- File Browser -->
      <div class="flex-1 p-4 overflow-auto">
        <div
          v-if="!isInitialized"
          class="h-full flex items-center justify-center"
        >
          <div class="text-center">
            <FolderSync class="size-12 text-muted-foreground mx-auto mb-4" />
            <h2 class="text-xl font-semibold mb-2">{{ t("welcome.title") }}</h2>
            <p class="text-muted-foreground mb-4">{{ t("welcome.description") }}</p>
            <button
              class="px-4 py-2 bg-primary text-primary-foreground rounded-md"
              @click="setupSync"
            >
              {{ t("welcome.setup") }}
            </button>
          </div>
        </div>

        <div v-else class="space-y-4">
          <!-- Breadcrumb -->
          <div class="flex items-center gap-1 text-sm text-muted-foreground">
            <button
              class="hover:text-foreground"
              @click="navigateToRoot"
            >
              {{ currentSpace?.name || t("files") }}
            </button>
            <template v-for="(segment, index) in pathSegments" :key="index">
              <ChevronRight class="size-4" />
              <button
                class="hover:text-foreground"
                @click="navigateToPath(index)"
              >
                {{ segment }}
              </button>
            </template>
          </div>

          <!-- File List -->
          <div class="grid gap-2">
            <div
              v-for="file in files"
              :key="file.id"
              class="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-accent cursor-pointer"
              @click="onFileClick(file)"
            >
              <component
                :is="file.isDirectory ? Folder : FileIcon"
                class="size-5 text-muted-foreground"
              />
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{{ file.name }}</div>
                <div class="text-sm text-muted-foreground">
                  {{ file.isDirectory ? t("folder") : formatSize(file.size) }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <component
                  :is="getSyncIcon(file.syncState)"
                  class="size-4"
                  :class="getSyncClass(file.syncState)"
                />
              </div>
            </div>

            <div
              v-if="files.length === 0"
              class="text-center py-12 text-muted-foreground"
            >
              {{ t("emptyFolder") }}
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import {
  FolderSync,
  Folder,
  Cloud,
  ChevronRight,
  File as FileIcon,
  Check,
  RefreshCw,
  AlertCircle,
  CloudOff,
} from "lucide-vue-next";

const { t } = useI18n();

// State
const isInitialized = ref(false);
const currentSpaceId = ref<string | null>(null);
const currentPath = ref<string[]>([]);
const syncStatus = ref<"synced" | "syncing" | "error" | "offline" | null>(null);

// Mock data - will be replaced with SDK calls
const spaces = ref([
  { id: "personal", name: "Persönlich" },
]);

const backends = ref([
  { id: "s3", name: "S3 Storage", type: "s3", enabled: true },
]);

const files = ref<Array<{
  id: string;
  name: string;
  isDirectory: boolean;
  size: number;
  syncState: "synced" | "syncing" | "local" | "remote" | "error";
}>>([]);

// Computed
const currentSpace = computed(() =>
  spaces.value.find((s) => s.id === currentSpaceId.value)
);

const pathSegments = computed(() => currentPath.value);

const syncStatusIcon = computed(() => {
  switch (syncStatus.value) {
    case "synced": return Check;
    case "syncing": return RefreshCw;
    case "error": return AlertCircle;
    case "offline": return CloudOff;
    default: return null;
  }
});

const syncStatusText = computed(() => {
  switch (syncStatus.value) {
    case "synced": return t("status.synced");
    case "syncing": return t("status.syncing");
    case "error": return t("status.error");
    case "offline": return t("status.offline");
    default: return "";
  }
});

const syncStatusClass = computed(() => {
  switch (syncStatus.value) {
    case "synced": return "text-success";
    case "syncing": return "text-primary animate-spin";
    case "error": return "text-destructive";
    case "offline": return "text-muted-foreground";
    default: return "";
  }
});

// Methods
const setupSync = () => {
  // TODO: Open setup dialog
  isInitialized.value = true;
  currentSpaceId.value = "personal";
  syncStatus.value = "synced";
};

const navigateToRoot = () => {
  currentPath.value = [];
};

const navigateToPath = (index: number) => {
  currentPath.value = currentPath.value.slice(0, index + 1);
};

const onFileClick = (file: typeof files.value[0]) => {
  if (file.isDirectory) {
    currentPath.value = [...currentPath.value, file.name];
  } else {
    // TODO: Open file
  }
};

const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getSyncIcon = (state: string) => {
  switch (state) {
    case "synced": return Check;
    case "syncing": return RefreshCw;
    case "error": return AlertCircle;
    default: return CloudOff;
  }
};

const getSyncClass = (state: string) => {
  switch (state) {
    case "synced": return "text-success";
    case "syncing": return "text-primary animate-spin";
    case "error": return "text-destructive";
    default: return "text-muted-foreground";
  }
};
</script>

<i18n lang="yaml">
de:
  title: haex-files
  files: Dateien
  folder: Ordner
  backends: Speicher
  emptyFolder: Dieser Ordner ist leer
  welcome:
    title: Willkommen bei haex-files
    description: Synchronisiere deine Dateien sicher und verschlüsselt zwischen deinen Geräten.
    setup: Sync einrichten
  status:
    synced: Synchronisiert
    syncing: Synchronisiere...
    error: Sync-Fehler
    offline: Offline

en:
  title: haex-files
  files: Files
  folder: Folder
  backends: Storage
  emptyFolder: This folder is empty
  welcome:
    title: Welcome to haex-files
    description: Sync your files securely and encrypted between your devices.
    setup: Setup Sync
  status:
    synced: Synced
    syncing: Syncing...
    error: Sync Error
    offline: Offline
</i18n>
