<template>
  <div class="h-full overflow-y-auto px-4 py-4">
    <form
      class="flex flex-col gap-4 w-full max-w-2xl mx-auto"
      @submit.prevent="$emit('submit')"
    >
      <!-- Title -->
      <div v-show="!readOnly || itemDetails.title">
        <ShadcnLabel>{{ t("item.title") }}</ShadcnLabel>
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
        <ShadcnLabel>{{ t("item.username") }}</ShadcnLabel>
        <HaexInput
          v-model.trim="itemDetails.username"
          :placeholder="t('item.username')"
          :readonly="readOnly"
          @keyup.enter="$emit('submit')"
        />
      </div>

      <!-- Password -->
      <div v-if="!readOnly || itemDetails.password">
        <ShadcnLabel>{{ t("item.password") }}</ShadcnLabel>
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
        v-model:digits="itemDetails.otpDigits"
        v-model:period="itemDetails.otpPeriod"
        v-model:algorithm="itemDetails.otpAlgorithm"
        :readonly="readOnly"
        @submit="$emit('submit')"
      />

      <!-- Tags -->
      <div v-show="!readOnly || tags.length">
        <ShadcnLabel>{{ t("item.tags.label") }}</ShadcnLabel>
        <HaexInputTags
          v-if="!readOnly"
          v-model="tags"
          :placeholder="t('item.tags.placeholder')"
          class="mt-1"
        />
        <div v-else class="flex flex-wrap gap-2 mt-1">
          <ShadcnBadge
            v-for="(tag, index) in tags"
            :key="index"
            variant="secondary"
          >
            {{ tag }}
          </ShadcnBadge>
        </div>
      </div>

      <!-- Note -->
      <HaexInputNote
        v-show="!readOnly || itemDetails.note"
        v-model="itemDetails.note"
        :readonly="readOnly"
        @keyup.enter.stop
      />

      <!-- Expiry Date -->
      <div v-show="!readOnly || itemDetails.expiresAt">
        <ShadcnLabel :class="{ 'text-destructive': isExpired }">
          {{ t("item.expiresAt") }}
          <span v-if="isExpired" class="ml-2 text-xs">{{
            t("item.expired")
          }}</span>
          <span v-else-if="isExpiringSoon" class="ml-2 text-xs text-warning">{{
            t("item.expiringSoon")
          }}</span>
        </ShadcnLabel>
        <ShadcnDatePicker
          v-if="!readOnly"
          v-model="itemDetails.expiresAt"
          :placeholder="t('item.addExpiryDate')"
          :class="{
            'border-destructive': isExpired,
            'border-warning': isExpiringSoon && !isExpired,
          }"
          :locale="locale"
        />
        <div v-else-if="itemDetails.expiresAt" class="text-sm">
          {{ formattedExpiryDate }}
        </div>
      </div>

      <!-- Icon & Color -->
      <div
        v-show="!readOnly || itemDetails.icon || itemDetails.color"
        class="flex flex-col sm:flex-row items-stretch gap-4"
      >
        <HaexSelectIcon
          v-model="itemDetails.icon"
          :color="itemDetails.color"
          :label="t('item.icon')"
          :read-only="readOnly"
          default-icon="key"
          class="flex-1"
        />
        <HaexSelectColor
          v-model="itemDetails.color"
          :label="t('item.color')"
          :read-only="readOnly"
          class="flex-1"
        />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onStartTyping } from "@vueuse/core";
import type { SelectHaexPasswordsItemDetails } from "~/database";

const props = defineProps<{
  defaultIcon?: string | null;
  readOnly?: boolean;
  withCopyButton?: boolean;
}>();

defineEmits(["submit"]);
const { t, locale } = useI18n();

const itemDetails = defineModel<SelectHaexPasswordsItemDetails>({
  required: true,
});

// Tags using normalized tag store (tag names as strings)
const tags = defineModel<string[]>("tags", { default: () => [] });

const titleRef = useTemplateRef<{ focus: () => void }>("titleRef");

const focus = () => titleRef.value?.focus();
onMounted(() => {
  nextTick(() => {
    focus();
  });
});

onStartTyping(() => {
  focus();
});

watch(
  () => props.readOnly,
  () => focus()
);
const onFaviconFetched = (iconName: string) => {
  itemDetails.value.icon = iconName;
};

// Format expiry date for read-only display
const formattedExpiryDate = computed(() => {
  if (!itemDetails.value.expiresAt) return "";
  const date = new Date(itemDetails.value.expiresAt);
  return date.toLocaleDateString(locale.value, { dateStyle: "long" });
});

// Expiry date computed properties
const isExpired = computed(() => {
  if (!itemDetails.value.expiresAt) return false;
  const expiryDate = new Date(itemDetails.value.expiresAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiryDate < today;
});

const isExpiringSoon = computed(() => {
  if (!itemDetails.value.expiresAt || isExpired.value) return false;
  const expiryDate = new Date(itemDetails.value.expiresAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilExpiry = Math.ceil(
    (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysUntilExpiry <= 30; // Warn 30 days before expiry
});
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
    expiresAt: Ablaufdatum
    addExpiryDate: Ablaufdatum hinzufügen
    expired: "(abgelaufen)"
    expiringSoon: "(läuft bald ab)"

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
    expiresAt: Expiry date
    addExpiryDate: Add expiry date
    expired: "(expired)"
    expiringSoon: "(expiring soon)"
</i18n>
