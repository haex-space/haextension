<template>
  <UiDrawerModal v-model:open="isOpen" :title="dialogTitle" :description="t('description')">
    <template #content>
      <div class="space-y-4">
        <div class="flex items-center space-x-2">
          <ShadcnCheckbox id="includeHistory" v-model="options.includeHistory" />
          <label
            for="includeHistory"
            class="text-sm font-medium leading-none cursor-pointer"
          >
            {{ t("includeHistory") }}
          </label>
        </div>

        <div class="flex items-center space-x-2">
          <ShadcnCheckbox
            id="referenceCredentials"
            v-model="options.referenceCredentials"
          />
          <label
            for="referenceCredentials"
            class="text-sm font-medium leading-none cursor-pointer"
          >
            {{ t("referenceCredentials") }}
          </label>
        </div>

        <div class="flex items-center space-x-2">
          <ShadcnCheckbox
            id="withCloneAppendix"
            v-model="options.withCloneAppendix"
          />
          <label
            for="withCloneAppendix"
            class="text-sm font-medium leading-none cursor-pointer"
          >
            {{ t("withCloneAppendix", { suffix: cloneAppendixText }) }}
          </label>
        </div>
      </div>
    </template>

    <template #footer>
      <UiButton variant="outline" @click="onCancel">
        {{ t("cancel") }}
      </UiButton>
      <UiButton @click="onConfirm">
        {{ t("clone") }}
      </UiButton>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
const cloneStore = useGroupItemsCloneStore();
const { showDialog: isOpen, itemName, cloneAppendixText } = storeToRefs(cloneStore);

const { t } = useI18n();

const dialogTitle = computed(() => {
  if (itemName.value) {
    return t("titleWithName", { name: itemName.value });
  }
  return t("title");
});

const options = reactive({
  includeHistory: false,
  referenceCredentials: false,
  withCloneAppendix: true,
});

const resetOptions = () => {
  options.includeHistory = false;
  options.referenceCredentials = false;
  options.withCloneAppendix = true;
};

const onCancel = () => {
  cloneStore.closeCloneDialog();
  resetOptions();
};

const onConfirm = async () => {
  await cloneStore.confirmCloneAsync({ ...options });
  resetOptions();
};

// Reset options when dialog opens
watch(isOpen, (open) => {
  if (open) {
    resetOptions();
  }
});
</script>

<i18n lang="yaml">
de:
  title: Duplizieren
  titleWithName: "Duplizieren: {name}"
  description: Wählen Sie die Optionen für das Duplizieren.
  includeHistory: History mit kopieren
  referenceCredentials: Benutzername und Passwort als Referenz
  withCloneAppendix: "\"{suffix}\" an Namen anhängen"
  cancel: Abbrechen
  clone: Duplizieren

en:
  title: Duplicate
  titleWithName: "Duplicate: {name}"
  description: Choose the options for duplicating.
  includeHistory: Include history
  referenceCredentials: Reference username and password
  withCloneAppendix: "Append \"{suffix}\" to name"
  cancel: Cancel
  clone: Duplicate
</i18n>
