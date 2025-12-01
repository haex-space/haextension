<template>
  <div
    class="sticky top-0 z-20 bg-accent/50 border-b border-border px-3 py-2"
    style="backdrop-filter: blur(12px)"
  >
    <div class="flex items-center gap-2">
      <!-- Search -->
      <ShadcnInputGroup class="flex-1">
        <ShadcnInputGroupAddon>
          <Search class="h-4 w-4" />
        </ShadcnInputGroupAddon>
        <ShadcnInputGroupInput
          v-model="searchInput"
          :placeholder="t('search')"
          @keydown="onSearchKeydown"
        />
        <ShadcnInputGroupButton
          v-show="searchInput"
          variant="ghost"
          size="sm"
          :icon="X"
          @click="searchInput = ''"
        />
      </ShadcnInputGroup>

      <!-- Add / Progress -->
      <HaexButtonProgress
        v-if="isProcessing"
        :progress="processingProgress"
        class="shrink-0"
      />
      <ShadcnDropdownMenu v-else>
        <ShadcnDropdownMenuTrigger as-child>
          <ShadcnButton
            :icon="Plus"
            :tooltip="t('add')"
            variant="default"
            class="shrink-0"
          />
        </ShadcnDropdownMenuTrigger>
        <ShadcnDropdownMenuContent align="end">
          <ShadcnDropdownMenuItem @select="onCreateFolder">
            <Folder class="mr-2 h-4 w-4" />
            {{ t("addMenu.folder") }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuItem @select="onCreateItem">
            <Key class="mr-2 h-4 w-4" />
            {{ t("addMenu.item") }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuContent>
      </ShadcnDropdownMenu>

      <!-- Sort -->
      <ShadcnDropdownMenu>
        <ShadcnDropdownMenuTrigger as-child>
          <ShadcnButton
            :icon="ArrowUpDown"
            :tooltip="t('sort')"
            variant="outline"
            class="shrink-0"
          />
        </ShadcnDropdownMenuTrigger>
        <ShadcnDropdownMenuContent align="end">
          <ShadcnDropdownMenuItem @select="onSortByName">
            <ArrowDownAZ class="mr-2 h-4 w-4" />
            {{ t("sortBy.name") }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuItem @select="onSortByDateCreated">
            <CalendarPlus class="mr-2 h-4 w-4" />
            {{ t("sortBy.dateCreated") }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuItem @select="onSortByDateModified">
            <CalendarClock class="mr-2 h-4 w-4" />
            {{ t("sortBy.dateModified") }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuContent>
      </ShadcnDropdownMenu>

      <!-- More Menu -->
      <ShadcnDropdownMenu>
        <ShadcnDropdownMenuTrigger as-child>
          <ShadcnButton
            :icon="MoreVertical"
            :tooltip="t('more')"
            variant="outline"
            class="shrink-0"
          />
        </ShadcnDropdownMenuTrigger>
        <ShadcnDropdownMenuContent align="end">
          <ShadcnDropdownMenuItem @select="showImportDrawer = true">
            <DatabaseBackup class="mr-2 h-4 w-4" />
            {{ t("moreMenu.import") }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuItem @select="onNavigateToTrash">
            <Trash2 class="mr-2 h-4 w-4" />
            {{ t("moreMenu.trash") }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuContent>
      </ShadcnDropdownMenu>
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
