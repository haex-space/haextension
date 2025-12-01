<template>
  <div class="p-4 space-y-6 h-full overflow-y-auto">
    <!-- Key-Value Pairs -->
    <UiCard>
      <UiCardHeader>
        <UiCardTitle>{{ t("customFields") }}</UiCardTitle>
      </UiCardHeader>

      <UiCardContent>
        <div class="flex flex-col lg:flex-row gap-4">
          <!-- Key List -->
          <div v-if="allItems.length" class="flex-1">
            <div class="border rounded-lg divide-y">
              <TransitionGroup name="list" tag="div">
                <div
                  v-for="(item, index) in allItems"
                  :key="item.id"
                  :class="{
                    'bg-accent': currentSelected === item,
                  }"
                  class="flex gap-2 hover:bg-accent/50 px-3 py-2 items-center transition-colors cursor-pointer"
                  @click="currentSelected = item"
                >
                  <input
                    :ref="el => { if (index === allItems.length - 1) lastKeyInput = el as HTMLInputElement }"
                    v-model="item.key"
                    :readonly="currentSelected !== item || readOnly"
                    :placeholder="t('keyPlaceholder')"
                    class="flex-1 bg-transparent border-none outline-none text-sm"
                    @click.stop="currentSelected = item"
                  />

                  <UiButton
                    v-if="!readOnly && currentSelected === item"
                    :icon="Trash2"
                    variant="ghost"
                    size="icon-sm"
                    @click.stop="deleteItem(item.id)"
                  />

                  <UiButton
                    :icon="copied && copiedItem === item ? Check : Copy"
                    variant="ghost"
                    size="icon-sm"
                    @click.stop="copyValue(item)"
                  />
                </div>
              </TransitionGroup>
            </div>
          </div>

          <!-- Value Textarea -->
          <div v-if="allItems.length" class="flex-1 min-w-0 lg:min-w-52">
            <div class="space-y-2">
              <UiLabel>{{ t('value') }}</UiLabel>
              <div class="relative">
                <UiTextarea
                  v-model="currentValue"
                  :readonly="readOnly || !currentSelected"
                  :placeholder="t('valuePlaceholder')"
                  rows="8"
                  class="pr-12"
                />
                <UiButton
                  :icon="copied && copiedItem === currentSelected ? Check : Copy"
                  variant="ghost"
                  size="icon-sm"
                  class="absolute top-2 right-2"
                  :disabled="!currentSelected"
                  @click.prevent="copyValue(currentSelected)"
                />
              </div>
            </div>
          </div>
        </div>
      </UiCardContent>

      <UiCardFooter v-if="!readOnly">
        <UiButton
          :icon="Plus"
          variant="outline"
          class="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          @click="addItem"
        >
          {{ t('addField') }}
        </UiButton>
      </UiCardFooter>
    </UiCard>

    <!-- Attachments Section -->
    <UiCard>
      <UiCardHeader>
        <UiCardTitle>{{ t("attachments") }}</UiCardTitle>
      </UiCardHeader>

      <UiCardContent>
        <HaexItemAttachments
          v-model="attachments"
          v-model:attachments-to-add="attachmentsToAdd"
          v-model:attachments-to-delete="attachmentsToDelete"
          :item-id="itemId"
          :read-only="readOnly"
        />
      </UiCardContent>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import { useClipboard, useFocus } from "@vueuse/core";
import { Plus, Trash2, Copy, Check } from "lucide-vue-next";
import type {
  SelectHaexPasswordsItemKeyValues,
  SelectHaexPasswordsItemBinaries,
} from "~/database";

interface AttachmentWithSize extends SelectHaexPasswordsItemBinaries {
  size?: number;
}

const { itemId, readOnly } = defineProps<{
  readOnly?: boolean;
  itemId: string;
}>();

const items = defineModel<SelectHaexPasswordsItemKeyValues[]>({ default: [] });

const itemsToDelete = defineModel<SelectHaexPasswordsItemKeyValues[]>(
  "itemsToDelete",
  { default: [] }
);
const itemsToAdd = defineModel<SelectHaexPasswordsItemKeyValues[]>(
  "itemsToAdd",
  { default: [] }
);

const attachments = defineModel<AttachmentWithSize[]>("attachments", {
  default: [],
});
const attachmentsToAdd = defineModel<AttachmentWithSize[]>("attachmentsToAdd", {
  default: [],
});
const attachmentsToDelete = defineModel<SelectHaexPasswordsItemBinaries[]>(
  "attachmentsToDelete",
  { default: [] }
);

const { t } = useI18n();

const allItems = computed(() => [...items.value, ...itemsToAdd.value]);

const currentSelected = ref<SelectHaexPasswordsItemKeyValues | undefined>(
  items.value?.at(0)
);

const lastKeyInput = ref<HTMLInputElement>();
const { focused: lastKeyInputFocused } = useFocus(lastKeyInput);

watch(
  () => itemId,
  () => (currentSelected.value = items.value?.at(0))
);

const currentValue = computed({
  get: () => currentSelected.value?.value || "",
  set(newValue: string) {
    if (currentSelected.value) currentSelected.value.value = newValue;
  },
});

const addItem = async () => {
  const newItem = {
    id: crypto.randomUUID(),
    itemId,
    key: "",
    value: "",
    updateAt: null,
  };
  itemsToAdd.value?.push(newItem);
  currentSelected.value = newItem;

  // Focus the newly added input field
  await nextTick();
  lastKeyInputFocused.value = true;
};

const deleteItem = (id: string) => {
  const item = items.value.find((item) => item.id === id);
  if (item) {
    itemsToDelete.value?.push(item);
    items.value = items.value.filter((item) => item.id !== id);
  }

  itemsToAdd.value = itemsToAdd.value?.filter((item) => item.id !== id) ?? [];

  // Select next item if current was deleted
  if (currentSelected.value?.id === id) {
    currentSelected.value = allItems.value[0];
  }
};

const { copy, copied } = useClipboard();
const copiedItem = ref<SelectHaexPasswordsItemKeyValues | undefined>();

const copyValue = async (item: SelectHaexPasswordsItemKeyValues | undefined) => {
  if (item?.value) {
    await copy(item.value);
    copiedItem.value = item;
    setTimeout(() => {
      copiedItem.value = undefined;
    }, 2000);
  }
};
</script>

<i18n lang="yaml">
de:
  addField: Feld hinzufügen
  key: Schlüssel
  keyPlaceholder: Schlüssel eingeben
  value: Wert
  valuePlaceholder: Wert eingeben
  customFields: Benutzerdefinierte Felder
  attachments: Anhänge

en:
  addField: Add field
  key: Key
  keyPlaceholder: Enter key
  value: Value
  valuePlaceholder: Enter value
  customFields: Custom Fields
  attachments: Attachments
</i18n>
