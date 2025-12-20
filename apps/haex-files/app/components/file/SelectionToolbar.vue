<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="selectionStore.isSelectionMode"
      class="flex items-center justify-between rounded-lg bg-primary text-primary-foreground px-4"
    >
      <div class="flex items-center gap-3">
      <ShadcnButton
        variant="ghost"
        size="icon-sm"
        class="text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
        @click="selectionStore.clearSelection()"
      >
        <X class="size-4" />
      </ShadcnButton>
      <span class="font-medium text-sm">
        {{ t("selected", { count: selectionStore.selectedCount }) }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <!-- Select All -->
      <ShadcnButton
        variant="ghost"
        size="sm"
        class="text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
        @click="$emit('selectAll')"
      >
        <CheckSquare class="size-4 mr-1.5" />
        {{ t("selectAll") }}
      </ShadcnButton>

      <!-- Add to / Remove from Ignore List -->
      <ShadcnButton
        v-if="allSelectedAreIgnored"
        variant="ghost"
        size="sm"
        class="text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
        @click="$emit('removeFromIgnore')"
      >
        <Eye class="size-4 mr-1.5" />
        {{ t("removeFromIgnore") }}
      </ShadcnButton>
      <ShadcnButton
        v-else
        variant="ghost"
        size="sm"
        class="text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
        @click="$emit('addToIgnore')"
      >
        <EyeOff class="size-4 mr-1.5" />
        {{ t("addToIgnore") }}
      </ShadcnButton>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { X, CheckSquare, Eye, EyeOff } from "lucide-vue-next";

defineProps<{
  allSelectedAreIgnored: boolean;
}>();

defineEmits<{
  selectAll: [];
  addToIgnore: [];
  removeFromIgnore: [];
}>();

const { t } = useI18n();
const selectionStore = useFileSelectionStore();
</script>

<i18n lang="yaml">
de:
  selected: "{count} ausgewählt"
  selectAll: Alle auswählen
  addToIgnore: Ignorieren
  removeFromIgnore: Nicht mehr ignorieren

en:
  selected: "{count} selected"
  selectAll: Select all
  addToIgnore: Ignore
  removeFromIgnore: Stop ignoring
</i18n>
