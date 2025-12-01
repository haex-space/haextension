<template>
  <UiAlertDialog v-model:open="isOpen">
    <UiAlertDialogContent>
      <UiAlertDialogHeader>
        <UiAlertDialogTitle>{{ t("title") }}</UiAlertDialogTitle>
        <UiAlertDialogDescription>
          {{ t("description") }}
        </UiAlertDialogDescription>
      </UiAlertDialogHeader>

      <div class="space-y-4 my-4">
        <div class="flex items-center space-x-2">
          <UiCheckbox id="includeHistory" v-model="options.includeHistory" />
          <label
            for="includeHistory"
            class="text-sm font-medium leading-none cursor-pointer"
          >
            {{ t("includeHistory") }}
          </label>
        </div>

        <div class="flex items-center space-x-2">
          <UiCheckbox
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
          <UiCheckbox
            id="withCloneAppendix"
            v-model="options.withCloneAppendix"
          />
          <label
            for="withCloneAppendix"
            class="text-sm font-medium leading-none cursor-pointer"
          >
            {{ t("withCloneAppendix") }}
          </label>
        </div>
      </div>

      <UiAlertDialogFooter>
        <UiAlertDialogCancel @click="onCancel">
          {{ t("cancel") }}
        </UiAlertDialogCancel>
        <UiAlertDialogAction @click="onConfirm">
          {{ t("clone") }}
        </UiAlertDialogAction>
      </UiAlertDialogFooter>
    </UiAlertDialogContent>
  </UiAlertDialog>
</template>

<script setup lang="ts">
const isOpen = defineModel<boolean>("open");

const emit = defineEmits<{
  confirm: [
    options: {
      includeHistory: boolean;
      referenceCredentials: boolean;
      withCloneAppendix: boolean;
    }
  ];
}>();

const { t } = useI18n();

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
  isOpen.value = false;
  resetOptions();
};

const onConfirm = () => {
  emit("confirm", { ...options });
  isOpen.value = false;
  resetOptions();
};
</script>

<i18n lang="yaml">
de:
  title: Klon-Optionen
  description: Wählen Sie die Optionen für das Klonen der ausgewählten Elemente.
  includeHistory: History mit kopieren
  referenceCredentials: Benutzername und Passwort als Referenz
  withCloneAppendix: "(Klon) an Namen anhängen"
  cancel: Abbrechen
  clone: Klonen

en:
  title: Clone Options
  description: Choose the options for cloning the selected items.
  includeHistory: Include history
  referenceCredentials: Reference username and password
  withCloneAppendix: "Append (Clone) to name"
  cancel: Cancel
  clone: Clone
</i18n>
