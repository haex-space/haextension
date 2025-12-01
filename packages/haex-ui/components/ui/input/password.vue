<template>
  <ShadcnInputGroup>
    <ShadcnInputGroupInput
      v-model="model"
      :type="showPassword ? 'text' : 'password'"
      v-bind="$attrs"
    />
    <ShadcnInputGroupButton
      :icon="showPassword ? EyeOff : Eye"
      :tooltip="showPassword ? t('hide') : t('show')"
      variant="ghost"
      @click.prevent="showPassword = !showPassword"
    />
    <ShadcnInputGroupButton
      v-if="copyable"
      :icon="copied ? Check : Copy"
      :tooltip="copied ? t('copied') : t('copy')"
      variant="ghost"
      @click.prevent="handleCopy"
    />
  </ShadcnInputGroup>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { Eye, EyeOff, Copy, Check } from "lucide-vue-next";

defineProps<{
  copyable?: boolean;
}>();

const model = defineModel<string | null>();

const { t } = useI18n();
const showPassword = ref(false);
const { copy, copied } = useClipboard();

const handleCopy = async () => {
  if (model.value) {
    await copy(model.value);
  }
};
</script>

<i18n lang="yaml">
de:
  show: Passwort anzeigen
  hide: Passwort verbergen
  copy: Kopieren
  copied: Kopiert!

en:
  show: Show password
  hide: Hide password
  copy: Copy
  copied: Copied!
</i18n>
