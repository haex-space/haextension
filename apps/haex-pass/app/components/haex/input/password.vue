<template>
  <div>
    <!-- Hidden password mode: normal input -->
    <HaexInput
      v-if="!showPassword"
      v-model="model"
      type="password"
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
          :icon="Eye"
          :tooltip="t('show')"
          variant="ghost"
          @click.prevent="showPassword = true"
        />
      </template>
    </HaexInput>

    <!-- Visible password mode: colored display with editable input -->
    <ShadcnInputGroup
      v-else
      class="group transition-[color,box-shadow] focus-within:border-primary focus-within:ring-primary/50 focus-within:ring-[3px]"
    >
      <!-- Colored password display overlay -->
      <div class="relative flex-1 min-w-0">
        <HaexInputPasswordDisplay
          :model-value="model"
          :placeholder="$attrs.placeholder as string"
          class="absolute inset-0 flex items-center px-3 pointer-events-none z-10"
        />
        <!-- Invisible input for editing -->
        <input
          v-model="model"
          type="text"
          class="w-full h-9 px-3 bg-transparent text-transparent caret-foreground focus:outline-none font-mono text-sm tracking-wide"
          v-bind="$attrs"
        >
      </div>

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
        :icon="EyeOff"
        :tooltip="t('hide')"
        variant="ghost"
        @click.prevent="showPassword = false"
      />
    </ShadcnInputGroup>

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
