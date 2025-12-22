<template>
  <div class="p-4">
    <ShadcnCard>
      <ShadcnCardContent class="space-y-4">
        <div class="space-y-2">
          <ShadcnLabel>{{ t("name") }}</ShadcnLabel>
          <UiInput
            v-model="groupName"
            autofocus
            :placeholder="t('namePlaceholder')"
            :readonly="readOnly"
            @keyup.enter="$emit('submit')"
          />
        </div>

        <div class="space-y-2">
          <ShadcnLabel>{{ t("description") }}</ShadcnLabel>
          <ShadcnTextarea
            v-model="groupDescription"
            :placeholder="t('descriptionPlaceholder')"
            :readonly="readOnly"
            rows="3"
            @keyup.enter="$emit('submit')"
          />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <ShadcnLabel>{{ t("icon") }}</ShadcnLabel>
            <HaexSelectIcon
              v-model="group.icon"
              :color="group.color"
              default-icon="folder"
              :read-only="readOnly"
            />
          </div>

          <div class="space-y-2">
            <ShadcnLabel>{{ t("color") }}</ShadcnLabel>
            <HaexSelectColor v-model="group.color" :read-only="readOnly" />
          </div>
        </div>
      </ShadcnCardContent>
    </ShadcnCard>
  </div>
</template>

<script setup lang="ts">
import type { SelectHaexPasswordsGroups } from "~/database";

const group = defineModel<SelectHaexPasswordsGroups>({ required: true });

const { readOnly = false } = defineProps<{
  readOnly?: boolean;
}>();

defineEmits<{
  submit: [];
}>();

const { t } = useI18n();

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

en:
  name: Name
  namePlaceholder: Enter group name
  description: Description
  descriptionPlaceholder: Enter description (optional)
  icon: Icon
  color: Color
</i18n>
