<template>
  <UiDrawerModal v-model:open="isOpen" :title="isEditMode ? t('titleEdit') : t('title')" :description="isEditMode ? t('descriptionEdit') : t('description')">
    <template #content>
      <form class="space-y-4" @submit.prevent="submitAsync">
        <!-- Folder Selection -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("folder") }}</ShadcnLabel>
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
                <span class="text-xs text-muted-foreground">({{ backend.type }})</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Sync Direction -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("direction.label") }}</ShadcnLabel>
          <ShadcnSelect v-model="form.direction">
            <ShadcnSelectTrigger>
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem value="up">
                <span class="flex items-center gap-2">
                  <Upload class="size-4" />
                  {{ t("direction.up") }}
                </span>
              </ShadcnSelectItem>
              <ShadcnSelectItem value="down">
                <span class="flex items-center gap-2">
                  <Download class="size-4" />
                  {{ t("direction.down") }}
                </span>
              </ShadcnSelectItem>
              <ShadcnSelectItem value="both">
                <span class="flex items-center gap-2">
                  <RefreshCw class="size-4" />
                  {{ t("direction.both") }}
                </span>
              </ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

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
import { FolderOpen, Cloud, Upload, Download, RefreshCw, Plus, Trash2 } from "lucide-vue-next";
import type { SyncDirection, SyncRule } from "@haex-space/vault-sdk";

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

const form = reactive({
  localPath: "",
  spaceId: "",
  backendIds: [] as string[],
  direction: "both" as SyncDirection,
});

const isSelectingFolder = ref(false);
const isSubmitting = ref(false);
const isDeleting = ref(false);
const error = ref<string | null>(null);

// New Space Dialog state
const showNewSpaceDialog = ref(false);
const newSpaceName = ref("");
const isCreatingSpace = ref(false);

const isValid = computed(() => {
  return (
    form.localPath.trim() !== "" &&
    form.spaceId !== "" &&
    form.backendIds.length > 0
  );
});

const hasChanges = computed(() => {
  if (!props.editRule) return false;
  const rule = props.editRule;
  const backendsSame = rule.backendIds.length === form.backendIds.length &&
    rule.backendIds.every((id) => form.backendIds.includes(id));
  return rule.direction !== form.direction || !backendsSame;
});

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
      backendIds: form.backendIds,
      direction: form.direction,
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
      backendIds: form.backendIds,
      direction: form.direction,
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

const resetForm = () => {
  form.localPath = "";
  form.spaceId = "";
  form.backendIds = [];
  form.direction = "both";
  error.value = null;
};

// Helper to pre-select all backends (only in add mode)
const preselectAllBackends = () => {
  if (props.editRule) return;
  if (backends.value.length === 0) return;
  if (form.backendIds.length > 0) return;

  form.backendIds = backends.value.map((b) => b.id);
};

// Helper to pre-select first space
const preselectFirstSpace = () => {
  if (props.editRule) return;
  if (form.spaceId) return;

  const firstSpace = spaces.value[0];
  if (firstSpace) {
    form.spaceId = firstSpace.id;
  }
};

// Watch both isOpen AND editRule together to handle all cases
watch(
  [isOpen, () => props.editRule],
  ([open, editRule]) => {
    if (!open) return;

    if (editRule) {
      // Edit mode: populate form from rule
      form.localPath = editRule.localPath;
      form.spaceId = editRule.spaceId;
      form.backendIds = [...editRule.backendIds];
      form.direction = editRule.direction;
    } else {
      // Add mode: reset form and pre-select defaults
      form.localPath = "";
      form.spaceId = spaces.value[0]?.id || "";
      form.backendIds = backends.value.map((b) => b.id);
      form.direction = "both";
      error.value = null;
    }
  },
  { immediate: true }
);

// Pre-select backends when they load (handles async loading)
watch(
  () => backends.value.length,
  () => {
    if (isOpen.value && !props.editRule && form.backendIds.length === 0) {
      preselectAllBackends();
    }
  }
);

// Pre-select first space when spaces load (handles async loading)
watch(
  () => spaces.value.length,
  () => {
    if (isOpen.value && !props.editRule && !form.spaceId) {
      preselectFirstSpace();
    }
  }
);
</script>

<i18n lang="yaml">
de:
  title: Sync-Regel hinzufügen
  titleEdit: Sync-Regel bearbeiten
  description: Wähle einen Ordner und konfiguriere die Synchronisierung.
  descriptionEdit: Bearbeite oder lösche diese Sync-Regel.
  folder: Ordner
  folderPlaceholder: Ordner auswählen...
  browse: Durchsuchen
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
  direction:
    label: Sync-Richtung
    up: Nur hochladen (Lokal → Cloud)
    down: Nur herunterladen (Cloud → Lokal)
    both: Bidirektional (Beide Richtungen)
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
  folder: Folder
  folderPlaceholder: Select folder...
  browse: Browse
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
  direction:
    label: Sync Direction
    up: Upload only (Local → Cloud)
    down: Download only (Cloud → Local)
    both: Bidirectional (Both ways)
  cancel: Cancel
  add: Add
  save: Save
  delete: Delete
  error: An error occurred
</i18n>
