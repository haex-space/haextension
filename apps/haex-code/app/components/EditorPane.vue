<script setup lang="ts">
import { FileCode2 } from "@lucide/vue";

const emit = defineEmits<{
  closeTab: [tabId: string];
  newFile: [];
  save: [];
}>();

const { t } = useI18n();
const editorStore = useEditorStore();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <DraggableTabBar
      v-if="editorStore.tabs.length > 0"
      :tabs="editorStore.tabs"
      :active-tab-id="editorStore.activeTabId"
      @select="editorStore.activeTabId = $event"
      @close="emit('closeTab', $event)"
      @reorder="(from: number, to: number) => editorStore.moveTab(from, to)"
      @new-file="emit('newFile')"
    />

    <div class="flex-1 min-h-0">
      <MonacoEditor
        v-if="editorStore.activeTab"
        :tab="editorStore.activeTab"
        @update:content="editorStore.updateTabContent"
        @save="emit('save')"
      />
      <div v-else class="flex h-full items-center justify-center text-muted-foreground">
        <div class="px-6 text-center">
          <FileCode2 class="mx-auto mb-3 size-12 opacity-30" />
          <p class="text-sm">{{ t("openFileToEdit") }}</p>
          <slot name="empty" />
        </div>
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  openFileToEdit: Datei öffnen zum Bearbeiten
en:
  openFileToEdit: Open a file to start editing
</i18n>
