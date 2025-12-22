<template>
  <div class="space-y-2">
    <ShadcnLabel>{{ t("label") }}</ShadcnLabel>

    <UiInput
      v-model="model"
      type="text"
      :placeholder="t('label')"
      :readonly="readonly"
      @keyup.enter="$emit('submit')"
    >
      <template #append>
        <UiButton
          :icon="secretCopied ? Check : Copy"
          :tooltip="secretCopied ? t('copied') : t('copySecret')"
          variant="ghost"
          @click.prevent="copySecret"
        />
      </template>
    </UiInput>

    <!-- OTP Settings (only show when there's a secret and not readonly) -->
    <div v-if="model && !readonly" class="grid grid-cols-3 gap-2">
      <!-- Algorithm -->
      <div>
        <ShadcnLabel class="text-xs text-muted-foreground">
          {{ t("algorithm") }}
        </ShadcnLabel>
        <ShadcnSelect v-model="algorithmModel">
          <ShadcnSelectTrigger class="h-8 text-xs">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem value="SHA1">SHA1</ShadcnSelectItem>
            <ShadcnSelectItem value="SHA256">SHA256</ShadcnSelectItem>
            <ShadcnSelectItem value="SHA512">SHA512</ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </div>
      <!-- Digits -->
      <div>
        <ShadcnLabel class="text-xs text-muted-foreground">
          {{ t("digits") }}
        </ShadcnLabel>
        <ShadcnSelect v-model="digitsModel">
          <ShadcnSelectTrigger class="h-8 text-xs">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem value="6">6</ShadcnSelectItem>
            <ShadcnSelectItem value="7">7</ShadcnSelectItem>
            <ShadcnSelectItem value="8">8</ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </div>
      <!-- Period -->
      <div>
        <ShadcnLabel class="text-xs text-muted-foreground">
          {{ t("period") }}
        </ShadcnLabel>
        <ShadcnSelect v-model="periodModel">
          <ShadcnSelectTrigger class="h-8 text-xs">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem value="30">30s</ShadcnSelectItem>
            <ShadcnSelectItem value="60">60s</ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </div>
    </div>

    <!-- OTP Code Display (only when there's a secret) -->
    <div
      v-if="model && totpCode"
      class="flex items-center gap-2 p-3 bg-muted rounded-lg"
    >
      <div class="flex-1">
        <div class="text-xs text-muted-foreground mb-1">
          {{ t("currentCode") }}
        </div>
        <div class="font-mono text-2xl font-bold tracking-wider">
          {{ formattedCode }}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="relative w-10 h-10">
          <svg class="transform -rotate-90 w-10 h-10">
            <circle
              cx="20"
              cy="20"
              r="16"
              stroke="currentColor"
              stroke-width="3"
              fill="none"
              class="text-muted-foreground opacity-20"
            />
            <circle
              cx="20"
              cy="20"
              r="16"
              stroke="currentColor"
              stroke-width="3"
              fill="none"
              class="text-primary transition-all duration-1000"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="dashOffset"
            />
          </svg>
          <div
            class="absolute inset-0 flex items-center justify-center text-xs font-medium"
          >
            {{ remainingSeconds }}
          </div>
        </div>
        <UiButton
          type="button"
          :icon="copied ? Check : Copy"
          :tooltip="copied ? t('copied') : t('copyCode')"
          size="icon"
          variant="ghost"
          @click="copyCode"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { TOTP } from "otpauth";
import { useClipboard } from "@vueuse/core";
import { Copy, Check } from "lucide-vue-next";

const model = defineModel<string | null>();
const digits = defineModel<number | null>("digits");
const period = defineModel<number | null>("period");
const algorithm = defineModel<string | null>("algorithm");

defineProps<{
  readonly?: boolean;
}>();

defineEmits(["submit"]);

const { t } = useI18n();
const { copy, copied } = useClipboard();
const { copy: copySecretFn, copied: secretCopied } = useClipboard();

const totpCode = ref<string>("");
const remainingSeconds = ref<number>(30);

// Computed values with defaults
const effectiveDigits = computed(() => digits.value ?? 6);
const effectivePeriod = computed(() => period.value ?? 30);
const effectiveAlgorithm = computed(() => algorithm.value ?? "SHA1");

// String adapters for UiSelect (converts between number/string)
const digitsModel = computed({
  get: () => String(effectiveDigits.value),
  set: (val) => {
    digits.value = Number(val);
  },
});

const periodModel = computed({
  get: () => String(effectivePeriod.value),
  set: (val) => {
    period.value = Number(val);
  },
});

const algorithmModel = computed({
  get: () => effectiveAlgorithm.value,
  set: (val) => {
    algorithm.value = val;
  },
});

// Circle animation values
const circumference = 2 * Math.PI * 16; // radius = 16
const dashOffset = computed(() => {
  const progress = remainingSeconds.value / effectivePeriod.value;
  return circumference * (1 - progress);
});

// Format code with space in the middle for better readability (e.g. "123 456" for 6 digits, "1234 5678" for 8 digits)
const formattedCode = computed(() => {
  if (!totpCode.value) return "";
  const mid = Math.floor(totpCode.value.length / 2);
  return totpCode.value.slice(0, mid) + " " + totpCode.value.slice(mid);
});

// Generate TOTP code
const generateCodeAsync = async () => {
  if (
    !model.value ||
    typeof model.value !== "string" ||
    model.value.trim() === ""
  ) {
    totpCode.value = "";
    return;
  }

  try {
    const totp = new TOTP({
      secret: model.value.trim(),
      digits: effectiveDigits.value,
      period: effectivePeriod.value,
      algorithm: effectiveAlgorithm.value,
    });
    totpCode.value = totp.generate();
  } catch (error) {
    console.error("Error generating TOTP:", error);
    totpCode.value = "";
  }
};

// Update remaining seconds
const updateRemainingSeconds = () => {
  const now = Math.floor(Date.now() / 1000);
  remainingSeconds.value =
    effectivePeriod.value - (now % effectivePeriod.value);
};

// Copy secret
const copySecret = async () => {
  if (model.value) {
    await copySecretFn(String(model.value));
  }
};

// Copy code
const copyCode = async () => {
  if (totpCode.value) {
    await copy(totpCode.value);
  }
};

// Update code and timer
let intervalId: ReturnType<typeof setInterval> | null = null;

// Watch model and settings for changes
watch(
  [model, effectiveDigits, effectivePeriod, effectiveAlgorithm],
  () => {
    generateCodeAsync();
  },
  { immediate: true }
);

onMounted(() => {
  if (model.value) {
    generateCodeAsync();
  }

  // Update every second
  intervalId = setInterval(() => {
    updateRemainingSeconds();

    // Regenerate code when timer resets (use effectivePeriod)
    if (remainingSeconds.value === effectivePeriod.value) {
      generateCodeAsync();
    }
  }, 1000);

  // Initial update
  updateRemainingSeconds();
});

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId);
  }
});
</script>

<i18n lang="yaml">
de:
  label: OTP Secret
  currentCode: Aktueller Code
  copySecret: Secret kopieren
  copyCode: Code kopieren
  copied: Kopiert!
  algorithm: Algorithmus
  digits: Ziffern
  period: Intervall

en:
  label: OTP Secret
  currentCode: Current code
  copySecret: Copy secret
  copyCode: Copy code
  copied: Copied!
  algorithm: Algorithm
  digits: Digits
  period: Period
</i18n>
