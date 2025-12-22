<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('title')">
    <template #content>
      <div class="space-y-4">
        <!-- Preset Selector -->
        <div v-if="presets.length > 0" class="space-y-2">
          <ShadcnLabel>{{ t("loadPreset") }}</ShadcnLabel>
          <ShadcnSelect
            v-model="selectedPresetId"
            @update:model-value="loadPresetAsync"
          >
            <ShadcnSelectTrigger>
              <ShadcnSelectValue :placeholder="t('selectPreset')" />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem
                v-for="preset in presets"
                :key="preset.id"
                :value="preset.id"
              >
                {{ preset.name }}
                <span v-if="preset.isDefault" class="ml-2 text-xs opacity-60">
                  ({{ t("default") }})
                </span>
              </ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

        <!-- Generated Password Display -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("generatedPassword") }}</ShadcnLabel>
          <ShadcnInputGroup>
            <ShadcnInputGroupInput
              v-model="generatedPassword"
              :readonly="true"
              class="font-mono"
            />
            <ShadcnInputGroupButton
              :icon="RefreshCw"
              variant="ghost"
              @click.prevent="generatePasswordAsync"
            />
            <ShadcnInputGroupButton
              :icon="copied ? Check : Copy"
              variant="ghost"
              @click.prevent="copyPasswordAsync"
            />
          </ShadcnInputGroup>
        </div>

        <!-- Password Length -->
        <div class="space-y-2">
          <ShadcnLabel> {{ t("length") }}: {{ passwordLength }} </ShadcnLabel>
          <ShadcnSlider
            v-model="passwordLengthArray"
            :min="4"
            :max="128"
            @update:model-value="generatePasswordAsync"
          />
        </div>

        <!-- Character Types -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("characterTypes") }}</ShadcnLabel>
          <div class="flex gap-2 flex-wrap">
            <UiButton
              :variant="options.uppercase ? 'default' : 'outline'"
              @click="toggleOption('uppercase')"
            >
              A-Z
            </UiButton>

            <UiButton
              :variant="options.lowercase ? 'default' : 'outline'"
              @click="toggleOption('lowercase')"
            >
              a-z
            </UiButton>

            <UiButton
              :variant="options.numbers ? 'default' : 'outline'"
              @click="toggleOption('numbers')"
            >
              0-9
            </UiButton>

            <UiButton
              :variant="options.symbols ? 'default' : 'outline'"
              @click="toggleOption('symbols')"
            >
              !@#
            </UiButton>
          </div>
        </div>

        <!-- Exclude Characters -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("excludeChars") }}</ShadcnLabel>
          <ShadcnInput
            v-model="options.excludeChars"
            :placeholder="t('excludeCharsPlaceholder')"
            @change="generatePasswordAsync"
          />
        </div>

        <!-- Pattern Mode -->
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <ShadcnCheckbox id="use-pattern" v-model="usePattern" />
            <ShadcnLabel for="use-pattern" class="cursor-pointer">
              {{ t("usePattern") }}
            </ShadcnLabel>
            <ShadcnPopover>
              <ShadcnPopoverTrigger as-child>
                <UiButton :icon="Info" size="icon" variant="ghost" />
              </ShadcnPopoverTrigger>
              <ShadcnPopoverContent class="w-96">
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
              </ShadcnPopoverContent>
            </ShadcnPopover>
          </div>
        </div>

        <!-- Pattern Input -->
        <div v-if="usePattern" class="space-y-2">
          <ShadcnLabel>{{ t("pattern") }}</ShadcnLabel>
          <ShadcnInput
            v-model="pattern"
            :placeholder="t('patternPlaceholder')"
            @input="generatePasswordAsync"
          />
        </div>

        <!-- Save Preset Section -->
        <div class="space-y-2 pt-4 border-t">
          <ShadcnLabel>{{ t("saveAsPreset") }}</ShadcnLabel>
          <ShadcnInput
            v-model="presetName"
            :placeholder="t('presetNamePlaceholder')"
          />
          <div class="flex items-center gap-2">
            <ShadcnCheckbox id="set-as-default" v-model="setAsDefault" />
            <ShadcnLabel for="set-as-default" class="cursor-pointer">
              {{ t("setAsDefault") }}
            </ShadcnLabel>
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
    </template>

    <template #footer>
      <UiButton variant="outline" @click="isOpen = false">
        {{ t("cancel") }}
      </UiButton>

      <UiButton @click="usePasswordAsync">
        {{ t("use") }}
      </UiButton>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { RefreshCw, Copy, Check, Info, Save } from "lucide-vue-next";

const value = defineModel<string | null>();
const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const { copy, copied } = useClipboard();
const { getAllPresetsAsync, getDefaultPresetAsync, createPresetAsync } =
  usePasswordGeneratorPresets();

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

const { generate } = usePasswordGenerator();
// Toggle option and regenerate password
const toggleOption = (
  option: "uppercase" | "lowercase" | "numbers" | "symbols"
) => {
  options[option] = !options[option];
  generatePasswordAsync();
};

const generatePasswordAsync = async () => {
  generatedPassword.value = generate({
    excludeChars: options.excludeChars,
    length: options.length,
    lowercase: options.lowercase,
    numbers: options.numbers,
    pattern: pattern.value,
    symbols: options.symbols,
    uppercase: options.uppercase,
    usePattern: usePattern.value,
  });
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
const loadPresetAsync = async (id: unknown) => {
  if (typeof id !== "string") return;
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
