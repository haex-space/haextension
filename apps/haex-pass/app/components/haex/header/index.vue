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
          <UiDropdownMenuItem class="py-3 text-base" @select="onCreateFolder">
            <Folder class="mr-3 size-5" />
            {{ t("addMenu.folder") }}
          </UiDropdownMenuItem>
          <UiDropdownMenuItem class="py-3 text-base" @select="onCreateItem">
            <Key class="mr-3 size-5" />
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
          <UiDropdownMenuItem class="py-3 text-base" @select="sortByName">
            <ArrowDownAZ class="mr-3 size-5" />
            {{ t("sortBy.name") }}
          </UiDropdownMenuItem>
          <UiDropdownMenuItem class="py-3 text-base" @select="sortByDateCreated">
            <CalendarPlus class="mr-3 size-5" />
            {{ t("sortBy.dateCreated") }}
          </UiDropdownMenuItem>
          <UiDropdownMenuItem class="py-3 text-base" @select="sortByDateModified">
            <CalendarClock class="mr-3 size-5" />
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
          <UiDropdownMenuItem class="py-3 text-base" @select="showImportDrawer = true">
            <DatabaseBackup class="mr-3 size-5" />
            {{ t("moreMenu.import") }}
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
} from "lucide-vue-next";

const { t } = useI18n();
const router = useRouter();
const localePath = useLocalePath();
const { searchInput } = storeToRefs(useSearchStore());
const { currentGroupId } = storeToRefs(usePasswordGroupStore());
const { isProcessing, processingProgress } = storeToRefs(useGroupItemsDeleteStore());
const { sortByName, sortByDateCreated, sortByDateModified } = useGroupItemsMenuStore();

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
</i18n>
