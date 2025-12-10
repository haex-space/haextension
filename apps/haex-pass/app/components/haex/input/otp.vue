<template>
  <div class="space-y-2">
    <UiLabel>{{ t("label") }}</UiLabel>
    <UiInputGroup>
      <UiInputGroupInput
        v-model="model"
        type="text"
        :placeholder="t('label')"
        :readonly="readonly"
        @keyup.enter="$emit('submit')"
      />
      <UiInputGroupButton
        :icon="secretCopied ? Check : Copy"
        :tooltip="secretCopied ? t('copied') : t('copySecret')"
        variant="ghost"
        @click.prevent="copySecret"
      />
    </UiInputGroup>

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

const props = withDefaults(defineProps<{
  readonly?: boolean;
  digits?: number | null;
  period?: number | null;
  algorithm?: string | null;
}>(), {
  digits: 6,
  period: 30,
  algorithm: 'SHA1',
});

defineEmits(["submit"]);

const { t } = useI18n();
const { copy, copied } = useClipboard();
const { copy: copySecretFn, copied: secretCopied } = useClipboard();

const totpCode = ref<string>("");
const remainingSeconds = ref<number>(30);

// Computed values with defaults
const effectiveDigits = computed(() => props.digits ?? 6);
const effectivePeriod = computed(() => props.period ?? 30);
const effectiveAlgorithm = computed(() => props.algorithm ?? 'SHA1');

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
  remainingSeconds.value = effectivePeriod.value - (now % effectivePeriod.value);
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

en:
  label: OTP Secret
  currentCode: Current code
  copySecret: Copy secret
  copyCode: Copy code
  copied: Copied!
</i18n>
