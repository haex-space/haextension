<template>
  <div class="p-4">
    <ShadcnCard>
      <ShadcnCardContent class="space-y-4">
        <div class="space-y-2">
          <ShadcnLabel>{{ t("name") }}</ShadcnLabel>
          <UiInput
            ref="nameRef"
            v-model="groupName"
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
            <div class="flex gap-2">
              <HaexSelectIcon
                v-model="group.icon"
                :color="group.color"
                default-icon="folder"
                :read-only="readOnly"
              />
              <UiButton
                v-if="group.icon && showApplyIconButton"
                :icon="ImageIcon"
                variant="outline"
                :tooltip="t('applyIconToItems')"
                @click="$emit('applyIcon')"
              />
            </div>
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
import { onStartTyping } from "@vueuse/core";
import { Image as ImageIcon } from "lucide-vue-next";
import type { SelectHaexPasswordsGroups } from "~/database";

const group = defineModel<SelectHaexPasswordsGroups>({ required: true });

const { readOnly = false, showApplyIconButton = false } = defineProps<{
  readOnly?: boolean;
  showApplyIconButton?: boolean;
}>();

defineEmits<{
  submit: [];
  applyIcon: [];
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

const nameRef = useTemplateRef<{ focus: () => void }>("nameRef");

const focus = () => nameRef.value?.focus();
onMounted(() => {
  nextTick(() => {
    focus();
  });
});

onStartTyping(() => {
  focus();
});

watch(
  () => readOnly,
  () => focus()
);
</script>

<i18n lang="yaml">
de:
  name: Name
  namePlaceholder: Gruppenname eingeben
  description: Beschreibung
  descriptionPlaceholder: Beschreibung eingeben (optional)
  icon: Icon
  color: Farbe
  applyIconToItems: Icon auf Einträge übertragen

en:
  name: Name
  namePlaceholder: Enter group name
  description: Description
  descriptionPlaceholder: Enter description (optional)
  icon: Icon
  color: Color
  applyIconToItems: Apply icon to entries
</i18n>
