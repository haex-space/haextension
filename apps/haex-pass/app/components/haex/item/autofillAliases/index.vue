<template>
  <div class="space-y-4">
    <!-- Standard Fields -->
    <div
      v-for="field in standardFields"
      :key="field.key"
      class="space-y-1"
    >
      <div class="flex items-center gap-2">
        <component
          :is="field.icon"
          class="h-4 w-4 text-muted-foreground"
        />
        <span class="text-sm font-medium">{{ field.label }}</span>
      </div>
      <HaexInputTags
        v-model="fieldAliases[field.key]"
        :placeholder="t('aliasPlaceholder')"
        :disabled="readOnly"
        size="sm"
        @update:model-value="onAliasesChange(field.key, $event)"
      />
    </div>

    <!-- Custom Fields from Key-Value -->
    <div
      v-for="kv in customFields"
      :key="kv.id"
      class="space-y-1"
    >
      <div class="flex items-center gap-2">
        <KeyRound class="h-4 w-4 text-muted-foreground" />
        <span class="text-sm font-medium">{{ kv.key }}</span>
        <ShadcnBadge
          variant="outline"
          class="text-xs"
        >
          {{ t("customField") }}
        </ShadcnBadge>
      </div>
      <HaexInputTags
        v-model="fieldAliases[kv.key || '']"
        :placeholder="t('aliasPlaceholder')"
        :disabled="readOnly"
        size="sm"
        @update:model-value="onAliasesChange(kv.key || '', $event)"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { User, KeyRound, Lock, Timer } from "lucide-vue-next";
import type {
  SelectHaexPasswordsItemDetails,
  SelectHaexPasswordsItemKeyValues,
} from "~/database";

const props = defineProps<{
  readOnly?: boolean;
  keyValues?: SelectHaexPasswordsItemKeyValues[];
}>();

const itemDetails = defineModel<SelectHaexPasswordsItemDetails>({
  required: true,
});

const { t } = useI18n();

// Default aliases for standard fields (will be used if no custom aliases are set)
const DEFAULT_ALIASES: Record<string, string[]> = {
  username: ["email", "login", "user", "e-mail", "mail"],
  password: ["pass", "pwd", "secret"],
  otpSecret: ["otp", "totp", "2fa", "code", "token"],
};

// Standard fields with their metadata
const standardFields = computed(() => [
  {
    key: "username",
    label: t("fields.username"),
    icon: User,
    defaults: DEFAULT_ALIASES.username,
  },
  {
    key: "password",
    label: t("fields.password"),
    icon: Lock,
    defaults: DEFAULT_ALIASES.password,
  },
  {
    key: "otpSecret",
    label: t("fields.otp"),
    icon: Timer,
    defaults: DEFAULT_ALIASES.otpSecret,
  },
]);

// Custom fields from key-value pairs
const customFields = computed(() => {
  return (props.keyValues || []).filter((kv) => kv.key && kv.key.trim() !== "");
});

// Local state for aliases (initialized from itemDetails.autofillAliases)
const fieldAliases = ref<Record<string, string[]>>({});

// Initialize aliases from item details (or defaults if not customized)
const initializeAliases = () => {
  const stored = itemDetails.value.autofillAliases;

  // Start with defaults for standard fields
  fieldAliases.value = {};
  for (const field of standardFields.value) {
    // Use stored aliases if available, otherwise use defaults
    const storedAliases = stored?.[field.key];
    if (storedAliases && storedAliases.length > 0) {
      fieldAliases.value[field.key] = [...storedAliases];
    } else {
      fieldAliases.value[field.key] = field.defaults ? [...field.defaults] : [];
    }
  }

  // Custom fields from key-values (no defaults)
  for (const kv of customFields.value) {
    if (kv.key) {
      const storedAliases = stored?.[kv.key];
      if (storedAliases && storedAliases.length > 0) {
        fieldAliases.value[kv.key] = [...storedAliases];
      } else {
        fieldAliases.value[kv.key] = [];
      }
    }
  }
};

// Initialize on mount and when item changes
watch(
  () => itemDetails.value.id,
  () => initializeAliases(),
  { immediate: true }
);

// Update item details when aliases change
const onAliasesChange = (key: string, aliases: string[]) => {
  fieldAliases.value[key] = aliases;

  // Build the aliases object, filtering out empty arrays
  const newAliases: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(fieldAliases.value)) {
    if (v && v.length > 0) {
      newAliases[k] = v;
    }
  }

  // Update the item details
  itemDetails.value.autofillAliases =
    Object.keys(newAliases).length > 0 ? newAliases : null;
};
</script>

<i18n lang="yaml">
de:
  aliasPlaceholder: Alias hinzufügen...
  customField: Benutzerdefiniert
  fields:
    username: Nutzername
    password: Passwort
    otp: OTP/2FA

en:
  aliasPlaceholder: Add alias...
  customField: Custom
  fields:
    username: Username
    password: Password
    otp: OTP/2FA
</i18n>
