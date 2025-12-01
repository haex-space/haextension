<template>
  <div class="space-y-2">
    <UiLabel v-if="label">{{ label }}</UiLabel>

    <UiPopover v-model:open="isOpen">
      <UiPopoverTrigger as-child>
        <UiButton
          variant="outline"
          role="combobox"
          :aria-expanded="isOpen"
          :disabled="readOnly"
          class="w-full justify-center"
          :style="
            props.color
              ? { backgroundColor: props.color, borderColor: props.color }
              : undefined
          "
        >
          <HaexIcon
            :icon="iconName || defaultIcon || 'mdi:key'"
            class="h-4 w-4"
            :style="
              props.color ? { color: getTextColor(props.color) } : undefined
            "
          />
        </UiButton>
      </UiPopoverTrigger>
      <UiPopoverContent class="w-96 p-4 max-h-128 overflow-y-auto">
        <!-- Custom Icons Section -->
        <div v-if="customIcons.length" class="mb-4">
          <p class="text-sm font-medium mb-2">{{ t("customIcons") }}</p>
          <div class="grid grid-cols-8 gap-1">
            <UiContextMenu v-for="icon in customIcons" :key="icon">
              <UiContextMenuTrigger as-child>
                <button
                  type="button"
                  :class="[
                    'p-2 rounded-lg border-2 transition-all hover:bg-muted flex items-center justify-center',
                    iconName === icon
                      ? 'border-primary bg-primary/10'
                      : 'border-transparent',
                  ]"
                  @click="selectIcon(icon)"
                >
                  <HaexIcon :icon="icon" class="h-5 w-5" />
                </button>
              </UiContextMenuTrigger>
              <UiContextMenuContent>
                <UiContextMenuItem
                  class="text-destructive focus:text-destructive"
                  @click="handleDeleteIconAsync(icon)"
                >
                  <Trash class="w-4 h-4 mr-2" />
                  {{ t("deleteIcon") }}
                </UiContextMenuItem>
              </UiContextMenuContent>
            </UiContextMenu>
          </div>
        </div>

        <!-- Standard Icons Section -->
        <div>
          <p v-if="customIcons.length" class="text-sm font-medium mb-2">
            {{ t("standardIcons") }}
          </p>
          <div class="grid grid-cols-8 gap-1">
            <button
              v-for="icon in standardIcons"
              :key="icon"
              type="button"
              :class="[
                'p-2 rounded-lg border-2 transition-all hover:bg-muted flex items-center justify-center',
                iconName === icon
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent',
              ]"
              @click="selectIcon(icon)"
            >
              <HaexIcon :icon="icon" class="h-5 w-5" />
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-2 mt-4">
          <UiButton
            v-if="iconName"
            variant="outline"
            size="sm"
            class="flex-1"
            @click="clearIcon"
          >
            {{ t("clear") }}
          </UiButton>
          <UiButton
            variant="default"
            size="sm"
            class="flex-1"
            @click="isOpen = false"
          >
            {{ t("close") }}
          </UiButton>
        </div>
      </UiPopoverContent>
    </UiPopover>
  </div>
</template>

<script setup lang="ts">
import { Trash } from "lucide-vue-next";

const props = defineProps<{
  label?: string;
  defaultIcon?: string;
  color?: string | null;
  readOnly?: boolean;
}>();

const iconName = defineModel<string | null>();
const { t } = useI18n();

const isOpen = ref(false);

const { getTextColor } = useIconComponents();
const { customIcons, loadCustomIconsAsync, deleteIconAsync } = useCustomIcons();

// Standard MDI icons (grouped by category)
const standardIcons = [
  // Keys & Security
  "mdi:key",
  "mdi:key-variant",
  "mdi:shield",
  "mdi:shield-check",
  "mdi:lock",
  "mdi:lock-open",
  "mdi:security",

  // Folders & Organization
  "mdi:folder",
  "mdi:folder-lock",
  "mdi:folder-key",

  // Banking & Finance
  "mdi:bank",
  "mdi:credit-card",
  "mdi:bitcoin",
  "mdi:cash",
  "mdi:piggy-bank",
  "mdi:currency-usd",

  // Common Services & Shopping
  "mdi:email",
  "mdi:email-outline",
  "mdi:web",
  "mdi:shopping",
  "mdi:cart",
  "mdi:store",

  // Social & Communication
  "mdi:message",
  "mdi:chat",
  "mdi:phone",
  "mdi:account",
  "mdi:account-circle",

  // Tech & Devices
  "mdi:laptop",
  "mdi:cellphone",
  "mdi:desktop-tower",
  "mdi:server",
  "mdi:database",
  "mdi:cloud",
  "mdi:wifi",
  "mdi:harddisk",

  // Entertainment
  "mdi:controller",
  "mdi:headphones",
  "mdi:music",
  "mdi:video",
  "mdi:camera",
  "mdi:television",

  // Work & Productivity
  "mdi:briefcase",
  "mdi:file-document",
  "mdi:note",
  "mdi:notebook",
  "mdi:calendar",
  "mdi:clock",

  // Development
  "mdi:github",
  "mdi:gitlab",
  "mdi:wrench",
  "mdi:code-tags",
  "mdi:console",
  "mdi:application",

  // Travel & Transport
  "mdi:airplane",
  "mdi:car",
  "mdi:bus",
  "mdi:train",
  "mdi:bike",
  "mdi:ticket",
  "mdi:map-marker",

  // Misc
  "mdi:home",
  "mdi:bookmark",
  "mdi:star",
  "mdi:heart",
  "mdi:tag",
  "mdi:run",
  "mdi:lightbulb",
  "mdi:gift",
];

// Reload custom icons when popover opens
watch(isOpen, (newValue) => {
  if (newValue) {
    loadCustomIconsAsync();
  }
});

const selectIcon = (icon: string) => {
  iconName.value = icon;
  isOpen.value = false;
};

const clearIcon = () => {
  iconName.value = null;
};

const handleDeleteIconAsync = async (icon: string) => {
  await deleteIconAsync(icon);

  // If the deleted icon was selected, clear the selection
  if (iconName.value === icon) {
    iconName.value = null;
  }
};
</script>

<i18n lang="yaml">
de:
  clear: Zurücksetzen
  close: Schließen
  customIcons: Eigene Icons
  standardIcons: Standard Icons
  deleteIcon: Icon löschen

en:
  clear: Clear
  close: Close
  customIcons: Custom Icons
  standardIcons: Standard Icons
  deleteIcon: Delete icon
</i18n>
