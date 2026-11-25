<template>
  <UiButton
    type="button"
    variant="ghost"
    size="icon"
    class="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
    :class="{ invisible: placeholder }"
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

/**
 * The one way haex shows "delete this" next to an entry: a quiet bin icon that turns red on hover
 * and keyboard focus. `label` names what goes, for screen readers and the tooltip. With
 * `placeholder` it keeps its place but stays invisible and out of reach, so rows with and without a
 * delete button line up; it is not disabled then, since a row that holds a disabled control looks
 * greyed out.
 */
defineProps<{
  label: string;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: boolean;
}>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>
