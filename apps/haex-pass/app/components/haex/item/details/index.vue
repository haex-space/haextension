<template>
  <div class="h-full overflow-y-auto px-4 py-4">
    <form
      class="flex flex-col gap-4 w-full max-w-2xl mx-auto"
      @submit.prevent="$emit('submit')"
    >
      <!-- Title -->
      <div v-show="!readOnly || itemDetails.title">
        <UiLabel>{{ t("item.title") }}</UiLabel>
        <HaexInput
          ref="titleRef"
          v-model.trim="itemDetails.title"
          :placeholder="t('item.title')"
          :readonly="readOnly"
          @keyup.enter="$emit('submit')"
        />
      </div>

      <!-- Username -->
      <div v-show="!readOnly || itemDetails.username">
        <UiLabel>{{ t("item.username") }}</UiLabel>
        <HaexInput
          v-model.trim="itemDetails.username"
          :placeholder="t('item.username')"
          :readonly="readOnly"
          @keyup.enter="$emit('submit')"
        />
      </div>

      <!-- Password -->
      <div v-if="!readOnly || itemDetails.password">
        <UiLabel>{{ t("item.password") }}</UiLabel>
        <HaexInputPassword
          v-model.trim="itemDetails.password"
          :placeholder="t('item.password')"
          :readonly="readOnly"
          :read-only="readOnly"
          @keyup.enter="$emit('submit')"
        />
      </div>

      <!-- URL -->
      <HaexInputUrl
        v-show="!readOnly || itemDetails.url"
        v-model="itemDetails.url"
        :readonly="readOnly"
        @keyup.enter="$emit('submit')"
        @favicon-fetched="onFaviconFetched"
      />

      <!-- OTP Secret -->
      <HaexInputOtp
        v-show="!readOnly || itemDetails.otpSecret"
        v-model="itemDetails.otpSecret"
        :readonly="readOnly"
        @submit="$emit('submit')"
      />

      <!-- Tags -->
      <div v-show="!readOnly || tags.length">
        <UiLabel>{{ t("item.tags.label") }}</UiLabel>
        <UiTagsInput
          v-if="!readOnly"
          v-model="tags"
          class="mt-2"
        >
          <UiTagsInputItem
            v-for="item in tags"
            :key="item"
            :value="item"
          >
            <UiTagsInputItemText />
            <UiTagsInputItemDelete />
          </UiTagsInputItem>
          <UiTagsInputInput :placeholder="t('item.tags.placeholder')" />
        </UiTagsInput>
        <div v-else class="flex flex-wrap gap-2 mt-2">
          <UiBadge
            v-for="(tag, index) in tags"
            :key="index"
            variant="secondary"
          >
            {{ tag }}
          </UiBadge>
        </div>
      </div>

      <!-- Note -->
      <HaexInputNote
        v-show="!readOnly || itemDetails.note"
        v-model="itemDetails.note"
        :readonly="readOnly"
        @keyup.enter.stop
      />

      <!-- Icon & Color -->
      <div v-show="!readOnly || itemDetails.icon || itemDetails.color" class="grid grid-cols-2 gap-4">
        <HaexSelectIcon
          v-model="itemDetails.icon"
          :color="itemDetails.color"
          :label="t('item.icon')"
          :read-only="readOnly"
          default-icon="key"
        />
        <HaexSelectColor
          v-model="itemDetails.color"
          :label="t('item.color')"
          :read-only="readOnly"
        />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onStartTyping, useFocus } from "@vueuse/core";
import type { SelectHaexPasswordsItemDetails } from "~/database";

defineProps<{
  defaultIcon?: string | null;
  readOnly?: boolean;
  withCopyButton?: boolean;
}>();

defineEmits(["submit"]);
const { t } = useI18n();

const itemDetails = defineModel<SelectHaexPasswordsItemDetails>({
  required: true,
});

// Convert tags from JSON string to array and back
const tags = computed<string[]>({
  get: () => {
    if (!itemDetails.value.tags) return [];
    try {
      return JSON.parse(itemDetails.value.tags);
    } catch {
      return [];
    }
  },
  set: (value: string[]) => {
    itemDetails.value.tags = JSON.stringify(value);
  },
});

const titleRef = useTemplateRef("titleRef");
const { focused } = useFocus(titleRef);

onStartTyping(() => {
  focused.value = true;
});

const onFaviconFetched = (iconName: string) => {
  itemDetails.value.icon = iconName;
};
</script>

<i18n lang="yaml">
de:
  item:
    icon: Icon
    color: Farbe
    title: Titel
    username: Nutzername
    password: Passwort
    url: Url
    otpSecret: OTP Secret
    tags:
      label: Tags
      placeholder: Tag hinzufügen...
    note: Notiz

en:
  item:
    icon: Icon
    color: Color
    title: Title
    username: Username
    password: Password
    url: Url
    otpSecret: OTP Secret
    tags:
      label: Tags
      placeholder: Add tag...
    note: Note
</i18n>
