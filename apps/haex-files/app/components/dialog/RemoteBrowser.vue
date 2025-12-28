<template>
  <ShadcnDialog v-model:open="isOpen">
    <ShadcnDialogContent class="max-w-2xl max-h-[80vh] flex flex-col">
      <ShadcnDialogHeader>
        <ShadcnDialogTitle>{{ t("title") }}</ShadcnDialogTitle>
        <ShadcnDialogDescription>{{ t("description") }}</ShadcnDialogDescription>
      </ShadcnDialogHeader>

      <div class="flex-1 overflow-hidden flex flex-col gap-4">
        <!-- Current path breadcrumb -->
        <div class="flex items-center gap-2 text-sm">
          <button
            class="text-muted-foreground hover:text-foreground transition-colors"
            :disabled="currentPath === ''"
            @click="navigateTo('')"
          >
            <Home class="size-4" />
          </button>
          <template v-if="currentPath">
            <ChevronRight class="size-4 text-muted-foreground" />
            <template v-for="(segment, index) in pathSegments" :key="index">
              <button
                class="hover:text-primary transition-colors truncate max-w-32"
                @click="navigateTo(pathSegments.slice(0, index + 1).join('/'))"
              >
                {{ segment }}
              </button>
              <ChevronRight v-if="index < pathSegments.length - 1" class="size-4 text-muted-foreground flex-shrink-0" />
            </template>
          </template>
        </div>

        <!-- Loading state -->
        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
          <Loader2 class="size-6 animate-spin text-muted-foreground" />
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <AlertCircle class="size-8 text-destructive" />
          <p class="text-sm text-muted-foreground">{{ error }}</p>
          <ShadcnButton variant="outline" size="sm" @click="loadFilesAsync">
            {{ t("retry") }}
          </ShadcnButton>
        </div>

        <!-- Empty state -->
        <div v-else-if="displayItems.length === 0" class="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <FolderOpen class="size-8 text-muted-foreground" />
          <p class="text-sm text-muted-foreground">{{ t("empty") }}</p>
        </div>

        <!-- File list -->
        <div v-else class="flex-1 overflow-auto border rounded-md">
          <div class="divide-y">
            <!-- Parent directory -->
            <button
              v-if="currentPath"
              class="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
              @click="navigateUp"
            >
              <CornerLeftUp class="size-4 text-muted-foreground" />
              <span class="text-sm text-muted-foreground">..</span>
            </button>

            <!-- Items -->
            <div
              v-for="item in displayItems"
              :key="item.key"
              class="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
              :class="{ 'bg-primary/10': isSelected(item) }"
            >
              <!-- Checkbox for selection -->
              <ShadcnCheckbox
                :model-value="isSelected(item)"
                @update:model-value="toggleSelection(item)"
              />

              <!-- Icon and name (clickable for folders) -->
              <button
                v-if="item.isDirectory"
                class="flex-1 flex items-center gap-3 text-left"
                @click="navigateTo(item.relativePath)"
              >
                <Folder class="size-4 text-primary" />
                <span class="text-sm truncate">{{ item.name }}</span>
              </button>
              <div v-else class="flex-1 flex items-center gap-3">
                <File class="size-4 text-muted-foreground" />
                <span class="text-sm truncate">{{ item.name }}</span>
                <span class="text-xs text-muted-foreground ml-auto">{{ formatSize(item.size) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Selection summary -->
        <div v-if="selectedItems.length > 0" class="text-sm text-muted-foreground">
          {{ t("selected", { count: selectedItems.length }) }}
        </div>
      </div>

      <ShadcnDialogFooter>
        <ShadcnButton variant="outline" @click="isOpen = false">
          {{ t("cancel") }}
        </ShadcnButton>
        <ShadcnButton :disabled="selectedItems.length === 0" @click="confirmSelection">
          {{ t("select") }}
        </ShadcnButton>
      </ShadcnDialogFooter>
    </ShadcnDialogContent>
  </ShadcnDialog>
</template>

<script setup lang="ts">
import {
  Home,
  ChevronRight,
  Loader2,
  AlertCircle,
  FolderOpen,
  CornerLeftUp,
  Folder,
  File,
} from "lucide-vue-next";

interface RemoteItem {
  key: string;
  name: string;
  relativePath: string;
  size: number;
  isDirectory: boolean;
  lastModified: string | null;
  backendId: string;
}

const isOpen = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  backendIds: string[];
}>();

const emit = defineEmits<{
  select: [paths: string[]];
}>();

const { t } = useI18n();
const haexVaultStore = useHaexVaultStore();

const isLoading = ref(false);
const error = ref<string | null>(null);
const currentPath = ref("");
const allItems = ref<RemoteItem[]>([]);
const selectedItems = ref<RemoteItem[]>([]);

const pathSegments = computed(() => {
  if (!currentPath.value) return [];
  return currentPath.value.split("/").filter(Boolean);
});

const displayItems = computed(() => {
  const prefix = currentPath.value ? currentPath.value + "/" : "";

  // Get items at current level
  const itemsAtLevel = new Map<string, RemoteItem>();

  for (const item of allItems.value) {
    // Skip items not under current path
    if (prefix && !item.relativePath.startsWith(prefix)) continue;

    // Get the remaining path after the prefix
    const remaining = prefix ? item.relativePath.slice(prefix.length) : item.relativePath;
    if (!remaining) continue;

    // Get the first segment of the remaining path
    const firstSlash = remaining.indexOf("/");
    const isNestedDir = firstSlash !== -1;
    const name = isNestedDir ? remaining.slice(0, firstSlash) : remaining;
    const itemPath = prefix + name;

    // If it's a nested directory or already exists as a directory, treat as directory
    if (isNestedDir) {
      if (!itemsAtLevel.has(itemPath)) {
        itemsAtLevel.set(itemPath, {
          key: itemPath,
          name,
          relativePath: itemPath,
          size: 0,
          isDirectory: true,
          lastModified: null,
          backendId: item.backendId,
        });
      }
    } else {
      // It's a file at this level
      itemsAtLevel.set(itemPath, {
        ...item,
        name,
        relativePath: itemPath,
      });
    }
  }

  // Sort: directories first, then by name
  return Array.from(itemsAtLevel.values()).sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
});

const navigateTo = (path: string) => {
  currentPath.value = path;
};

const navigateUp = () => {
  const segments = pathSegments.value;
  if (segments.length > 0) {
    currentPath.value = segments.slice(0, -1).join("/");
  }
};

const isSelected = (item: RemoteItem): boolean => {
  return selectedItems.value.some((s) => s.relativePath === item.relativePath);
};

const toggleSelection = (item: RemoteItem) => {
  const index = selectedItems.value.findIndex((s) => s.relativePath === item.relativePath);
  if (index === -1) {
    selectedItems.value.push(item);
  } else {
    selectedItems.value.splice(index, 1);
  }
};

const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const loadFilesAsync = async () => {
  if (props.backendIds.length === 0) {
    error.value = t("noBackends");
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    const items: RemoteItem[] = [];

    for (const backendId of props.backendIds) {
      const objects = await haexVaultStore.client.remoteStorage.list(backendId, "");

      for (const obj of objects) {
        items.push({
          key: obj.key,
          name: obj.key.split("/").pop() || obj.key,
          relativePath: obj.key,
          size: obj.size,
          isDirectory: false, // Will be determined by hierarchy
          lastModified: obj.lastModified ?? null,
          backendId,
        });
      }
    }

    allItems.value = items;
  } catch (err) {
    console.error("[RemoteBrowser] Failed to load files:", err);
    error.value = err instanceof Error ? err.message : t("error");
  } finally {
    isLoading.value = false;
  }
};

const confirmSelection = () => {
  const paths = selectedItems.value.map((item) => item.relativePath);
  emit("select", paths);
  isOpen.value = false;
};

// Load files when dialog opens
watch(isOpen, async (open) => {
  if (open) {
    currentPath.value = "";
    selectedItems.value = [];
    await loadFilesAsync();
  }
});
</script>

<i18n lang="yaml">
de:
  title: Remote-Dateien durchsuchen
  description: Wähle Ordner oder Dateien aus, die synchronisiert werden sollen.
  empty: Keine Dateien gefunden
  noBackends: Keine Backends ausgewählt
  error: Fehler beim Laden der Dateien
  retry: Erneut versuchen
  selected: "{count} ausgewählt"
  cancel: Abbrechen
  select: Auswählen

en:
  title: Browse Remote Files
  description: Select folders or files to synchronize.
  empty: No files found
  noBackends: No backends selected
  error: Failed to load files
  retry: Retry
  selected: "{count} selected"
  cancel: Cancel
  select: Select
</i18n>
