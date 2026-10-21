<script setup lang="ts">
/** Bearbeitet einen Textblock oder eine Zelle an Ort und Stelle; Strg+Enter oder Wegklicken übernimmt, Esc verwirft. */
const props = defineProps<{ text: string; boxStyle: Record<string, string> }>();
const emit = defineEmits<{ commit: [text: string]; cancel: [] }>();
const { t } = useI18n();

const value = ref(props.text);
const textarea = useTemplateRef<HTMLTextAreaElement>("textarea");
onMounted(() => textarea.value?.focus());

let done = false;
function finish(keep: boolean) {
  if (done) return;
  done = true;
  if (keep) emit("commit", value.value);
  else emit("cancel");
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    finish(false);
  } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    finish(true);
  }
}
</script>

<template>
  <textarea
    ref="textarea"
    v-model="value"
    class="absolute z-40 resize-none overflow-hidden rounded-sm border border-primary bg-background/95 p-0 text-foreground outline-none"
    :style="{ ...boxStyle, lineHeight: '1.25' }"
    :aria-label="t('label')"
    @keydown="onKeydown"
    @blur="finish(true)"
  />
</template>

<i18n lang="yaml">
de:
  label: Text bearbeiten (Strg+Enter übernimmt, Esc verwirft)
en:
  label: Edit text (Ctrl+Enter keeps, Esc discards)
</i18n>
