<template>
  <div class="h-screen flex flex-col">
    <!-- Header -->
    <div
      class="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center justify-between gap-4"
    >
      <h1 class="text-lg font-semibold">{{ title }}</h1>

      <!-- Header Actions -->
      <div class="flex gap-2 items-center">
        <!-- Delete Button (only in edit mode) -->
        <UiButton
          v-if="mode === 'edit'"
          :icon="Trash2"
          variant="destructive"
          @click="showDeleteDialog = true"
        >
          <span class="hidden sm:inline">{{ t("delete") }}</span>
        </UiButton>

        <!-- Edit Button (only in edit mode when readOnly) -->
        <UiButton
          v-if="mode === 'edit' && readOnly"
          :icon="Pencil"
          variant="outline"
          @click="readOnly = false"
        >
          <span class="hidden sm:inline">{{ t("edit") }}</span>
        </UiButton>

        <!-- Save Button -->
        <UiButton
          v-if="mode === 'create' || !readOnly"
          :icon="Save"
          :disabled="!hasChanges"
          :class="{ 'animate-pulse': hasChanges }"
          @click="onSaveAsync"
        >
          <span class="hidden sm:inline">{{ t("save") }}</span>
        </UiButton>

        <!-- Close Button -->
        <UiButton :icon="X" variant="ghost" @click="onClose" />
      </div>
    </div>

    <!-- Content -->
    <div v-if="group" class="flex-1 overflow-y-auto">
      <HaexGroup
        v-model="group"
        :read-only="mode === 'edit' && readOnly"
        @submit="onSaveAsync"
      />
    </div>

    <div v-else-if="mode === 'edit'" class="flex-1 flex items-center justify-center">
      <p class="text-muted-foreground">{{ t("loading") }}</p>
    </div>

    <!-- Delete Dialog (only in edit mode) -->
    <ShadcnAlertDialog v-if="mode === 'edit'" v-model:open="showDeleteDialog">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>
            {{
              inTrashGroup
                ? t("deleteDialog.final.title")
                : t("deleteDialog.title")
            }}
          </ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>
            {{
              inTrashGroup
                ? t("deleteDialog.final.description")
                : t("deleteDialog.description")
            }}
          </ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>
            {{ t("deleteDialog.cancel") }}
          </ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction @click="onDeleteAsync">
            {{
              inTrashGroup
                ? t("deleteDialog.final.confirm")
                : t("deleteDialog.confirm")
            }}
          </ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>

    <!-- Unsaved Changes Dialog -->
    <ShadcnAlertDialog v-model:open="showUnsavedChangesDialog">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>
            {{ t("unsavedChangesDialog.title") }}
          </ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>
            {{ t("unsavedChangesDialog.description") }}
          </ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>
            {{ t("unsavedChangesDialog.cancel") }}
          </ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction @click="onConfirmDiscardChanges">
            {{ t("unsavedChangesDialog.confirm") }}
          </ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>
  </div>
</template>

<script setup lang="ts">
import { useMagicKeys } from "@vueuse/core";
import { Trash2, Pencil, Save, X } from "lucide-vue-next";
import type { SelectHaexPasswordsGroups } from "~/database";

const props = defineProps<{
  mode: "create" | "edit";
  groupId?: string | null;
}>();

const { t } = useI18n();
const router = useRouter();
const localePath = useLocalePath();

// Stores
const { currentGroupId } = storeToRefs(usePasswordGroupStore());
const {
  addGroupAsync,
  readGroupAsync,
  updateAsync,
  syncGroupItemsAsync,
} = usePasswordGroupStore();
const { inTrashGroup } = storeToRefs(useGroupTreeStore());
const { deleteGroupAsync } = useGroupItemsDeleteStore();

// State
const group = ref<SelectHaexPasswordsGroups | null>(null);
const originalGroup = ref<string>("");
const ignoreChanges = ref(false);
const readOnly = ref(props.mode === "edit");
const showDeleteDialog = ref(false);
const showUnsavedChangesDialog = ref(false);

// Computed
const title = computed(() =>
  props.mode === "create" ? t("title.create") : t("title.edit")
);

const hasChanges = computed(() => {
  if (!group.value) return false;

  if (props.mode === "create") {
    return !!(
      group.value.color ||
      group.value.description ||
      group.value.icon ||
      group.value.name
    );
  }

  return originalGroup.value !== JSON.stringify(group.value);
});

// Initialize group based on mode
const initGroup = () => {
  if (props.mode === "create") {
    group.value = {
      name: "",
      description: "",
      id: "",
      color: null,
      icon: null,
      order: null,
      parentId: currentGroupId.value || null,
      createdAt: null,
      updateAt: null,
    };
  }
};

// Load existing group for edit mode
const loadGroupAsync = async () => {
  const id = props.groupId ?? currentGroupId.value;
  if (!id) return;

  ignoreChanges.value = false;
  readOnly.value = true;

  try {
    const foundGroup = await readGroupAsync(id);
    if (foundGroup) {
      originalGroup.value = JSON.stringify(foundGroup);
      group.value = { ...foundGroup };
    }
  } catch (error) {
    console.error("Error loading group:", error);
  }
};

// Watch for groupId changes in edit mode
watch(
  () => props.groupId ?? currentGroupId.value,
  async () => {
    if (props.mode === "edit") {
      await loadGroupAsync();
    }
  },
  { immediate: true }
);

// Initialize on mount
onMounted(() => {
  if (props.mode === "create") {
    initGroup();
  }
});

// Actions
const onSaveAsync = async () => {
  if (!group.value) return;

  try {
    if (props.mode === "create") {
      if (!group.value.name) return;

      const newGroup = await addGroupAsync(group.value);
      if (!newGroup.id) return;

      await syncGroupItemsAsync();
      ignoreChanges.value = true;

      await navigateTo(
        localePath({
          name: "passwordGroupItems",
          params: { groupId: newGroup.id },
        })
      );
    } else {
      await updateAsync(group.value);
      await syncGroupItemsAsync();

      originalGroup.value = JSON.stringify(group.value);
      ignoreChanges.value = true;
      readOnly.value = true;
    }
  } catch (error) {
    console.error("Error saving group:", error);
  }
};

const onDeleteAsync = async () => {
  if (!group.value) return;

  try {
    const parentId = group.value.parentId;
    await deleteGroupAsync(group.value.id, inTrashGroup.value);
    await syncGroupItemsAsync();

    showDeleteDialog.value = false;
    ignoreChanges.value = true;

    await navigateTo(
      localePath({
        name: "passwordGroupItems",
        params: { groupId: parentId || undefined },
      })
    );
  } catch (error) {
    console.error("Error deleting group:", error);
  }
};

const onClose = () => {
  if (showDeleteDialog.value || showUnsavedChangesDialog.value) return;

  if (hasChanges.value && !ignoreChanges.value) {
    showUnsavedChangesDialog.value = true;
    return;
  }

  if (props.mode === "edit") {
    readOnly.value = true;
  }
  router.back();
};

const onConfirmDiscardChanges = () => {
  showUnsavedChangesDialog.value = false;
  ignoreChanges.value = true;
  router.back();
};

// Navigation guard for back button (especially on Android)
useUnsavedChangesGuard({
  hasChanges,
  ignoreChanges,
  showDialog: showUnsavedChangesDialog,
  additionalDialogs: props.mode === "edit" ? [showDeleteDialog] : undefined,
});

// Escape key handler
const { escape } = useMagicKeys();
watch(
  () => escape?.value,
  () => onClose()
);
</script>

<i18n lang="yaml">
de:
  title:
    create: Gruppe erstellen
    edit: Gruppe bearbeiten
  loading: Laden...
  edit: Bearbeiten
  save: Speichern
  delete: Löschen
  deleteDialog:
    title: Gruppe löschen?
    description: Die Gruppe wird in den Papierkorb verschoben.
    cancel: Abbrechen
    confirm: In Papierkorb verschieben
    final:
      title: Gruppe endgültig löschen?
      description: Diese Aktion kann nicht rückgängig gemacht werden. Die Gruppe wird dauerhaft gelöscht.
      confirm: Endgültig löschen
  unsavedChangesDialog:
    title: Nicht gespeicherte Änderungen
    description: Sollen die Änderungen verworfen werden?
    cancel: Abbrechen
    confirm: Verwerfen

en:
  title:
    create: Create group
    edit: Edit group
  loading: Loading...
  edit: Edit
  save: Save
  delete: Delete
  deleteDialog:
    title: Delete group?
    description: The group will be moved to the recycle bin.
    cancel: Cancel
    confirm: Move to recycle bin
    final:
      title: Delete group permanently?
      description: This action cannot be undone. This will permanently delete the group.
      confirm: Delete permanently
  unsavedChangesDialog:
    title: Unsaved changes
    description: Should the changes be discarded?
    cancel: Cancel
    confirm: Discard
</i18n>
