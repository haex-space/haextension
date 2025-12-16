<template>
  <div class="h-screen flex flex-col">
    <!-- Header -->
    <div class="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center justify-between gap-4">
      <h1 class="text-lg font-semibold">{{ t('title') }}</h1>

      <!-- Header Actions -->
      <div class="flex gap-2 items-center">
        <ShadcnButton
          :icon="Trash2"
          variant="destructive"
          size="sm"
          @click="showDeleteDialog = true"
        >
          <span class="hidden sm:inline">{{ t('delete') }}</span>
        </ShadcnButton>
        <ShadcnButton
          v-if="readOnly"
          :icon="Pencil"
          variant="outline"
          size="sm"
          @click="readOnly = false"
        >
          <span class="hidden sm:inline">{{ t('edit') }}</span>
        </ShadcnButton>
        <ShadcnButton
          v-if="!readOnly"
          :icon="Save"
          :disabled="!hasChanges"
          :class="{ 'animate-pulse': hasChanges }"
          size="sm"
          @click="onSaveAsync"
        >
          <span class="hidden sm:inline">{{ t('save') }}</span>
        </ShadcnButton>
        <ShadcnButton
          :icon="X"
          variant="ghost"
          size="sm"
          @click="onClose"
        />
      </div>
    </div>

    <!-- Content -->
    <div v-if="group" class="flex-1 overflow-y-auto">
      <HaexGroup
        v-model="group"
        :read-only="readOnly"
        @submit="onSaveAsync"
      />
    </div>

    <div v-else class="flex-1 flex items-center justify-center">
      <p class="text-muted-foreground">{{ t('loading') }}</p>
    </div>

    <!-- Delete Dialog -->
    <ShadcnAlertDialog v-model:open="showDeleteDialog">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>{{ inTrashGroup ? t('deleteDialog.final.title') : t('deleteDialog.title') }}</ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>
            {{ inTrashGroup ? t('deleteDialog.final.description') : t('deleteDialog.description') }}
          </ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>{{ t('deleteDialog.cancel') }}</ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction @click="onDeleteAsync">
            {{ inTrashGroup ? t('deleteDialog.final.confirm') : t('deleteDialog.confirm') }}
          </ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>

    <!-- Unsaved Changes Dialog -->
    <ShadcnAlertDialog v-model:open="showUnsavedChangesDialog">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>{{ t('unsavedChangesDialog.title') }}</ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>
            {{ t('unsavedChangesDialog.description') }}
          </ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>{{ t('unsavedChangesDialog.cancel') }}</ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction @click="onConfirmDiscardChanges">
            {{ t('unsavedChangesDialog.confirm') }}
          </ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>
  </div>
</template>

<script setup lang="ts">
import { Trash2, Pencil, Save, X } from 'lucide-vue-next';
import type { SelectHaexPasswordsGroups } from '~/database';

definePageMeta({
  name: 'passwordGroupEdit',
});

const { t } = useI18n();
const router = useRouter();
const localePath = useLocalePath();

const { currentGroupId } = storeToRefs(usePasswordGroupStore());
const { readGroupAsync, updateAsync, syncGroupItemsAsync } = usePasswordGroupStore();
const { inTrashGroup } = storeToRefs(useGroupTreeStore());
const { deleteGroupAsync } = useGroupItemsDeleteStore();

const group = ref<SelectHaexPasswordsGroups | null>(null);
const originalGroup = ref<string>('');
const ignoreChanges = ref(false);
const readOnly = ref(true);
const showDeleteDialog = ref(false);
const showUnsavedChangesDialog = ref(false);

// Load group data
watch(currentGroupId, async () => {
  if (!currentGroupId.value) return;

  ignoreChanges.value = false;
  readOnly.value = true;

  try {
    const foundGroup = await readGroupAsync(currentGroupId.value);
    if (foundGroup) {
      originalGroup.value = JSON.stringify(foundGroup);
      group.value = { ...foundGroup };
    }
  } catch (error) {
    console.error('Error loading group:', error);
  }
}, { immediate: true });

const hasChanges = computed(() => {
  if (!group.value) return false;
  return originalGroup.value !== JSON.stringify(group.value);
});

const onSaveAsync = async () => {
  if (!group.value) return;

  try {
    await updateAsync(group.value);
    await syncGroupItemsAsync();

    originalGroup.value = JSON.stringify(group.value);
    ignoreChanges.value = true;
    readOnly.value = true;
  } catch (error) {
    console.error('Error saving group:', error);
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
        name: 'passwordGroupItems',
        params: {
          groupId: parentId || undefined,
        },
      })
    );
  } catch (error) {
    console.error('Error deleting group:', error);
  }
};

const onClose = () => {
  if (showDeleteDialog.value || showUnsavedChangesDialog.value) return;

  if (hasChanges.value && !ignoreChanges.value) {
    showUnsavedChangesDialog.value = true;
    return;
  }

  readOnly.value = true;
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
  additionalDialogs: [showDeleteDialog],
});
</script>

<i18n lang="yaml">
de:
  title: Gruppe bearbeiten
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
  title: Edit group
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
