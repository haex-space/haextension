<template>
  <div>
    <UiInputGroup>
      <UiInputGroupInput
        v-model="model"
        :type="showPassword ? 'text' : 'password'"
        v-bind="$attrs"
      />
      <UiInputGroupButton
        v-if="!readOnly"
        :icon="Dices"
        :tooltip="t('generateQuick')"
        variant="ghost"
        @click.prevent="generateQuickPasswordAsync"
      />
      <UiInputGroupButton
        v-if="!readOnly"
        :icon="KeyRound"
        :tooltip="t('generateAdvanced')"
        variant="ghost"
        @click.prevent="drawerOpen = true"
      />
      <UiInputGroupButton
        :icon="showPassword ? EyeOff : Eye"
        :tooltip="showPassword ? t('hide') : t('show')"
        variant="ghost"
        @click.prevent="showPassword = !showPassword"
      />
      <UiInputGroupButton
        :icon="copied ? Check : Copy"
        :tooltip="copied ? t('copied') : t('copy')"
        variant="ghost"
        @click.prevent="handleCopy"
      />
    </UiInputGroup>

    <HaexDrawerPasswordGenerator
      v-model="model"
      v-model:open="drawerOpen"
    />
  </div>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { Eye, EyeOff, Copy, Check, KeyRound, Dices } from "lucide-vue-next";

defineProps<{
  readOnly?: boolean;
}>();

const model = defineModel<string | null>();

const { t } = useI18n();
const showPassword = ref(false);
const drawerOpen = ref(false);
const { copy, copied } = useClipboard();
const { getDefaultPresetAsync } = usePasswordGeneratorPresets();

const handleCopy = async () => {
  if (model.value) {
    // Resolve KeePass-style references before copying
    const { resolveReferenceAsync } = useGroupItemsCloneStore();
    const resolvedValue = await resolveReferenceAsync(model.value);
    await copy(resolvedValue || model.value);
  }
};

// Helper function to get a random character from a string
const getRandomChar = (charset: string): string => {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const randomValue = array[0] ?? 0;
  const index = randomValue % charset.length;
  return charset.charAt(index);
};

// Generate password with default preset settings
const generateQuickPasswordAsync = async () => {
  const defaultPreset = await getDefaultPresetAsync();

  // Use default preset if available, otherwise use hardcoded defaults
  const options = defaultPreset
    ? {
        length: defaultPreset.length,
        uppercase: defaultPreset.uppercase,
        lowercase: defaultPreset.lowercase,
        numbers: defaultPreset.numbers,
        symbols: defaultPreset.symbols,
        excludeChars: defaultPreset.excludeChars ?? "",
        usePattern: defaultPreset.usePattern,
        pattern: defaultPreset.pattern ?? "",
      }
    : {
        length: 16,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
        excludeChars: "",
        usePattern: false,
        pattern: "",
      };

  // Pattern-based generation
  if (options.usePattern && options.pattern) {
    const result: string[] = [];
    const patternChars = options.pattern.split("");

    for (const char of patternChars) {
      if (char === "c") {
        result.push(getRandomChar("bcdfghjklmnpqrstvwxyz"));
      } else if (char === "C") {
        result.push(getRandomChar("BCDFGHJKLMNPQRSTVWXYZ"));
      } else if (char === "v") {
        result.push(getRandomChar("aeiou"));
      } else if (char === "V") {
        result.push(getRandomChar("AEIOU"));
      } else if (char === "d") {
        result.push(getRandomChar("0123456789"));
      } else if (char === "a") {
        result.push(getRandomChar("abcdefghijklmnopqrstuvwxyz"));
      } else if (char === "A") {
        result.push(getRandomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
      } else if (char === "s") {
        result.push(getRandomChar("!@#$%^&*()_+-=[]{}|;:,.<>?"));
      } else {
        result.push(char);
      }
    }

    model.value = result.join("");
    return;
  }

  // Standard character-based generation
  const charset = {
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    numbers: "0123456789",
    symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
  };

  let chars = "";
  if (options.uppercase) chars += charset.uppercase;
  if (options.lowercase) chars += charset.lowercase;
  if (options.numbers) chars += charset.numbers;
  if (options.symbols) chars += charset.symbols;

  // Remove excluded characters
  if (options.excludeChars) {
    const excludeSet = new Set(options.excludeChars.split(""));
    chars = chars
      .split("")
      .filter((c) => !excludeSet.has(c))
      .join("");
  }

  if (!chars) {
    model.value = "";
    return;
  }

  // Generate password using crypto.getRandomValues for better randomness
  const array = new Uint32Array(options.length);
  crypto.getRandomValues(array);

  model.value = Array.from(array)
    .map((x) => chars[x % chars.length])
    .join("");
};
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
