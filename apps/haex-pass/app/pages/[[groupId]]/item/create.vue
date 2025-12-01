<template>
  <div class="h-screen flex flex-col">
    <!-- Header -->
    <div class="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center gap-4">
      <!-- Spacer for left side -->
      <div class="flex-1"></div>

      <!-- Tab Navigation (centered) -->
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

      <!-- Header Actions (right side) -->
      <div class="flex-1 flex gap-2 items-center justify-end">
        <UiButton
          :icon="Save"
          :disabled="!hasChanges"
          :class="{ 'animate-pulse': hasChanges }"
          size="sm"
          @click="onSaveAsync"
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

    <!-- Carousel Content -->
    <UiCarousel
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
      <UiCarouselContent class="h-full">
        <!-- Details Slide -->
        <UiCarouselItem class="h-full">
          <div class="h-full overflow-y-auto">
            <HaexItemDetails
              v-model="item.details"
              :read-only="false"
              @submit="onSaveAsync"
            />
          </div>
        </UiCarouselItem>

        <!-- Key-Value Slide -->
        <UiCarouselItem class="h-full">
          <div class="h-full overflow-hidden">
            <HaexItemKeyValue
              v-model:items-to-add="item.keyValuesAdd"
              :item-id="''"
              :read-only="false"
            />
          </div>
        </UiCarouselItem>
      </UiCarouselContent>
    </UiCarousel>

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
import { X, Save } from "lucide-vue-next";
import type {
  SelectHaexPasswordsItemDetails,
  SelectHaexPasswordsItemKeyValues,
} from "~/database";

definePageMeta({
  name: "passwordItemCreate",
});

const { t } = useI18n();
const router = useRouter();

const { currentGroup } = storeToRefs(usePasswordGroupStore());
const { syncGroupItemsAsync } = usePasswordGroupStore();
const { addAsync } = usePasswordItemStore();

// Tabs configuration
const tabs = computed(() => [
  { label: t('tabs.details'), value: 'details' },
  { label: t('tabs.extra'), value: 'extra' },
]);

const activeTab = ref(0);
const carouselApi = ref<any>(null);

// Scroll to specific slide
const scrollToSlide = (index: number) => {
  if (carouselApi.value) {
    carouselApi.value.scrollTo(index);
  }
};

// Item state
const item = reactive<{
  details: SelectHaexPasswordsItemDetails;
  keyValuesAdd: SelectHaexPasswordsItemKeyValues[];
  originalDetails: SelectHaexPasswordsItemDetails;
}>({
  details: {
    createdAt: null,
    icon: null,
    color: null,
    id: "",
    note: null,
    password: null,
    tags: null,
    title: null,
    updateAt: null,
    url: null,
    username: null,
    otpSecret: null,
  },
  keyValuesAdd: [],
  originalDetails: {
    createdAt: null,
    icon: null,
    color: null,
    id: "",
    note: null,
    password: null,
    tags: null,
    title: null,
    updateAt: null,
    url: null,
    username: null,
    otpSecret: null,
  },
});

const ignoreChanges = ref(false);
const showUnsavedChangesDialog = ref(false);

// Check if there are unsaved changes
const hasChanges = computed(() => {
  const detailsChanged = JSON.stringify(item.originalDetails) !== JSON.stringify(item.details);
  return detailsChanged || item.keyValuesAdd.length > 0;
});

const onSaveAsync = async () => {
  try {
    const newId = await addAsync(
      item.details,
      item.keyValuesAdd,
      currentGroup.value
    );

    if (newId) {
      ignoreChanges.value = true;
      await syncGroupItemsAsync();
      router.back();
    }
  } catch (error) {
    console.error("Error creating item:", error);
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
  save: Speichern
  tabs:
    details: Details
    extra: Extra
  unsavedChangesDialog:
    title: Nicht gespeicherte Änderungen
    description: Sollen die Änderungen verworfen werden?
    cancel: Abbrechen
    confirm: Verwerfen

en:
  save: Save
  tabs:
    details: Details
    extra: Extra
  unsavedChangesDialog:
    title: Unsaved changes
    description: Should the changes be discarded?
    cancel: Cancel
    confirm: Discard
</i18n>
