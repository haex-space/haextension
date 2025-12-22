<template>
  <div>
    <HaexInput
      v-model="model"
      :type="showPassword ? 'text' : 'password'"
      v-bind="$attrs"
    >
      <template #append>
        <UiButton
          v-if="!readOnly"
          :icon="Dices"
          :tooltip="t('generateQuick')"
          variant="ghost"
          @click.prevent="generateQuickPasswordAsync"
        />
        <UiButton
          v-if="!readOnly"
          :icon="KeyRound"
          :tooltip="t('generateAdvanced')"
          variant="ghost"
          @click.prevent="drawerOpen = true"
        />
        <UiButton
          :icon="showPassword ? EyeOff : Eye"
          :tooltip="showPassword ? t('hide') : t('show')"
          variant="ghost"
          @click.prevent="showPassword = !showPassword"
        />
      </template>
    </HaexInput>

    <HaexDrawerPasswordGenerator v-model="model" v-model:open="drawerOpen" />
  </div>
</template>

<script setup lang="ts">
import { Eye, EyeOff, KeyRound, Dices } from "lucide-vue-next";

const {
  passwordConfig = {
    excludeChars: "",
    length: 16,
    lowercase: true,
    numbers: true,
    pattern: "",
    symbols: true,
    uppercase: true,
    usePattern: false,
  },
} = defineProps<{
  readOnly?: boolean;
  passwordConfig?: IPasswordConfig;
}>();

const model = defineModel<string | null>();

const { t } = useI18n();
const showPassword = ref(false);
const drawerOpen = ref(false);

const { generate } = usePasswordGenerator();
const { getDefaultPresetAsync } = usePasswordGeneratorPresets();

const generateQuickPasswordAsync = async () => {
  const preset: IPasswordConfig =
    (await getDefaultPresetAsync()) ?? passwordConfig;
  model.value = generate(preset);
};
// Helper function to get a random character from a string
</script>

<i18n lang="yaml">
de:
  generateQuick: Schnelles Passwort generieren
  generateAdvanced: Passwort-Generator öffnen
  show: Passwort anzeigen
  hide: Passwort verbergen
  copy: Kopieren
  copied: Kopiert!

en:
  generateQuick: Generate quick password
  generateAdvanced: Open password generator
  show: Show password
  hide: Hide password
  copy: Copy
  copied: Copied!
</i18n>
