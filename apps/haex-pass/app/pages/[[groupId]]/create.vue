<template>
  <div class="h-screen flex flex-col">
    <!-- Header -->
    <div class="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center justify-between gap-4">
      <h1 class="text-lg font-semibold">{{ t('title') }}</h1>

      <!-- Header Actions -->
      <div class="flex gap-2 items-center">
        <UiButton
          :icon="Save"
          :disabled="!hasChanges"
          :class="{ 'animate-pulse': hasChanges }"
          size="sm"
          @click="createAsync"
        >
          <span class="hidden sm:inline">{{ t('save') }}</span>
        </UiButton>
        <UiButton
          :icon="X"
          variant="ghost"
          size="sm"
          @click="onClose"
        />
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <HaexGroup
        v-model="group"
        mode="create"
        @submit="createAsync"
      />
    </div>

    <!-- Unsaved Changes Dialog -->
    <UiAlertDialog v-model:open="showUnsavedChangesDialog">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>{{ t('unsavedChangesDialog.title') }}</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            {{ t('unsavedChangesDialog.description') }}
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel>{{ t('unsavedChangesDialog.cancel') }}</UiAlertDialogCancel>
          <UiAlertDialogAction @click="onConfirmDiscardChanges">
            {{ t('unsavedChangesDialog.confirm') }}
          </UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </div>
</template>

<script setup lang="ts">
import { Save, X } from 'lucide-vue-next';
import type { SelectHaexPasswordsGroups } from '~/database';

definePageMeta({
  name: 'passwordGroupCreate',
});

const { t } = useI18n();
const router = useRouter();
const localePath = useLocalePath();

const { currentGroupId } = storeToRefs(usePasswordGroupStore());

const group = ref<SelectHaexPasswordsGroups>({
  name: '',
  description: '',
  id: '',
  color: null,
  icon: null,
  order: null,
  parentId: currentGroupId.value || null,
  createdAt: null,
  updateAt: null,
});

const ignoreChanges = ref(false);
const showUnsavedChangesDialog = ref(false);

const hasChanges = computed(() => {
  return !!(
    group.value.color ||
    group.value.description ||
    group.value.icon ||
    group.value.name
  );
});

const { addGroupAsync, syncGroupItemsAsync } = usePasswordGroupStore();

const createAsync = async () => {
  try {
    if (!group.value.name) return;

    const newGroup = await addGroupAsync(group.value);

    if (!newGroup.id) return;

    // Sync groups to make the new group visible
    await syncGroupItemsAsync();

    ignoreChanges.value = true;
    await navigateTo(
      localePath({
        name: 'passwordGroupItems',
        params: {
          groupId: newGroup.id,
        },
      })
    );
  } catch (error) {
    console.error('Error creating group:', error);
  }
};

const onClose = () => {
  if (showUnsavedChangesDialog.value) return;

  if (hasChanges.value && !ignoreChanges.value) {
    showUnsavedChangesDialog.value = true;
    return;
  }

  router.back();
};

const onConfirmDiscardChanges = () => {
  showUnsavedChangesDialog.value = false;
  ignoreChanges.value = true;
  router.back();
};
</script>

<i18n lang="yaml">
de:
  title: Gruppe erstellen
  save: Speichern
  unsavedChangesDialog:
    title: Nicht gespeicherte Änderungen
    description: Sollen die Änderungen verworfen werden?
    cancel: Abbrechen
    confirm: Verwerfen

en:
  title: Create group
  save: Save
  unsavedChangesDialog:
    title: Unsaved changes
    description: Should the changes be discarded?
    cancel: Cancel
    confirm: Discard
</i18n>
