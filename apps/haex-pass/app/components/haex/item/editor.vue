<template>
  <div class="h-screen flex flex-col">
    <!-- Header -->
    <div
      class="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center gap-4"
    >
      <!-- Tab Navigation -->
      <div class="flex-1 flex justify-center">
        <div
          class="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground"
        >
          <button
            v-for="(tab, index) in tabs"
            :key="tab.value"
            type="button"
            :class="[
              'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
              activeTab === index
                ? 'bg-background text-foreground shadow'
                : 'hover:bg-background/50',
            ]"
            @click="scrollToSlide(index)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Header Actions -->
      <div class="flex gap-2 items-center">
        <!-- Delete Button (only in edit mode) -->
        <UiButton
          v-if="mode === 'edit'"
          :icon="Trash2"
          :title="t('delete')"
          variant="destructive"
          @click="showDeleteDialog = true"
        >
          <span class="hidden sm:inline">{{ t("delete") }}</span>
        </UiButton>

        <!-- Edit Button (only in edit mode when readOnly) -->
        <UiButton
          v-if="mode === 'edit' && readOnly"
          :icon="Pencil"
          :title="t('edit')"
          variant="default"
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
          :title="t('save')"
          @click="onSaveAsync"
        >
          <span class="hidden sm:inline">{{ t("save") }}</span>
        </UiButton>

        <!-- Close Button -->
        <UiButton
          :icon="X"
          :title="t('cancel')"
          variant="ghost"
          @click="onClose"
        />
      </div>
    </div>

    <!-- Carousel Content -->
    <ShadcnCarousel
      v-if="editableDetails"
      class="flex-1 overflow-hidden"
      @init-api="onCarouselInit"
    >
      <ShadcnCarouselContent class="h-full">
        <!-- Details Slide -->
        <ShadcnCarouselItem class="h-full">
          <div class="h-full overflow-y-auto">
            <HaexItemDetails
              v-model="editableDetails"
              v-model:tags="itemTags"
              :read-only="mode === 'edit' && readOnly"
              @submit="onSaveAsync"
            />
          </div>
        </ShadcnCarouselItem>

        <!-- Key-Value Slide -->
        <ShadcnCarouselItem class="h-full">
          <div class="h-full overflow-hidden">
            <HaexItemKeyValue
              v-model="keyValues"
              v-model:item-details="editableDetails"
              v-model:items-to-add="keyValuesAdd"
              v-model:items-to-delete="keyValuesDelete"
              v-model:attachments="attachments"
              v-model:attachments-to-add="attachmentsToAdd"
              v-model:attachments-to-delete="attachmentsToDelete"
              v-model:passkeys-to-add="passkeysToAdd"
              v-model:passkeys-to-delete="passkeysToDelete"
              :item-id="editableDetails.id || ''"
              :read-only="mode === 'edit' && readOnly"
            />
          </div>
        </ShadcnCarouselItem>

        <!-- History Slide (only in edit mode) -->
        <ShadcnCarouselItem v-if="mode === 'edit'" class="h-full">
          <div class="h-full overflow-hidden">
            <HaexItemHistory
              v-if="editableDetails.id"
              :key="`history-${editableDetails.id}-${activeTab}`"
              :item-id="editableDetails.id"
            />
          </div>
        </ShadcnCarouselItem>
      </ShadcnCarouselContent>
    </ShadcnCarousel>

    <div
      v-else-if="mode === 'edit'"
      class="flex-1 flex items-center justify-center"
    >
      <p class="text-muted-foreground">{{ t("loading") }}</p>
    </div>

    <!-- Delete Dialog (only in edit mode) -->
    <HaexDialogDeleteItem
      v-if="mode === 'edit'"
      v-model:open="showDeleteDialog"
      :item-name="editableDetails?.title || t('untitled')"
      :final="inTrashGroup"
      @confirm="onDeleteAsync"
      @abort="showDeleteDialog = false"
    />

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
import { X, Trash2, Pencil, Save } from "lucide-vue-next";
import { toast } from "vue-sonner";
import type {
  SelectHaexPasswordsItemDetails,
  SelectHaexPasswordsItemKeyValues,
  SelectHaexPasswordsPasskeys,
} from "~/database";
import type { AttachmentWithSize } from "~/types/attachment";
import type { UnwrapRefCarouselApi } from "@/components/shadcn/carousel/interface";
import { useMagicKeys } from "@vueuse/core";

const props = defineProps<{
  mode: "create" | "edit";
}>();

const { t } = useI18n();
const router = useRouter();

// Stores
const { currentItem } = storeToRefs(usePasswordItemStore());
const { currentGroup } = storeToRefs(usePasswordGroupStore());
const { addAsync, updateAsync, deleteAsync, readAsync } =
  usePasswordItemStore();
const { syncGroupItemsAsync } = usePasswordGroupStore();
const { inTrashGroup } = storeToRefs(useGroupTreeStore());
const passkeyStore = usePasskeyStore();
const tagStore = useTagStore();

// Helper to load tags for an item
const loadItemTagsAsync = async (itemId: string): Promise<string[]> => {
  const tagObjects = await tagStore.getItemTagsAsync(itemId);
  return tagObjects.map((t) => t.name);
};

// Tabs configuration
const tabs = computed(() => {
  const baseTabs = [
    { label: t("tabs.details"), value: "details" },
    { label: t("tabs.extra"), value: "extra" },
  ];
  if (props.mode === "edit") {
    baseTabs.push({ label: t("tabs.history"), value: "history" });
  }
  return baseTabs;
});

const activeTab = ref(0);
const carouselApi = ref<UnwrapRefCarouselApi | null>(null);

const onCarouselInit = (api: UnwrapRefCarouselApi) => {
  if (api) {
    carouselApi.value = api;
    api.on("select", () => {
      activeTab.value = api.selectedScrollSnap();
    });
  }
};

const scrollToSlide = (index: number) => {
  if (carouselApi.value) {
    carouselApi.value.scrollTo(index);
  }
};

// State
const route = useRoute();
const readOnly = ref(props.mode === "edit" && route.query.edit !== "true");
const showDeleteDialog = ref(false);
const showUnsavedChangesDialog = ref(false);
const ignoreChanges = ref(false);

// Item state
const editableDetails = ref<SelectHaexPasswordsItemDetails | null>(null);
const originalDetails = ref<SelectHaexPasswordsItemDetails | null>(null);

// Key-Value tracking
const keyValues = ref<SelectHaexPasswordsItemKeyValues[]>([]);
const keyValuesAdd = ref<SelectHaexPasswordsItemKeyValues[]>([]);
const keyValuesDelete = ref<SelectHaexPasswordsItemKeyValues[]>([]);

// Attachments tracking
const attachments = ref<AttachmentWithSize[]>([]);
const attachmentsToAdd = ref<AttachmentWithSize[]>([]);
const attachmentsToDelete = ref<AttachmentWithSize[]>([]);

// Passkeys tracking
const passkeysToAdd = ref<SelectHaexPasswordsPasskeys[]>([]);
const passkeysToDelete = ref<SelectHaexPasswordsPasskeys[]>([]);

// Tags tracking (stored in separate table via tagStore)
const itemTags = ref<string[]>([]);
const originalTags = ref<string[]>([]);

// Empty item template
const createEmptyDetails = (): SelectHaexPasswordsItemDetails => ({
  id: "",
  createdAt: null,
  icon: null,
  color: null,
  note: null,
  password: null,
  title: null,
  updateAt: null,
  url: null,
  username: null,
  otpSecret: null,
  otpDigits: null,
  otpPeriod: null,
  otpAlgorithm: null,
  expiresAt: null,
  autofillAliases: null,
});

// Initialize based on mode
const initializeItem = () => {
  if (props.mode === "create") {
    editableDetails.value = createEmptyDetails();
    originalDetails.value = createEmptyDetails();
    keyValues.value = [];
    keyValuesAdd.value = [];
    keyValuesDelete.value = [];
    attachments.value = [];
    attachmentsToAdd.value = [];
    attachmentsToDelete.value = [];
    passkeysToAdd.value = [];
    passkeysToDelete.value = [];
    itemTags.value = [];
    originalTags.value = [];
  }
};

// Watch for currentItem changes in edit mode
watch(
  () => currentItem.value,
  async (item) => {
    if (props.mode === "edit" && item?.details) {
      editableDetails.value = { ...item.details };
      originalDetails.value = { ...item.details };
      ignoreChanges.value = false;

      // Reset key-value tracking
      keyValues.value = item.keyValues ? [...item.keyValues] : [];
      keyValuesAdd.value = [];
      keyValuesDelete.value = [];

      // Reset attachments tracking
      attachments.value = item.attachments ? [...item.attachments] : [];
      attachmentsToAdd.value = [];
      attachmentsToDelete.value = [];

      // Reset passkeys tracking
      passkeysToAdd.value = [];
      passkeysToDelete.value = [];

      // Load tags from tag store
      const loadedTags = await loadItemTagsAsync(item.details.id);
      itemTags.value = loadedTags;
      originalTags.value = [...loadedTags];
    }
  },
  { immediate: true }
);

// Initialize on mount
onMounted(() => {
  if (props.mode === "create") {
    initializeItem();
  }
});

// Check if there are unsaved changes
const hasChanges = computed(() => {
  if (!editableDetails.value || !originalDetails.value) return false;

  const detailsChanged =
    JSON.stringify(originalDetails.value) !==
    JSON.stringify(editableDetails.value);

  const hasKeyValueChanges =
    keyValuesAdd.value.length > 0 || keyValuesDelete.value.length > 0;

  const hasAttachmentChanges =
    attachmentsToAdd.value.length > 0 || attachmentsToDelete.value.length > 0;

  const hasPasskeyChanges = passkeysToAdd.value.length > 0 || passkeysToDelete.value.length > 0;

  const hasTagChanges =
    JSON.stringify([...itemTags.value].sort()) !==
    JSON.stringify([...originalTags.value].sort());

  return detailsChanged || hasKeyValueChanges || hasAttachmentChanges || hasPasskeyChanges || hasTagChanges;
});

// Actions
const onSaveAsync = async () => {
  if (!editableDetails.value) return;

  try {
    if (props.mode === "create") {
      const newId = await addAsync(
        editableDetails.value,
        keyValuesAdd.value,
        currentGroup.value
      );

      if (newId) {
        // Save passkeys with the new item ID
        for (const passkey of passkeysToAdd.value) {
          await passkeyStore.addPasskeyAsync({
            ...passkey,
            itemId: newId,
          });
        }

        // Save tags
        if (itemTags.value.length > 0) {
          await tagStore.setItemTagsAsync(newId, itemTags.value);
        }

        ignoreChanges.value = true;
        await syncGroupItemsAsync();
        router.back();
      }
    } else {
      if (!editableDetails.value.id) return;

      await updateAsync({
        details: editableDetails.value,
        keyValues: keyValues.value,
        keyValuesAdd: keyValuesAdd.value,
        keyValuesDelete: keyValuesDelete.value,
        attachments: attachments.value,
        attachmentsToAdd: attachmentsToAdd.value,
        attachmentsToDelete: attachmentsToDelete.value,
      });

      // Delete passkeys that were marked for deletion
      for (const passkey of passkeysToDelete.value) {
        await passkeyStore.deletePasskeyAsync(passkey.id);
      }

      // Save new passkeys
      for (const passkey of passkeysToAdd.value) {
        await passkeyStore.addPasskeyAsync({
          ...passkey,
          itemId: editableDetails.value.id,
        });
      }

      // Save tags (replace all tags)
      await tagStore.setItemTagsAsync(editableDetails.value.id, itemTags.value);

      await syncGroupItemsAsync();

      // Reload current item to get updated attachments with data
      const updatedItem = await readAsync(editableDetails.value.id);
      if (updatedItem) {
        currentItem.value = updatedItem;
      }

      // Update original details after successful save
      originalDetails.value = { ...editableDetails.value };
      originalTags.value = [...itemTags.value];
      ignoreChanges.value = true;
      readOnly.value = true;

      // Reset tracking arrays
      keyValuesAdd.value = [];
      keyValuesDelete.value = [];
      attachmentsToAdd.value = [];
      attachmentsToDelete.value = [];
      passkeysToAdd.value = [];
      passkeysToDelete.value = [];
    }
  } catch (error) {
    console.error("Error saving item:", error);
    const message = error instanceof Error ? error.message : String(error);
    toast.error(t("errors.save"), { description: message });
  }
};

const onDeleteAsync = async () => {
  if (!editableDetails.value?.id) return;

  try {
    await deleteAsync(editableDetails.value.id, inTrashGroup.value);
    await syncGroupItemsAsync();
    showDeleteDialog.value = false;
    router.back();
  } catch (error) {
    console.error("Error deleting item:", error);
    const message = error instanceof Error ? error.message : String(error);
    toast.error(t("errors.delete"), { description: message });
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

const { escape } = useMagicKeys();
watch(
  () => escape?.value,
  () => onClose()
);
</script>

<i18n lang="yaml">
de:
  loading: Laden...
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
