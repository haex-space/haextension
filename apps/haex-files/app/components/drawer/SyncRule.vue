<template>
  <UiDrawerModal v-model:open="isOpen" :title="isEditMode ? t('titleEdit') : t('title')" :description="isEditMode ? t('descriptionEdit') : t('description')">
    <template #content>
      <form class="space-y-4" @submit.prevent="submitAsync">
        <!-- Source Type Toggle (only in add mode) -->
        <div v-if="!isEditMode" class="space-y-2">
          <ShadcnLabel>{{ t("sourceType.label") }}</ShadcnLabel>
          <div class="flex gap-2">
            <ShadcnButton
              type="button"
              :variant="form.direction !== 'down' ? 'default' : 'outline'"
              class="flex-1"
              @click="form.direction = 'up'"
            >
              <Upload class="size-4 mr-2" />
              {{ t("sourceType.local") }}
            </ShadcnButton>
            <ShadcnButton
              type="button"
              :variant="form.direction === 'down' ? 'default' : 'outline'"
              class="flex-1"
              @click="form.direction = 'down'"
            >
              <Download class="size-4 mr-2" />
              {{ t("sourceType.remote") }}
            </ShadcnButton>
          </div>
        </div>

        <!-- Local Folder Selection -->
        <div class="space-y-2">
          <ShadcnLabel>{{ form.direction === 'down' ? t("destinationFolder") : t("folder") }}</ShadcnLabel>
          <div class="flex gap-2">
            <ShadcnInputGroup class="flex-1">
              <ShadcnInputGroupInput
                :model-value="form.localPath"
                :placeholder="t('folderPlaceholder')"
                readonly
              />
            </ShadcnInputGroup>
            <ShadcnButton
              v-if="!isEditMode"
              type="button"
              variant="outline"
              :loading="isSelectingFolder"
              @click="selectFolderAsync"
            >
              <FolderOpen class="size-4 mr-2" />
              {{ t("browse") }}
            </ShadcnButton>
          </div>
        </div>

        <!-- Remote Paths (only for download rules) -->
        <div v-if="form.direction === 'down'" class="space-y-2">
          <ShadcnLabel>{{ t("remotePath.label") }}</ShadcnLabel>
          <div class="flex gap-2">
            <ShadcnInputGroup class="flex-1">
              <ShadcnInputGroupInput
                :model-value="remotePathsDisplay"
                :placeholder="t('remotePath.placeholder')"
                readonly
              />
            </ShadcnInputGroup>
            <ShadcnButton
              v-if="!isEditMode"
              type="button"
              variant="outline"
              :disabled="form.backendIds.length === 0"
              @click="showRemoteBrowser = true"
            >
              <Search class="size-4 mr-2" />
              {{ t("browse") }}
            </ShadcnButton>
          </div>
          <p class="text-xs text-muted-foreground">
            {{ t("remotePath.hint") }}
          </p>
        </div>

        <!-- Remote Browser Dialog -->
        <DialogRemoteBrowser
          v-model:open="showRemoteBrowser"
          :backend-ids="form.backendIds"
          @select="onRemotePathsSelected"
        />

        <!-- Space Selection -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("space") }}</ShadcnLabel>
          <div class="flex gap-2">
            <ShadcnSelect v-model="form.spaceId" class="flex-1" :disabled="isEditMode">
              <ShadcnSelectTrigger>
                <ShadcnSelectValue :placeholder="t('spacePlaceholder')" />
              </ShadcnSelectTrigger>
              <ShadcnSelectContent>
                <ShadcnSelectItem
                  v-for="space in spaces"
                  :key="space.id"
                  :value="space.id"
                >
                  {{ space.name }}
                </ShadcnSelectItem>
              </ShadcnSelectContent>
            </ShadcnSelect>
            <ShadcnButton
              v-if="!isEditMode"
              type="button"
              variant="outline"
              size="icon"
              :tooltip="t('newSpace')"
              @click="showNewSpaceDialog = true"
            >
              <Plus class="size-4" />
            </ShadcnButton>
          </div>
        </div>

        <!-- New Space Dialog -->
        <ShadcnDialog v-model:open="showNewSpaceDialog">
          <ShadcnDialogContent>
            <ShadcnDialogHeader>
              <ShadcnDialogTitle>{{ t("newSpaceDialog.title") }}</ShadcnDialogTitle>
              <ShadcnDialogDescription>{{ t("newSpaceDialog.description") }}</ShadcnDialogDescription>
            </ShadcnDialogHeader>
            <div class="space-y-4 py-4">
              <div class="space-y-2">
                <ShadcnLabel for="new-space-name">{{ t("newSpaceDialog.name") }}</ShadcnLabel>
                <ShadcnInputGroup>
                  <ShadcnInputGroupInput
                    id="new-space-name"
                    v-model="newSpaceName"
                    :placeholder="t('newSpaceDialog.namePlaceholder')"
                    autofocus
                    @keydown.enter="createSpaceAsync"
                  />
                </ShadcnInputGroup>
              </div>
            </div>
            <ShadcnDialogFooter>
              <ShadcnButton variant="outline" @click="showNewSpaceDialog = false">
                {{ t("cancel") }}
              </ShadcnButton>
              <ShadcnButton
                :disabled="!newSpaceName.trim()"
                :loading="isCreatingSpace"
                @click="createSpaceAsync"
              >
                {{ t("newSpaceDialog.create") }}
              </ShadcnButton>
            </ShadcnDialogFooter>
          </ShadcnDialogContent>
        </ShadcnDialog>

        <!-- Backend Selection (Multi-Select) -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("backends") }}</ShadcnLabel>
          <div class="space-y-2 border border-border rounded-md p-3">
            <div v-if="backends.length === 0" class="text-sm text-muted-foreground">
              {{ t("noBackends") }}
            </div>
            <div
              v-for="backend in backends"
              :key="backend.id"
              class="flex items-center gap-2"
            >
              <ShadcnCheckbox
                :id="`backend-${backend.id}`"
                :model-value="form.backendIds.includes(backend.id)"
                @update:model-value="toggleBackend(backend.id)"
              />
              <label
                :for="`backend-${backend.id}`"
                class="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
              >
                <Cloud class="size-4 text-muted-foreground" />
                {{ backend.name }}
                <span class="text-xs text-muted-foreground">({{ backend.providerName }} · {{ backend.bucket }})</span>
              </label>
            </div>
          </div>
        </div>

        <DrawerSyncRuleOptions
          v-model:direction="form.direction"
          v-model:conflict-strategy="form.conflictStrategy"
          v-model:ignore-patterns="form.ignorePatterns"
          :show-direction="isEditMode"
        />

        <!-- Error -->
        <div
          v-if="error"
          class="p-3 bg-destructive/10 text-destructive rounded-md text-sm"
        >
          {{ error }}
        </div>
      </form>
    </template>

    <template #footer>
      <div class="flex gap-2 w-full" :class="isEditMode ? 'justify-between' : 'sm:justify-end'">
        <ShadcnButton
          v-if="isEditMode"
          variant="destructive"
          :loading="isDeleting"
          @click="deleteAsync"
        >
          <Trash2 class="size-4 mr-2" />
          {{ t("delete") }}
        </ShadcnButton>
        <div class="flex gap-2 flex-1 sm:flex-none">
          <ShadcnButton
            variant="outline"
            class="flex-1 sm:flex-none"
            @click="isOpen = false"
          >
            {{ t("cancel") }}
          </ShadcnButton>
          <ShadcnButton
            :disabled="!isValid || (isEditMode && !hasChanges)"
            :loading="isSubmitting"
            class="flex-1 sm:flex-none"
            @click="isEditMode ? updateAsync() : submitAsync()"
          >
            {{ isEditMode ? t("save") : t("add") }}
          </ShadcnButton>
        </div>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { FolderOpen, Cloud, Upload, Download, Plus, Trash2, Search } from "@lucide/vue";
import type { SyncRule } from "~/stores/syncRules";

const isOpen = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  editRule?: SyncRule | null;
}>();

const emit = defineEmits<{
  created: [ruleId: string];
  updated: [ruleId: string];
  deleted: [ruleId: string];
}>();

const { t } = useI18n();
const backendsStore = useBackendsStore();
const spacesStore = useSpacesStore();
const syncRulesStore = useSyncRulesStore();

const { backends } = storeToRefs(backendsStore);
const { spaces } = storeToRefs(spacesStore);

const isEditMode = computed(() => !!props.editRule);

const isSelectingFolder = ref(false);
const isSubmitting = ref(false);
const isDeleting = ref(false);
const error = ref<string | null>(null);

// New Space Dialog state
const showNewSpaceDialog = ref(false);
const newSpaceName = ref("");
const isCreatingSpace = ref(false);

// Remote Browser Dialog state
const showRemoteBrowser = ref(false);

const { form, isValid, ignorePatternsArray, remotePathsDisplay, hasChanges, resetForm } =
  useSyncRuleForm(isOpen, () => props.editRule, error);

const selectFolderAsync = async () => {
  isSelectingFolder.value = true;
  error.value = null;

  try {
    const path = await syncRulesStore.selectFolderAsync();
    if (path) {
      form.localPath = path;
    }
  } catch (err) {
    console.error("[AddSyncRule] Folder selection error:", err);
    error.value = err instanceof Error ? err.message : t("error");
  } finally {
    isSelectingFolder.value = false;
  }
};

const toggleBackend = (backendId: string) => {
  const index = form.backendIds.indexOf(backendId);
  if (index === -1) {
    form.backendIds.push(backendId);
  } else {
    form.backendIds.splice(index, 1);
  }
};

const onRemotePathsSelected = (paths: string[]) => {
  if (paths.length === 0) return;
  form.remotePaths = paths;
};

const createSpaceAsync = async () => {
  if (!newSpaceName.value.trim() || isCreatingSpace.value) return;

  isCreatingSpace.value = true;
  try {
    const newSpace = await spacesStore.createSpaceAsync(newSpaceName.value.trim());
    form.spaceId = newSpace.id;
    showNewSpaceDialog.value = false;
    newSpaceName.value = "";
  } catch (err) {
    console.error("[AddSyncRule] Create space error:", err);
    error.value = err instanceof Error ? err.message : t("error");
  } finally {
    isCreatingSpace.value = false;
  }
};

const submitAsync = async () => {
  if (!isValid.value || isSubmitting.value) return;

  isSubmitting.value = true;
  error.value = null;

  try {
    const newRule = await syncRulesStore.addSyncRuleAsync({
      spaceId: form.spaceId,
      localPath: form.localPath.trim(),
      remotePaths: form.direction === "down" ? form.remotePaths : undefined,
      backendIds: form.backendIds,
      direction: form.direction,
      ignorePatterns: ignorePatternsArray.value,
      conflictStrategy: form.conflictStrategy,
    });

    emit("created", newRule.id);
    resetForm();
    isOpen.value = false;
  } catch (err) {
    console.error("[AddSyncRule] Error:", err);
    error.value = err instanceof Error ? err.message : t("error");
  } finally {
    isSubmitting.value = false;
  }
};

const updateAsync = async () => {
  if (!props.editRule || !isValid.value || isSubmitting.value) return;

  isSubmitting.value = true;
  error.value = null;

  try {
    await syncRulesStore.updateSyncRuleAsync({
      ruleId: props.editRule.id,
      remotePaths: form.direction === "down" ? form.remotePaths : [],
      backendIds: form.backendIds,
      direction: form.direction,
      ignorePatterns: ignorePatternsArray.value,
      conflictStrategy: form.conflictStrategy,
    });

    emit("updated", props.editRule.id);
    isOpen.value = false;
  } catch (err) {
    console.error("[SyncRule] Update error:", err);
    error.value = err instanceof Error ? err.message : t("error");
  } finally {
    isSubmitting.value = false;
  }
};

const deleteAsync = async () => {
  if (!props.editRule || isDeleting.value) return;

  isDeleting.value = true;
  error.value = null;

  try {
    await syncRulesStore.removeSyncRuleAsync(props.editRule.id);
    emit("deleted", props.editRule.id);
    isOpen.value = false;
  } catch (err) {
    console.error("[SyncRule] Delete error:", err);
    error.value = err instanceof Error ? err.message : t("error");
  } finally {
    isDeleting.value = false;
  }
};
</script>

<i18n lang="yaml">
de:
  title: Sync-Regel hinzufügen
  titleEdit: Sync-Regel bearbeiten
  description: Wähle einen Ordner und konfiguriere die Synchronisierung.
  descriptionEdit: Bearbeite oder lösche diese Sync-Regel.
  sourceType:
    label: Quelle
    local: Lokaler Ordner
    remote: Remote-Ordner
  folder: Ordner
  destinationFolder: Ziel-Ordner
  folderPlaceholder: Ordner auswählen...
  browse: Durchsuchen
  remotePath:
    label: Remote-Pfade
    placeholder: Klicke auf Durchsuchen...
    hint: Wähle Ordner oder Dateien aus der Cloud zum Synchronisieren.
  space: Space
  spacePlaceholder: Space auswählen
  newSpace: Neuen Space erstellen
  newSpaceDialog:
    title: Neuer Space
    description: Erstelle einen neuen Space für deine Dateien.
    name: Name
    namePlaceholder: z.B. Dokumente
    create: Erstellen
  backends: Speicher-Backends
  noBackends: Keine Backends konfiguriert. Füge zuerst ein Backend hinzu.
  cancel: Abbrechen
  add: Hinzufügen
  save: Speichern
  delete: Löschen
  error: Ein Fehler ist aufgetreten

en:
  title: Add Sync Rule
  titleEdit: Edit Sync Rule
  description: Select a folder and configure synchronization.
  descriptionEdit: Edit or delete this sync rule.
  sourceType:
    label: Source
    local: Local Folder
    remote: Remote Folder
  folder: Folder
  destinationFolder: Destination Folder
  folderPlaceholder: Select folder...
  browse: Browse
  remotePath:
    label: Remote Paths
    placeholder: Click Browse...
    hint: Select folders or files from the cloud to synchronize.
  space: Space
  spacePlaceholder: Select space
  newSpace: Create new space
  newSpaceDialog:
    title: New Space
    description: Create a new space for your files.
    name: Name
    namePlaceholder: e.g. Documents
    create: Create
  backends: Storage Backends
  noBackends: No backends configured. Add a backend first.
  cancel: Cancel
  add: Add
  save: Save
  delete: Delete
  error: An error occurred
</i18n>
