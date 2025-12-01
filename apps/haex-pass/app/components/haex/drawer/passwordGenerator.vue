<template>
  <UiDrawer v-model:open="isOpen">
    <UiDrawerContent>
      <UiDrawerHeader>
        <UiDrawerTitle>{{ t("title") }}</UiDrawerTitle>
      </UiDrawerHeader>

      <div class="p-4 space-y-4 overflow-y-auto">
        <!-- Preset Selector -->
        <div v-if="presets.length > 0" class="space-y-2">
          <UiLabel>{{ t("loadPreset") }}</UiLabel>
          <UiSelect v-model="selectedPresetId" @update:model-value="loadPresetAsync">
            <UiSelectTrigger>
              <UiSelectValue :placeholder="t('selectPreset')" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem
                v-for="preset in presets"
                :key="preset.id"
                :value="preset.id"
              >
                {{ preset.name }}
                <span v-if="preset.isDefault" class="ml-2 text-xs opacity-60">
                  ({{ t("default") }})
                </span>
              </UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>

        <!-- Generated Password Display -->
        <div class="space-y-2">
          <UiLabel>{{ t("generatedPassword") }}</UiLabel>
          <UiInputGroup>
            <UiInputGroupInput
              v-model="generatedPassword"
              :readonly="true"
              class="font-mono"
            />
            <UiInputGroupButton
              :icon="RefreshCw"
              variant="ghost"
              @click.prevent="generatePasswordAsync"
            />
            <UiInputGroupButton
              :icon="copied ? Check : Copy"
              variant="ghost"
              @click.prevent="copyPasswordAsync"
            />
          </UiInputGroup>
        </div>

        <!-- Password Length -->
        <div class="space-y-2">
          <UiLabel> {{ t("length") }}: {{ passwordLength }} </UiLabel>
          <UiSlider
            v-model="passwordLengthArray"
            :min="4"
            :max="128"
            @update:model-value="generatePasswordAsync"
          />
        </div>

        <!-- Character Types -->
        <div class="space-y-2">
          <UiLabel>{{ t("characterTypes") }}</UiLabel>
          <div class="flex gap-2 flex-wrap">
            <UiButton
              :variant="options.uppercase ? 'default' : 'outline'"
              size="sm"
              @click="toggleOption('uppercase')"
            >
              A-Z
            </UiButton>

            <UiButton
              :variant="options.lowercase ? 'default' : 'outline'"
              size="sm"
              @click="toggleOption('lowercase')"
            >
              a-z
            </UiButton>

            <UiButton
              :variant="options.numbers ? 'default' : 'outline'"
              size="sm"
              @click="toggleOption('numbers')"
            >
              0-9
            </UiButton>

            <UiButton
              :variant="options.symbols ? 'default' : 'outline'"
              size="sm"
              @click="toggleOption('symbols')"
            >
              !@#
            </UiButton>
          </div>
        </div>

        <!-- Exclude Characters -->
        <div class="space-y-2">
          <UiLabel>{{ t("excludeChars") }}</UiLabel>
          <UiInput
            v-model="options.excludeChars"
            :placeholder="t('excludeCharsPlaceholder')"
            @change="generatePasswordAsync"
          />
        </div>

        <!-- Pattern Mode -->
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <UiCheckbox id="use-pattern" v-model="usePattern" />
            <UiLabel for="use-pattern" class="cursor-pointer">
              {{ t("usePattern") }}
            </UiLabel>
            <UiPopover>
              <UiPopoverTrigger as-child>
                <UiButton :icon="Info" size="icon-sm" variant="ghost" />
              </UiPopoverTrigger>
              <UiPopoverContent class="w-96">
                <div class="space-y-2">
                  <h4 class="font-semibold">
                    {{ t("patternHelpTitle") }}
                  </h4>
                  <ul class="text-sm space-y-1">
                    <li>
                      <code class="bg-muted px-1 py-0.5 rounded">c</code>
                      = {{ t("patternHelp.c") }}
                    </li>
                    <li>
                      <code class="bg-muted px-1 py-0.5 rounded">C</code>
                      = {{ t("patternHelp.C") }}
                    </li>
                    <li>
                      <code class="bg-muted px-1 py-0.5 rounded">v</code>
                      = {{ t("patternHelp.v") }}
                    </li>
                    <li>
                      <code class="bg-muted px-1 py-0.5 rounded">V</code>
                      = {{ t("patternHelp.V") }}
                    </li>
                    <li>
                      <code class="bg-muted px-1 py-0.5 rounded">d</code>
                      = {{ t("patternHelp.d") }}
                    </li>
                    <li>
                      <code class="bg-muted px-1 py-0.5 rounded">a</code>
                      = {{ t("patternHelp.a") }}
                    </li>
                    <li>
                      <code class="bg-muted px-1 py-0.5 rounded">A</code>
                      = {{ t("patternHelp.A") }}
                    </li>
                    <li>
                      <code class="bg-muted px-1 py-0.5 rounded">s</code>
                      = {{ t("patternHelp.s") }}
                    </li>
                    <li>{{ t("patternHelp.other") }}</li>
                  </ul>
                </div>
              </UiPopoverContent>
            </UiPopover>
          </div>
        </div>

        <!-- Pattern Input -->
        <div v-if="usePattern" class="space-y-2">
          <UiLabel>{{ t("pattern") }}</UiLabel>
          <UiInput
            v-model="pattern"
            :placeholder="t('patternPlaceholder')"
            @input="generatePasswordAsync"
          />
        </div>

        <!-- Save Preset Section -->
        <div class="space-y-2 pt-4 border-t">
          <UiLabel>{{ t("saveAsPreset") }}</UiLabel>
          <UiInput
            v-model="presetName"
            :placeholder="t('presetNamePlaceholder')"
          />
          <div class="flex items-center gap-2">
            <UiCheckbox id="set-as-default" v-model="setAsDefault" />
            <UiLabel for="set-as-default" class="cursor-pointer">
              {{ t("setAsDefault") }}
            </UiLabel>
          </div>
          <UiButton
            :icon="Save"
            variant="outline"
            class="w-full"
            :disabled="!presetName.trim()"
            @click="savePresetAsync"
          >
            {{ t("savePreset") }}
          </UiButton>
        </div>
      </div>

      <UiDrawerFooter>
        <UiButton @click="usePasswordAsync">
          {{ t("use") }}
        </UiButton>
        <UiButton variant="outline" @click="isOpen = false">
          {{ t("cancel") }}
        </UiButton>
      </UiDrawerFooter>
    </UiDrawerContent>
  </UiDrawer>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { RefreshCw, Copy, Check, Info, Save } from "lucide-vue-next";

const value = defineModel<string | null>();
const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const { copy, copied } = useClipboard();
const {
  getAllPresetsAsync,
  getDefaultPresetAsync,
  createPresetAsync,
  setDefaultPresetAsync,
} = usePasswordGeneratorPresets();

const options = reactive({
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeChars: "",
});

const usePattern = ref(false);
const pattern = ref<string>("cvcv-cvcv-cvcv");
const generatedPassword = ref<string>("");

const presets = ref<Awaited<ReturnType<typeof getAllPresetsAsync>>>([]);
const selectedPresetId = ref<string | null>(null);
const presetName = ref<string>("");
const setAsDefault = ref<boolean>(false);

// Slider needs array value
const passwordLengthArray = computed({
  get: () => [options.length],
  set: (val: number[]) => {
    options.length = val[0] ?? 16;
  },
});

const passwordLength = computed(() => options.length);

// Toggle option and regenerate password
const toggleOption = (
  option: "uppercase" | "lowercase" | "numbers" | "symbols"
) => {
  options[option] = !options[option];
  generatePasswordAsync();
};

// Helper function to get a random character from a string
const getRandomChar = (charset: string): string => {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const randomValue = array[0] ?? 0;
  const index = randomValue % charset.length;
  return charset.charAt(index);
};

const generatePasswordAsync = async () => {
  // Pattern-based generation
  if (usePattern.value && pattern.value) {
    const result: string[] = [];
    const patternChars = pattern.value.split("");

    for (const char of patternChars) {
      if (char === "c") {
        // consonant
        result.push(getRandomChar("bcdfghjklmnpqrstvwxyz"));
      } else if (char === "C") {
        // uppercase consonant
        result.push(getRandomChar("BCDFGHJKLMNPQRSTVWXYZ"));
      } else if (char === "v") {
        // vowel
        result.push(getRandomChar("aeiou"));
      } else if (char === "V") {
        // uppercase vowel
        result.push(getRandomChar("AEIOU"));
      } else if (char === "d") {
        // digit
        result.push(getRandomChar("0123456789"));
      } else if (char === "a") {
        // any lowercase letter
        result.push(getRandomChar("abcdefghijklmnopqrstuvwxyz"));
      } else if (char === "A") {
        // any uppercase letter
        result.push(getRandomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
      } else if (char === "s") {
        // special character / symbol
        result.push(getRandomChar("!@#$%^&*()_+-=[]{}|;:,.<>?"));
      } else {
        // literal character
        result.push(char);
      }
    }

    generatedPassword.value = result.join("");
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
    generatedPassword.value = "";
    return;
  }

  // Generate password using crypto.getRandomValues for better randomness
  const array = new Uint32Array(options.length);
  crypto.getRandomValues(array);

  generatedPassword.value = Array.from(array)
    .map((x) => chars[x % chars.length])
    .join("");
};

const copyPasswordAsync = async () => {
  await copy(generatedPassword.value);
};

const usePasswordAsync = async () => {
  value.value = generatedPassword.value;
  isOpen.value = false;
};

// Regenerate password when pattern changes
watch(pattern, () => {
  if (usePattern.value && pattern.value) {
    generatePasswordAsync();
  }
});

// Regenerate password when pattern mode is toggled
watch(usePattern, () => {
  generatePasswordAsync();
});

// Load presets when drawer opens
const loadPresetsAsync = async () => {
  presets.value = await getAllPresetsAsync();
};

// Load preset into options
const loadPresetAsync = async (id: string) => {
  const preset = presets.value.find((p) => p.id === id);
  if (!preset) return;

  options.length = preset.length;
  options.uppercase = preset.uppercase;
  options.lowercase = preset.lowercase;
  options.numbers = preset.numbers;
  options.symbols = preset.symbols;
  options.excludeChars = preset.excludeChars ?? "";
  usePattern.value = preset.usePattern;
  pattern.value = preset.pattern ?? "";

  selectedPresetId.value = id;
  await generatePasswordAsync();
};

// Save current settings as preset
const savePresetAsync = async () => {
  if (!presetName.value.trim()) return;

  await createPresetAsync({
    name: presetName.value.trim(),
    length: options.length,
    uppercase: options.uppercase,
    lowercase: options.lowercase,
    numbers: options.numbers,
    symbols: options.symbols,
    excludeChars: options.excludeChars,
    usePattern: usePattern.value,
    pattern: pattern.value,
    isDefault: setAsDefault.value,
  });

  presetName.value = "";
  setAsDefault.value = false;
  await loadPresetsAsync();
};

// Load default preset when drawer opens
watch(isOpen, async (newValue) => {
  if (newValue) {
    await loadPresetsAsync();

    // Try to load default preset
    const defaultPreset = await getDefaultPresetAsync();
    if (defaultPreset) {
      await loadPresetAsync(defaultPreset.id);
    } else {
      await generatePasswordAsync();
    }
  }
});
</script>

<i18n lang="yaml">
de:
  title: Passwort generieren
  generatedPassword: Generiertes Passwort
  copy: Kopieren
  regenerate: Neu generieren
  length: Länge
  characterTypes: Zeichentypen
  uppercase: Großbuchstaben (A-Z)
  lowercase: Kleinbuchstaben (a-z)
  numbers: Zahlen (0-9)
  symbols: Sonderzeichen
  excludeChars: Zeichen ausschließen
  excludeCharsPlaceholder: z.B. äöü
  usePattern: Pattern-Modus verwenden
  pattern: Pattern
  patternPlaceholder: z.B. ccvc-ccvc-ccvc
  patternHelpTitle: Pattern-Zeichen
  patternHelp:
    c: "Kleinbuchstaben-Konsonant (b, d, f, g...)"
    C: "Großbuchstaben-Konsonant (B, D, F, G...)"
    v: "Kleinbuchstaben-Vokal (a, e, i, o, u)"
    V: "Großbuchstaben-Vokal (A, E, I, O, U)"
    d: "Ziffer (0-9)"
    a: "beliebiger Kleinbuchstabe"
    A: "beliebiger Großbuchstabe"
    s: "Sonderzeichen (!#$%^&*...)"
    other: "Andere Zeichen = Trennzeichen (-, _, ., etc.)"
  loadPreset: Preset laden
  selectPreset: Preset auswählen
  default: Standard
  saveAsPreset: Als Preset speichern
  presetNamePlaceholder: Name des Presets
  setAsDefault: Als Standard setzen
  savePreset: Preset speichern
  cancel: Abbrechen
  use: Verwenden
  copied: Passwort kopiert
  passwordSet: Passwort übernommen

en:
  title: Generate Password
  generatedPassword: Generated Password
  copy: Copy
  regenerate: Regenerate
  length: Length
  characterTypes: Character Types
  uppercase: Uppercase (A-Z)
  lowercase: Lowercase (a-z)
  numbers: Numbers (0-9)
  symbols: Special Characters
  excludeChars: Exclude Characters
  excludeCharsPlaceholder: e.g. äöü
  usePattern: Use pattern mode
  pattern: Pattern
  patternPlaceholder: e.g. ccvc-ccvc-ccvc
  patternHelpTitle: Pattern characters
  patternHelp:
    c: "lowercase consonant (b, d, f, g...)"
    C: "uppercase consonant (B, D, F, G...)"
    v: "lowercase vowel (a, e, i, o, u)"
    V: "uppercase vowel (A, E, I, O, U)"
    d: "digit (0-9)"
    a: "any lowercase letter"
    A: "any uppercase letter"
    s: "special character (!#$%^&*...)"
    other: "Other characters = separators (-, _, ., etc.)"
  loadPreset: Load Preset
  selectPreset: Select preset
  default: Default
  saveAsPreset: Save as Preset
  presetNamePlaceholder: Preset name
  setAsDefault: Set as default
  savePreset: Save Preset
  cancel: Cancel
  use: Use
  copied: Password copied
  passwordSet: Password applied
</i18n>
