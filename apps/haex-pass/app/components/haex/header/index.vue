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
          <UiButton
            :icon="Plus"
            :tooltip="t('add')"
            variant="default"
            class="shrink-0"
          />
        </ShadcnDropdownMenuTrigger>
        <ShadcnDropdownMenuContent align="end">
          <ShadcnDropdownMenuItem
            class="py-3 text-base"
            @select="onCreateFolder"
          >
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
          <UiButton
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
          <ShadcnDropdownMenuItem
            class="py-3 text-base"
            @select="sortByDateCreated"
          >
            <CalendarPlus class="mr-3 size-5" />
            {{ t("sortBy.dateCreated") }}
            <component
              :is="sortDirection === 'asc' ? ArrowUp : ArrowDown"
              v-if="sortField === 'createdAt'"
              class="ml-auto size-4"
            />
          </ShadcnDropdownMenuItem>
          <ShadcnDropdownMenuItem
            class="py-3 text-base"
            @select="sortByDateModified"
          >
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
          <UiButton
            :icon="MoreVertical"
            :tooltip="t('more')"
            variant="outline"
            class="shrink-0"
          />
        </ShadcnDropdownMenuTrigger>
        <ShadcnDropdownMenuContent align="end">
          <ShadcnDropdownMenuSub>
            <ShadcnDropdownMenuSubTrigger class="py-3 text-base">
              <DatabaseBackup class="mr-3 size-5" />
              {{ t("moreMenu.import") }}
            </ShadcnDropdownMenuSubTrigger>
            <ShadcnDropdownMenuSubContent>
              <ShadcnDropdownMenuItem
                class="py-3 text-base"
                @select="showImportKeepassDrawer = true"
              >
                {{ t("moreMenu.importKeepass") }}
              </ShadcnDropdownMenuItem>
              <ShadcnDropdownMenuItem
                class="py-3 text-base"
                @select="showImportBitwardenDrawer = true"
              >
                {{ t("moreMenu.importBitwarden") }}
              </ShadcnDropdownMenuItem>
              <ShadcnDropdownMenuItem
                class="py-3 text-base"
                @select="showImportLastpassDrawer = true"
              >
                {{ t("moreMenu.importLastpass") }}
              </ShadcnDropdownMenuItem>
            </ShadcnDropdownMenuSubContent>
          </ShadcnDropdownMenuSub>
        </ShadcnDropdownMenuContent>
      </ShadcnDropdownMenu>
    </div>

    <!-- Import Drawers -->
    <HaexDrawerImportKeepass v-model:open="showImportKeepassDrawer" />
    <HaexDrawerImportBitwarden v-model:open="showImportBitwardenDrawer" />
    <HaexDrawerImportLastpass v-model:open="showImportLastpassDrawer" />
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
const { isProcessing, processingProgress } = storeToRefs(
  useGroupItemsDeleteStore()
);
const { sortByName, sortByDateCreated, sortByDateModified } =
  useGroupItemsMenuStore();
const { sortField, sortDirection } = storeToRefs(useGroupItemsMenuStore());

const showImportKeepassDrawer = ref(false);
const showImportBitwardenDrawer = ref(false);
const showImportLastpassDrawer = ref(false);

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
    import: Importieren
    importKeepass: KeePass (.kdbx)
    importBitwarden: Bitwarden (.csv, .json)
    importLastpass: LastPass (.csv)

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
    import: Import
    importKeepass: KeePass (.kdbx)
    importBitwarden: Bitwarden (.csv, .json)
    importLastpass: LastPass (.csv)
</i18n>
