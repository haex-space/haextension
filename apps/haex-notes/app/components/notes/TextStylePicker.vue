<script setup lang="ts">
import { HANDWRITING_STYLES, NEUTRAL_FAMILY } from "~/lib/paperNotes/fonts";
import { LINE_MULTIPLES, TEXT_COLORS } from "~/lib/textStyle";

/**
 * Stil eines ausgewählten Textblocks: Handschrift, Zeilenhöhe auf dem Papier und Farbe. Der Text bleibt Text.
 * Die Zeilenhöhe gibt es nur, wo das Papier Zeilen hat (`hasRows`); `multiple` ist `null`, solange der Block frei hängt.
 */
const props = defineProps<{ fontFamily: string; color: string; multiple: number | null; hasRows: boolean; boxStyle: Record<string, string> }>();
const emit = defineEmits<{ pick: [fontFamily: string]; rows: [multiple: number | null]; color: [color: string] }>();
const { t, locale } = useI18n();

const families = [...HANDWRITING_STYLES.map((style) => style.family), NEUTRAL_FAMILY];
// Ein Vielfaches außerhalb der Liste (von Hand gesetzt oder aus einem größeren Blatt) bleibt wählbar.
const multiples = computed(() => (props.multiple && !LINE_MULTIPLES.includes(props.multiple) ? [...LINE_MULTIPLES, props.multiple].sort() : LINE_MULTIPLES));
const selectClass = "h-7 rounded-md border border-border bg-popover px-1 text-xs text-popover-foreground";

function pickRows(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  emit("rows", value === "free" ? null : Number(value));
}
</script>

<template>
  <div
    class="absolute z-40 flex items-center gap-1 rounded-md border border-border bg-popover p-0.5 shadow-md"
    :style="boxStyle"
    @pointerdown.stop
  >
    <select
      :class="selectClass" :value="fontFamily" :aria-label="t('label')"
      @change="emit('pick', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="family in families" :key="family" :value="family" :style="{ fontFamily: family }">
        {{ family === NEUTRAL_FAMILY ? t('neutral') : family }}
      </option>
    </select>
    <select v-if="hasRows" :class="selectClass" :value="multiple ?? 'free'" :aria-label="t('rows')" @change="pickRows">
      <option value="free">{{ t('free') }}</option>
      <option v-for="n in multiples" :key="n" :value="n">{{ t('multiple', { n }) }}</option>
    </select>
    <button
      v-for="swatch in TEXT_COLORS"
      :key="swatch.color"
      class="size-5 rounded-full border border-border"
      :class="color === swatch.color ? 'ring-2 ring-ring' : ''"
      :style="{ backgroundColor: swatch.color }"
      :title="locale === 'de' ? swatch.i18n.de : swatch.i18n.en"
      :aria-label="locale === 'de' ? swatch.i18n.de : swatch.i18n.en"
      :aria-pressed="color === swatch.color"
      @click="emit('color', swatch.color)"
    />
  </div>
</template>

<i18n lang="yaml">
de:
  label: Handschrift
  neutral: Druckschrift
  rows: Zeilenhöhe auf dem Papier
  free: Frei
  multiple: "{n}× Zeile"
en:
  label: Handwriting
  neutral: Print
  rows: Line height on the paper
  free: Free
  multiple: "{n}× line"
</i18n>
