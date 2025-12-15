<template>
  <div class="h-screen flex flex-col">
    <div class="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center gap-4">
      <!-- Tab Navigation -->
      <div class="flex-1 flex justify-center">
        <div class="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
          <button
            v-for="(tab, index) in tabs"
            :key="tab.value"
            type="button"
            :class="[
              'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
              activeTab === index ? 'bg-background text-foreground shadow' : 'hover:bg-background/50'
            ]"
            @click="scrollToSlide(index)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

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

    <ShadcnCarousel
      v-if="currentItem"
      class="flex-1 overflow-hidden"
      @init-api="(api) => {
        if (api) {
          carouselApi = api;
          api.on('select', () => {
            activeTab = api.selectedScrollSnap();
          });
        }
      }"
    >
      <ShadcnCarouselContent class="h-full">
        <!-- Details Slide -->
        <ShadcnCarouselItem class="h-full">
          <div class="h-full overflow-y-auto">
            <HaexItemDetails
              v-model="editableDetails"
              :read-only="readOnly"
              @submit="onSaveAsync"
            />
          </div>
        </ShadcnCarouselItem>

        <!-- Key-Value Slide -->
        <ShadcnCarouselItem class="h-full">
          <div class="h-full overflow-hidden">
            <HaexItemKeyValue
              v-if="currentItem.details.id"
              v-model="currentItem.keyValues"
              v-model:items-to-add="keyValuesAdd"
              v-model:items-to-delete="keyValuesDelete"
              v-model:attachments="attachments"
              v-model:attachments-to-add="attachmentsToAdd"
              v-model:attachments-to-delete="attachmentsToDelete"
              :item-id="currentItem.details.id"
              :read-only="readOnly"
            />
          </div>
        </ShadcnCarouselItem>

        <!-- History Slide -->
        <ShadcnCarouselItem class="h-full">
          <div class="h-full overflow-hidden">
            <HaexItemHistory
              v-if="currentItem.details.id"
              :key="`history-${currentItem.details.id}-${activeTab}`"
              :item-id="currentItem.details.id"
            />
          </div>
        </ShadcnCarouselItem>
      </ShadcnCarouselContent>
    </ShadcnCarousel>

    <div v-else class="flex-1 flex items-center justify-center">
      <p class="text-muted-foreground">{{ t('loading') }}</p>
    </div>

    <!-- Delete Dialog -->
    <HaexDialogDeleteItem
      v-model:open="showDeleteDialog"
      :item-name="editableDetails.title || t('untitled')"
      :final="inTrashGroup"
      @confirm="onDeleteAsync"
      @abort="showDeleteDialog = false"
    />

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
import { X, Trash2, Pencil, Save } from "lucide-vue-next";
import { toast } from "vue-sonner";
import type {
  SelectHaexPasswordsItemDetails,
  SelectHaexPasswordsItemKeyValues,
} from "~/database";
import type { AttachmentWithSize } from "~/types/attachment";
import type { UnwrapRefCarouselApi } from "@/components/shadcn/carousel/interface";

definePageMeta({
  name: "passwordItemEdit",
});

const { t } = useI18n();
const router = useRouter();

const { currentItem } = storeToRefs(usePasswordItemStore());
const { updateAsync, deleteAsync, readAsync } = usePasswordItemStore();
const { syncGroupItemsAsync } = usePasswordGroupStore();
const { inTrashGroup } = storeToRefs(useGroupTreeStore());

// Key-Value tracking
const keyValuesAdd = ref<SelectHaexPasswordsItemKeyValues[]>([]);
const keyValuesDelete = ref<SelectHaexPasswordsItemKeyValues[]>([]);

// Attachments tracking
const attachments = ref<AttachmentWithSize[]>([]);
const attachmentsToAdd = ref<AttachmentWithSize[]>([]);
const attachmentsToDelete = ref<AttachmentWithSize[]>([]);

// Tabs configuration
const tabs = computed(() => [
  { label: t('tabs.details'), value: 'details' },
  { label: t('tabs.extra'), value: 'extra' },
  { label: t('tabs.history'), value: 'history' },
]);

const activeTab = ref(0);
const carouselApi = ref<UnwrapRefCarouselApi | null>(null);

// Scroll to specific slide
const scrollToSlide = (index: number) => {
  if (carouselApi.value) {
    carouselApi.value.scrollTo(index);
  }
};

const readOnly = ref(true);
const showDeleteDialog = ref(false);
const showUnsavedChangesDialog = ref(false);
const ignoreChanges = ref(false);

// Create editable copy of details
const editableDetails = ref<SelectHaexPasswordsItemDetails>({
  id: "",
  createdAt: null,
  icon: null,
  color: null,
  note: null,
  password: null,
  tags: null,
  title: null,
  updateAt: null,
  url: null,
  username: null,
  otpSecret: null,
  otpDigits: null,
  otpPeriod: null,
  otpAlgorithm: null,
  expiresAt: null,
});

// Store original details for comparison
const originalDetails = ref<SelectHaexPasswordsItemDetails | null>(null);

// Watch for changes in currentItem and update editableDetails
watch(
  () => currentItem.value,
  (item) => {
    if (item?.details) {
      editableDetails.value = { ...item.details };
      originalDetails.value = { ...item.details };
      ignoreChanges.value = false;

      // Reset key-value tracking
      keyValuesAdd.value = [];
      keyValuesDelete.value = [];

      // Reset attachments tracking
      attachments.value = item.attachments ? [...item.attachments] : [];
      attachmentsToAdd.value = [];
      attachmentsToDelete.value = [];
    }
  },
  { immediate: true }
);

// Check if there are unsaved changes
const hasChanges = computed(() => {
  if (!originalDetails.value) return false;

  // Check if details have changed
  const detailsChanged = JSON.stringify(originalDetails.value) !== JSON.stringify(editableDetails.value);

  // Check if there are any additions or deletions
  const hasKeyValueChanges = keyValuesAdd.value.length > 0 || keyValuesDelete.value.length > 0;
  const hasAttachmentChanges = attachmentsToAdd.value.length > 0 || attachmentsToDelete.value.length > 0;

  return detailsChanged || hasKeyValueChanges || hasAttachmentChanges;
});

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

const onSaveAsync = async () => {
  console.log('[ItemEdit] onSaveAsync called');
  console.log('[ItemEdit] currentItem:', currentItem.value);
  console.log('[ItemEdit] editableDetails.id:', editableDetails.value.id);

  if (!currentItem.value || !editableDetails.value.id) {
    console.log('[ItemEdit] Early return - missing currentItem or id');
    return;
  }

  console.log('[ItemEdit] Calling updateAsync with:', {
    details: editableDetails.value,
    keyValues: currentItem.value.keyValues,
    keyValuesAdd: keyValuesAdd.value,
    keyValuesDelete: keyValuesDelete.value,
    attachments: attachments.value,
    attachmentsToAdd: attachmentsToAdd.value,
    attachmentsToDelete: attachmentsToDelete.value,
  });

  try {
    await updateAsync({
      details: editableDetails.value,
      keyValues: currentItem.value.keyValues,
      keyValuesAdd: keyValuesAdd.value,
      keyValuesDelete: keyValuesDelete.value,
      attachments: attachments.value,
      attachmentsToAdd: attachmentsToAdd.value,
      attachmentsToDelete: attachmentsToDelete.value,
    });
    console.log('[ItemEdit] updateAsync completed');

    await syncGroupItemsAsync();
    console.log('[ItemEdit] syncGroupItemsAsync completed');

    // Reload current item to get updated attachments with data
    const updatedItem = await readAsync(editableDetails.value.id);
    console.log('[ItemEdit] readAsync result:', updatedItem);
    if (updatedItem) {
      currentItem.value = updatedItem;
    }

    // Update original details after successful save
    originalDetails.value = { ...editableDetails.value };
    ignoreChanges.value = true;
    readOnly.value = true;

    // Reset tracking arrays - will be handled by watch on currentItem
    keyValuesAdd.value = [];
    keyValuesDelete.value = [];
    attachmentsToAdd.value = [];
    attachmentsToDelete.value = [];
    console.log('[ItemEdit] Save completed successfully');
  } catch (error) {
    console.error("[ItemEdit] Error saving item:", error);
    const message = error instanceof Error ? error.message : String(error);
    toast.error(t('errors.save'), {
      description: message,
    });
  }
};

const onDeleteAsync = async () => {
  if (!currentItem.value) return;

  try {
    await deleteAsync(currentItem.value.details.id, inTrashGroup.value);
    await syncGroupItemsAsync();
    showDeleteDialog.value = false;
    router.back();
  } catch (error) {
    console.error("Error deleting item:", error);
    const message = error instanceof Error ? error.message : String(error);
    toast.error(t('errors.delete'), {
      description: message,
    });
  }
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
  loading: Laden...
  close: Schließen
  edit: Bearbeiten
  save: Speichern
  cancel: Abbrechen
  delete: Löschen
  untitled: Ohne Titel
  tabs:
    details: Details
    extra: Extra
    history: Verlauf
  unsavedChangesDialog:
    title: Nicht gespeicherte Änderungen
    description: Sollen die Änderungen verworfen werden?
    cancel: Abbrechen
    confirm: Verwerfen
  errors:
    save: Eintrag konnte nicht gespeichert werden
    delete: Eintrag konnte nicht gelöscht werden

en:
  loading: Loading...
  close: Close
  edit: Edit
  save: Save
  cancel: Cancel
  delete: Delete
  untitled: Untitled
  tabs:
    details: Details
    extra: Extra
    history: History
  unsavedChangesDialog:
    title: Unsaved changes
    description: Should the changes be discarded?
    cancel: Cancel
    confirm: Discard
  errors:
    save: Could not save item
    delete: Could not delete item
</i18n>
