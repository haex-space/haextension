<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import type { FormulaEdit } from "~/composables/useElementEditing";
import { paint, renderLatexAsync, svgDataUrl, FORMULA_EM_PX } from "~/lib/math";

/**
 * Bearbeitet die LaTeX-Quelle einer Formel mit einer Vorschau, die beim Tippen folgt (Spec 046, FR-031).
 * Eine Quelle, die sich nicht setzen lässt, wird nicht übernommen und zeigt ihren Grund. Strg+Enter oder
 * „Übernehmen“ übernimmt, Esc oder „Abbrechen“ verwirft.
 */
const props = defineProps<{ edit: FormulaEdit; viewport: { x: number; y: number; zoom: number } }>();
/** Gibt den Grund zurück, wenn sich die Quelle nicht übernehmen lässt, sonst `null`. */
const emit = defineEmits<{ commit: [source: string, done: (reason: string | null) => void]; cancel: [] }>();
const { t } = useI18n();
/** Ein Beispiel für die Chemie-Schreibweise; in einer Nachricht der Übersetzung wären die Klammern Platzhalter. */
const CHEMISTRY_EXAMPLE = "\\ce{H2O}";

/** Eine Zelle darf leer werden, eine Formel nicht. */
const allowEmpty = props.edit.cell !== undefined;
/** Der Editor liegt unter der Formel oder Zelle, die er bearbeitet. */
const boxStyle = computed(() => {
  const { box } = props.edit;
  const { x, y, zoom } = props.viewport;
  return { left: `${Math.max(0, box.x * zoom + x)}px`, top: `${(box.y + box.height) * zoom + y + 8}px` };
});

const value = ref(props.edit.source);
const reason = ref<string | null>(null);
const preview = ref<string | null>(null);
const textarea = useTemplateRef<HTMLTextAreaElement>("textarea");
const previewBox = useTemplateRef<HTMLDivElement>("previewBox");
onMounted(() => textarea.value?.focus());

let latest = 0;
async function renderPreviewAsync() {
  const mine = ++latest;
  const source = value.value;
  if (!source.trim()) {
    preview.value = null;
    reason.value = allowEmpty ? null : t("empty");
    return;
  }
  const result = await renderLatexAsync(source);
  if (mine !== latest) return;
  if ("error" in result) {
    preview.value = null;
    reason.value = result.error;
    return;
  }
  reason.value = null;
  // Ein SVG in einem <img> erbt die Textfarbe nicht (`currentColor` wäre schwarz auf dem dunklen Feld): die Farbe des Felds einsetzen.
  const ink = previewBox.value ? getComputedStyle(previewBox.value).color : "currentColor";
  preview.value = svgDataUrl(paint(result.svg, ink, result.width * FORMULA_EM_PX * 1.5, result.height * FORMULA_EM_PX * 1.5));
}
const renderPreviewSoon = useDebounceFn(renderPreviewAsync, 150);
watch(value, renderPreviewSoon);
onMounted(renderPreviewAsync);

let done = false;
function commit() {
  if (done) return;
  emit("commit", value.value, (problem) => {
    if (problem === null) {
      done = true;
      return;
    }
    reason.value = problem;
  });
}
function cancel() {
  if (done) return;
  done = true;
  emit("cancel");
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
  } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    commit();
  }
}
</script>

<template>
  <div
    class="absolute z-40 w-80 max-w-[90%] space-y-2 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
    :style="boxStyle"
    @pointerdown.stop
  >
    <textarea
      ref="textarea"
      v-model="value"
      rows="3"
      spellcheck="false"
      class="w-full resize-none rounded-md border border-input bg-background p-2 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
      :aria-label="t('label')"
      @keydown="onKeydown"
    />
    <div ref="previewBox" class="flex min-h-14 items-center justify-center overflow-auto rounded-md bg-background p-2 text-foreground">
      <img v-if="preview" :src="preview" :alt="t('preview')" draggable="false">
      <span v-else class="text-xs text-muted-foreground">{{ t('previewEmpty') }}</span>
    </div>
    <p v-if="reason" class="text-xs text-destructive" role="alert">{{ reason }}</p>
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs text-muted-foreground">{{ t('hint') }} <code>{{ CHEMISTRY_EXAMPLE }}</code></span>
      <div class="flex gap-1">
        <button class="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent" @click="cancel">{{ t('cancel') }}</button>
        <button
          class="rounded bg-primary px-2 py-1 text-sm text-primary-foreground disabled:opacity-50"
          :disabled="reason !== null"
          @click="commit"
        >
          {{ t('apply') }}
        </button>
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  label: LaTeX-Quelle der Formel
  preview: Vorschau der Formel
  previewEmpty: Die Vorschau erscheint beim Tippen.
  empty: Eine Formel braucht eine Quelle.
  hint: Chemie mit
  cancel: Abbrechen
  apply: Übernehmen
en:
  label: LaTeX source of the formula
  preview: Preview of the formula
  previewEmpty: The preview appears as you type.
  empty: A formula needs a source.
  hint: Chemistry with
  cancel: Cancel
  apply: Apply
</i18n>
