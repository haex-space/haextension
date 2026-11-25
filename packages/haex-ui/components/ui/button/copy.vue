<template>
  <UiButton
    type="button"
    :icon="copied ? Check : Copy"
    :tooltip="name"
    :aria-label="name"
    variant="ghost"
    :size="size"
    :disabled="disabled"
    :class="
      copied
        ? 'text-success hover:text-success'
        : ['text-muted-foreground', iconButtonHoverClass(hover)]
    "
    @click.prevent="handleCopy"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, computed } from "vue";
import { useClipboard } from "@vueuse/core";
import { Check, Copy } from "@lucide/vue";
import { iconButtonHoverClass } from "../../../lib/iconButton";
import type { UiIconButtonHover } from "../../../lib/iconButton";

export type UiButtonCopyLabels = {
  copy: string;
  copied: string;
};

const props = withDefaults(
  defineProps<{
    /**
     * What the button copies; an empty value copies nothing. Leave it out together with `external`
     * when the caller does the copying itself.
     */
    value?: string | number | null;
    /** Tooltip texts. Pass translated strings from the app; defaults are German. */
    labels?: UiButtonCopyLabels;
    /**
     * The caller copies on `copy` (for example through the host, not the browser); the button only
     * shows the check and does not touch the clipboard.
     */
    external?: boolean;
    size?: "icon" | "icon-sm";
    disabled?: boolean;
    /** The hover colour before the copy happened. */
    hover?: UiIconButtonHover;
  }>(),
  {
    value: undefined,
    labels: () => ({ copy: "Kopieren", copied: "Kopiert!" }),
    size: "icon",
    hover: "primary",
  },
);

const emit = defineEmits<{
  /** The copy happened; the check is showing. */
  copy: [];
  /** The clipboard refused; no check is shown. */
  error: [cause: unknown];
}>();

/** How long the check stays. */
const CHECK_MS = 1500;

const { copy } = useClipboard({ legacy: true });

const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

const name = computed(() => (copied.value ? props.labels.copied : props.labels.copy));

const handleCopy = async () => {
  if (!props.external) {
    if (props.value === null || props.value === undefined || props.value === "") return;
    try {
      await copy(String(props.value));
    } catch (cause) {
      emit("error", cause);
      return;
    }
  }
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), CHECK_MS);
  emit("copy");
};

onBeforeUnmount(() => clearTimeout(timer));
</script>
