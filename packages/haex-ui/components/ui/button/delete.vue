<template>
  <UiButton
    type="button"
    variant="ghost"
    size="icon"
    class="size-8 text-muted-foreground"
    :class="[{ invisible: placeholder }, iconButtonHoverClass(hover)]"
    :icon="Trash2"
    :aria-label="placeholder ? undefined : label"
    :aria-hidden="placeholder ? 'true' : undefined"
    :tabindex="placeholder ? -1 : undefined"
    :tooltip="placeholder ? undefined : label"
    :loading="loading"
    :disabled="disabled && !placeholder"
    @click="emit('click', $event)"
  />
</template>

<script setup lang="ts">
import { Trash2 } from "@lucide/vue";
import { iconButtonHoverClass } from "../../../lib/iconButton";
import type { UiIconButtonHover } from "../../../lib/iconButton";

/**
 * The one way haex shows "delete this" next to an entry: a quiet bin icon that turns red on hover
 * and keyboard focus. `label` names what goes, for screen readers and the tooltip. With
 * `placeholder` it keeps its place but stays invisible and out of reach, so rows with and without a
 * delete button line up; it is not disabled then, since a row that holds a disabled control looks
 * greyed out.
 */
withDefaults(
  defineProps<{
    label: string;
    loading?: boolean;
    disabled?: boolean;
    placeholder?: boolean;
    /** The hover colour; red unless the app says another. */
    hover?: UiIconButtonHover;
  }>(),
  { hover: "destructive" },
);
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>
