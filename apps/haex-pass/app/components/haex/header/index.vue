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
          <ShadcnDropdownMenuItem class="py-3 text-base" @select="onCreateFolder">
            <Folder class="mr-3 size-5" />
            {{ t("addMenu.folder") }}
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuItem class="py-3 text-base" @select="onCreateItem">
            <Key class="mr-3 size-5" />
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
          <ShadcnDropdownMenuItem class="py-3 text-base" @select="sortByName">
            <ArrowDownAZ class="mr-3 size-5" />
            {{ t("sortBy.name") }}
            <component
              :is="sortDirection === 'asc' ? ArrowUp : ArrowDown"
              v-if="sortField === 'name'"
              class="ml-auto size-4"
            />
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuItem class="py-3 text-base" @select="sortByDateCreated">
            <CalendarPlus class="mr-3 size-5" />
            {{ t("sortBy.dateCreated") }}
            <component
              :is="sortDirection === 'asc' ? ArrowUp : ArrowDown"
              v-if="sortField === 'createdAt'"
              class="ml-auto size-4"
            />
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuItem class="py-3 text-base" @select="sortByDateModified">
            <CalendarClock class="mr-3 size-5" />
            {{ t("sortBy.dateModified") }}
            <component
              :is="sortDirection === 'asc' ? ArrowUp : ArrowDown"
              v-if="sortField === 'updatedAt'"
              class="ml-auto size-4"
            />
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
          <ShadcnDropdownMenuItem class="py-3 text-base" @select="showImportDrawer = true">
            <DatabaseBackup class="mr-3 size-5" />
            {{ t("moreMenu.import") }}
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
  ArrowUp,
  ArrowDown,
} from "lucide-vue-next";

const { t } = useI18n();
const router = useRouter();
const localePath = useLocalePath();
const { searchInput } = storeToRefs(useSearchStore());
const { currentGroupId } = storeToRefs(usePasswordGroupStore());
const { isProcessing, processingProgress } = storeToRefs(useGroupItemsDeleteStore());
const { sortByName, sortByDateCreated, sortByDateModified } = useGroupItemsMenuStore();
const { sortField, sortDirection } = storeToRefs(useGroupItemsMenuStore());

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
