<template>
  <div class="p-4 space-y-4">
    <UiCard>
      <UiCardHeader>
        <UiCardTitle>
          {{ mode === "edit" ? t("title.edit") : t("title.create") }}
        </UiCardTitle>
      </UiCardHeader>

      <UiCardContent class="space-y-4">
        <div class="space-y-2">
          <UiLabel>{{ t("name") }}</UiLabel>
          <UiInput
            ref="nameRef"
            v-model="groupName"
            :placeholder="t('namePlaceholder')"
            :readonly="readOnly"
            @keyup.enter="$emit('submit')"
          />
        </div>

        <div class="space-y-2">
          <UiLabel>{{ t("description") }}</UiLabel>
          <UiTextarea
            v-model="groupDescription"
            :placeholder="t('descriptionPlaceholder')"
            :readonly="readOnly"
            rows="3"
            @keyup.enter="$emit('submit')"
          />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <UiLabel>{{ t("icon") }}</UiLabel>
            <HaexSelectIcon
              v-model="group.icon"
              :color="group.color"
              default-icon="folder"
              :read-only="readOnly"
            />
          </div>

          <div class="space-y-2">
            <UiLabel>{{ t("color") }}</UiLabel>
            <HaexSelectColor v-model="group.color" :read-only="readOnly" />
          </div>
        </div>
      </UiCardContent>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import { useFocus } from "@vueuse/core";
import type { SelectHaexPasswordsGroups } from "~/database";

const group = defineModel<SelectHaexPasswordsGroups>({ required: true });

const { readOnly = false, mode = "create" } = defineProps<{
  readOnly?: boolean;
  mode?: "create" | "edit";
}>();

defineEmits<{
  submit: [];
}>();

const { t } = useI18n();

// Auto-focus on name field
const nameRef = useTemplateRef("nameRef");
useFocus(nameRef, { initialValue: true });

// Computed properties to handle null -> undefined conversion for UiInput/UiTextarea
const groupName = computed({
  get: () => group.value.name || undefined,
  set: (value) => {
    group.value.name = value || null;
  },
});

const groupDescription = computed({
  get: () => group.value.description || undefined,
  set: (value) => {
    group.value.description = value || null;
  },
});
</script>

<i18n lang="yaml">
de:
  name: Name
  namePlaceholder: Gruppenname eingeben
  description: Beschreibung
  descriptionPlaceholder: Beschreibung eingeben (optional)
  icon: Icon
  color: Farbe
  title:
    create: Gruppe erstellen
    edit: Gruppe bearbeiten

en:
  name: Name
  namePlaceholder: Enter group name
  description: Description
  descriptionPlaceholder: Enter description (optional)
  icon: Icon
  color: Color
  title:
    create: Create group
    edit: Edit group
</i18n>
