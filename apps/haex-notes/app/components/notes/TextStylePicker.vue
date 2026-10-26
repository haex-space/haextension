<script setup lang="ts">
import { HANDWRITING_STYLES, NEUTRAL_FAMILY } from "~/lib/paperNotes/fonts";

/** Wählt den Handschriftstil eines ausgewählten Textblocks; der Text bleibt Text. */
defineProps<{ fontFamily: string; boxStyle: Record<string, string> }>();
const emit = defineEmits<{ pick: [fontFamily: string] }>();
const { t } = useI18n();

const families = [...HANDWRITING_STYLES.map((style) => style.family), NEUTRAL_FAMILY];
</script>

<template>
  <select
    class="absolute z-40 h-7 rounded-md border border-border bg-popover px-1 text-xs text-popover-foreground shadow-md"
    :style="boxStyle"
    :value="fontFamily"
    :aria-label="t('label')"
    @pointerdown.stop
    @change="emit('pick', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="family in families" :key="family" :value="family" :style="{ fontFamily: family }">
      {{ family === NEUTRAL_FAMILY ? t('neutral') : family }}
    </option>
  </select>
</template>

<i18n lang="yaml">
de:
  label: Handschrift
  neutral: Druckschrift
en:
  label: Handwriting
  neutral: Print
</i18n>
