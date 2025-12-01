<template>
  <div
    class="sticky top-0 z-20 bg-accent/50 border-b border-border px-3 py-2"
    style="backdrop-filter: blur(12px)"
  >
    <div class="flex items-center gap-2">
      <!-- Search -->
      <UiInputGroup class="flex-1">
        <UiInputGroupAddon>
          <Search class="h-4 w-4" />
        </UiInputGroupAddon>
        <UiInputGroupInput
          v-model="searchInput"
          :placeholder="t('search')"
          @keydown="onSearchKeydown"
        />
        <UiInputGroupButton
          v-show="searchInput"
          variant="ghost"
          size="sm"
          :icon="X"
          @click="searchInput = ''"
        />
      </UiInputGroup>

      <!-- Add / Progress -->
      <HaexButtonProgress
        v-if="isProcessing"
        :progress="processingProgress"
        class="shrink-0"
      />
      <UiDropdownMenu v-else>
        <UiDropdownMenuTrigger as-child>
          <UiButton
            :icon="Plus"
            :tooltip="t('add')"
            variant="default"
            class="shrink-0"
          />
        </UiDropdownMenuTrigger>
        <UiDropdownMenuContent align="end">
          <UiDropdownMenuItem @select="onCreateFolder">
            <Folder class="mr-2 h-4 w-4" />
            {{ t("addMenu.folder") }}
          </UiDropdownMenuItem>
          <UiDropdownMenuItem @select="onCreateItem">
            <Key class="mr-2 h-4 w-4" />
            {{ t("addMenu.item") }}
          </UiDropdownMenuItem>
        </UiDropdownMenuContent>
      </UiDropdownMenu>

      <!-- Sort -->
      <UiDropdownMenu>
        <UiDropdownMenuTrigger as-child>
          <UiButton
            :icon="ArrowUpDown"
            :tooltip="t('sort')"
            variant="outline"
            class="shrink-0"
          />
        </UiDropdownMenuTrigger>
        <UiDropdownMenuContent align="end">
          <UiDropdownMenuItem @select="onSortByName">
            <ArrowDownAZ class="mr-2 h-4 w-4" />
            {{ t("sortBy.name") }}
          </UiDropdownMenuItem>
          <UiDropdownMenuItem @select="onSortByDateCreated">
            <CalendarPlus class="mr-2 h-4 w-4" />
            {{ t("sortBy.dateCreated") }}
          </UiDropdownMenuItem>
          <UiDropdownMenuItem @select="onSortByDateModified">
            <CalendarClock class="mr-2 h-4 w-4" />
            {{ t("sortBy.dateModified") }}
          </UiDropdownMenuItem>
        </UiDropdownMenuContent>
      </UiDropdownMenu>

      <!-- More Menu -->
      <UiDropdownMenu>
        <UiDropdownMenuTrigger as-child>
          <UiButton
            :icon="MoreVertical"
            :tooltip="t('more')"
            variant="outline"
            class="shrink-0"
          />
        </UiDropdownMenuTrigger>
        <UiDropdownMenuContent align="end">
          <UiDropdownMenuItem @select="showImportDrawer = true">
            <DatabaseBackup class="mr-2 h-4 w-4" />
            {{ t("moreMenu.import") }}
          </UiDropdownMenuItem>
          <UiDropdownMenuItem @select="onNavigateToTrash">
            <Trash2 class="mr-2 h-4 w-4" />
            {{ t("moreMenu.trash") }}
          </UiDropdownMenuItem>
        </UiDropdownMenuContent>
      </UiDropdownMenu>
    </div>

    <!-- Import Drawer -->
    <HaexDrawerImportKeepass v-model:open="showImportDrawer" />
  </div>
</template>

<script setup lang="ts">
import {
  Search,
  X,
  Plus,
  Folder,
  Key,
  ArrowUpDown,
  ArrowDownAZ,
  CalendarPlus,
  CalendarClock,
  DatabaseBackup,
  MoreVertical,
  Trash2,
} from "lucide-vue-next";

const { t } = useI18n();
const router = useRouter();
const localePath = useLocalePath();
const { searchInput } = storeToRefs(useSearchStore());
const { currentGroupId } = storeToRefs(usePasswordGroupStore());
const { isProcessing, processingProgress } = storeToRefs(useGroupItemsDeleteStore());

const showImportDrawer = ref(false);

// Prevent Ctrl+A from selecting all items when focused on search input
const onSearchKeydown = (event: KeyboardEvent) => {
  if (event.key === "a" && event.ctrlKey) {
    // Let the default behavior happen (select all text in input)
    // But stop propagation to prevent the global Ctrl+A handler
    event.stopPropagation();
  }
};

const onCreateFolder = async () => {
  await router.push(
    localePath({
      name: "passwordGroupCreate",
      params: { groupId: currentGroupId.value || "" },
    })
  );
};

const onCreateItem = async () => {
  await router.push(
    localePath({
      name: "passwordItemCreate",
      params: { groupId: currentGroupId.value || "" },
    })
  );
};

const onSortByName = () => {
  // TODO: Implement sorting
  console.log("Sort by name");
};

const onSortByDateCreated = () => {
  // TODO: Implement sorting
  console.log("Sort by date");
};

const onSortByDateModified = () => {
  // TODO: Implement sorting
  console.log("Sort by modified");
};

const onNavigateToTrash = async () => {
  console.log("[onNavigateToTrash] START");
  const passwordGroupStore = usePasswordGroupStore();
  const { groups } = storeToRefs(passwordGroupStore);

  console.log("[onNavigateToTrash] Current groups count:", groups.value.length);

  // Check if trash already exists in the groups array
  const trashExists = groups.value.find((g) => g.id === "trash");
  console.log("[onNavigateToTrash] Trash exists:", !!trashExists);

  if (!trashExists) {
    console.log("[onNavigateToTrash] Creating trash folder...");
    try {
      await passwordGroupStore.addGroupAsync({
        name: "Trash",
        id: "trash",
        icon: "mdi:trash-outline",
        parentId: null,
      });
      console.log("[onNavigateToTrash] Trash folder created");

      // Re-sync groups to get the newly created trash folder
      console.log("[onNavigateToTrash] Syncing groups...");
      await passwordGroupStore.syncGroupItemsAsync();
      console.log("[onNavigateToTrash] Groups synced");
    } catch (error) {
      console.error("[onNavigateToTrash] Error creating/syncing trash:", error);
      return;
    }
  }

  // Navigate to trash
  console.log("[onNavigateToTrash] Navigating to trash...");
  try {
    await router.push(
      localePath({
        name: "passwordGroupItems",
        params: { groupId: "trash" },
      })
    );
    console.log("[onNavigateToTrash] Navigation complete");
  } catch (error) {
    console.error("[onNavigateToTrash] Navigation error:", error);
  }
};
</script>

<i18n lang="yaml">
de:
  search: Suchen...
  add: Hinzufügen
  sort: Sortieren
  more: Mehr
  addMenu:
    folder: Ordner
    item: Eintrag
  sortBy:
    name: Nach Name
    dateCreated: Nach Erstelldatum
    dateModified: Nach Änderungsdatum
  moreMenu:
    import: KeePass Import
    trash: Papierkorb

en:
  search: Search...
  add: Add
  sort: Sort
  more: More
  addMenu:
    folder: Folder
    item: Item
  sortBy:
    name: By name
    dateCreated: By date created
    dateModified: By date modified
  moreMenu:
    import: KeePass Import
    trash: Trash
</i18n>
