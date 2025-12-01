<template>
  <div
    class="sticky top-0 z-20 bg-accented/50 border-b border-border px-3 py-2"
    style="backdrop-filter: blur(12px)"
  >
    <div class="flex items-center gap-2">
      <!-- Search -->
      <UiInput
        v-model="searchInput"
        :placeholder="t('search')"
        leading-icon="mdi:magnify"
        with-clear-button
        class="flex-1"
        @keydown="onSearchKeydown"
      />

      <!-- Sort -->
      <UDropdownMenu :items="sortOptions" class="shrink-0">
        <UButton
          icon="mdi:sort"
          :tooltip="t('sort')"
          variant="outline"
          color="neutral"
        />
      </UDropdownMenu>

      <!-- Import -->
      <UButton
        icon="mdi:database-import"
        :tooltip="t('import')"
        variant="outline"
        color="neutral"
        @click="showImportDialog = true"
      />
    </div>

    <!-- Import Dialog -->
    <PassDialogImportKeepass v-model:open="showImportDialog" />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { searchInput } = storeToRefs(useSearchStore());

const showImportDialog = ref(false);

// Prevent Ctrl+A from selecting all items when focused on search input
const onSearchKeydown = (event: KeyboardEvent) => {
  if (event.key === "a" && event.ctrlKey) {
    // Let the default behavior happen (select all text in input)
    // But stop propagation to prevent the global Ctrl+A handler
    event.stopPropagation();
  }
};

const sortOptions = computed(() => [
  [
    {
      label: t("sortBy.name"),
      icon: "mdi:sort-alphabetical-ascending",
      onSelect: () => {
        // TODO: Implement sorting
        console.log("Sort by name");
      },
    },
    {
      label: t("sortBy.dateCreated"),
      icon: "mdi:sort-calendar-ascending",
      onSelect: () => {
        // TODO: Implement sorting
        console.log("Sort by date");
      },
    },
    {
      label: t("sortBy.dateModified"),
      icon: "mdi:sort-clock-ascending",
      onSelect: () => {
        // TODO: Implement sorting
        console.log("Sort by modified");
      },
    },
  ],
]);
</script>

<i18n lang="yaml">
de:
  search: Suchen...
  sort: Sortieren
  import: Importieren
  sortBy:
    name: Nach Name
    dateCreated: Nach Erstelldatum
    dateModified: Nach Änderungsdatum

en:
  search: Search...
  sort: Sort
  import: Import
  sortBy:
    name: By name
    dateCreated: By date created
    dateModified: By date modified
</i18n>
