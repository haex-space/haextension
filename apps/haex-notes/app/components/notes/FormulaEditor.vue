<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import type { FormulaEdit } from "~/composables/useElementEditing";
import {
  applySymbol, CHEMISTRY_SYMBOLS, fromChemistry, fromLatex, latexOf, MATH_SYMBOLS, type FormulaMode, type FormulaSymbol,
} from "~/lib/formulaNotation";
import { paint, renderLatexAsync, svgDataUrl, FORMULA_EM_PX } from "~/lib/math";

/**
 * Bearbeitet eine Formel mit einer Vorschau, die beim Tippen folgt (Spec 046, FR-031). Schüler schreiben sie in der
 * einfachen Schreibweise (Chemie, Mathe und Physik, `lib/formulaNotation.ts`); LaTeX gibt es für Fortgeschrittene.
 * Eine Formel, die sich nicht setzen lässt, wird nicht übernommen und zeigt ihren Grund. Enter oder „Übernehmen“
 * übernimmt, Esc oder „Abbrechen“ verwirft. Bleibt der Text unverändert, bleibt auch die ursprüngliche Quelle.
 */
const props = defineProps<{ edit: FormulaEdit; viewport: { x: number; y: number; zoom: number } }>();
/** Gibt den Grund zurück, wenn sich die Quelle nicht übernehmen lässt, sonst `null`. */
const emit = defineEmits<{ commit: [source: string, done: (reason: string | null) => void]; cancel: [] }>();
const { t } = useI18n();
/** Beispiele je Schreibweise; in einer Nachricht der Übersetzung wären Klammern Platzhalter. */
const EXAMPLES: Record<FormulaMode, string> = {
  chemistry: "H2SO3 + H2O -> H3O+ + HSO3-",
  math: "E_pot = m * g * h   a^2 + b^2 = c^2   3/4",
  latex: "\\frac{a}{b}  \\ce{H2O}",
};
const MODES: FormulaMode[] = ["chemistry", "math", "latex"];

/** Eine Zelle darf leer werden, eine Formel nicht. */
const allowEmpty = props.edit.cell !== undefined;
/** Der Editor liegt unter der Formel oder Zelle, die er bearbeitet. */
const boxStyle = computed(() => {
  const { box } = props.edit;
  const { x, y, zoom } = props.viewport;
  return { left: `${Math.max(0, box.x * zoom + x)}px`, top: `${(box.y + box.height) * zoom + y + 8}px` };
});

/** In welcher Schreibweise die Quelle der Formel geöffnet wird: Chemie, einfache Mathe oder, wenn das nicht geht, LaTeX. */
function opening(source: string): { mode: FormulaMode; text: string } {
  const chemistry = fromChemistry(source);
  if (chemistry !== null) return { mode: "chemistry", text: chemistry };
  const simple = source.trim() ? fromLatex(source) : "";
  if (simple !== null) return { mode: "math", text: simple };
  return { mode: "latex", text: source };
}

const original = props.edit.source;
const start = opening(original);
const mode = ref<FormulaMode>(start.mode);
const text = ref(start.text);
/** Die Quelle, die übernommen wird: die ursprüngliche, solange nichts geändert ist. */
const latex = computed(() => (mode.value === start.mode && text.value === start.text ? original : latexOf(mode.value, text.value)));
const reason = ref<string | null>(null);
const preview = ref<string | null>(null);
const textarea = useTemplateRef<HTMLTextAreaElement>("textarea");
const previewBox = useTemplateRef<HTMLDivElement>("previewBox");
onMounted(() => textarea.value?.focus());

function setMode(next: FormulaMode) {
  if (next === mode.value) return;
  const current = latex.value;
  if (next === "latex") text.value = current;
  else {
    const converted = next === "chemistry" ? fromChemistry(current) : fromLatex(current);
    // Eine nicht ausdrückbare Formel darf beim Tabwechsel nicht stillschweigend
    // durch eine andere Formel ersetzt werden.
    if (converted === null) return;
    text.value = converted;
  }
  mode.value = next;
  textarea.value?.focus();
}

function insert(symbol: FormulaSymbol) {
  const field = textarea.value;
  const from = field?.selectionStart ?? text.value.length;
  const to = field?.selectionEnd ?? from;
  const result = applySymbol(text.value, from, to, symbol);
  text.value = result.text;
  nextTick(() => {
    field?.focus();
    field?.setSelectionRange(result.caret, result.caret);
  });
}

let latest = 0;
async function renderPreviewAsync() {
  const mine = ++latest;
  const source = latex.value;
  if (!source.trim()) {
    preview.value = null;
    reason.value = allowEmpty ? null : t("empty");
    return;
  }
  const result = await renderLatexAsync(source);
  if (mine !== latest) return;
  if ("error" in result) {
    preview.value = null;
    reason.value = mode.value === "latex" ? result.error : t("unclear");
    return;
  }
  reason.value = null;
  // Ein SVG in einem <img> erbt die Textfarbe nicht (`currentColor` wäre schwarz auf dem dunklen Feld): die Farbe des Felds einsetzen.
  const ink = previewBox.value ? getComputedStyle(previewBox.value).color : "currentColor";
  preview.value = svgDataUrl(paint(result.svg, ink, result.width * FORMULA_EM_PX * 1.5, result.height * FORMULA_EM_PX * 1.5));
}
const renderPreviewSoon = useDebounceFn(renderPreviewAsync, 150);
watch(latex, renderPreviewSoon);
onMounted(renderPreviewAsync);

let done = false;
function commit() {
  if (done) return;
  emit("commit", latex.value, (problem) => {
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
  } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey || (mode.value !== "latex" && !event.shiftKey))) {
    event.preventDefault();
    commit();
  }
}

const symbols = computed(() => (mode.value === "chemistry" ? CHEMISTRY_SYMBOLS : mode.value === "math" ? MATH_SYMBOLS : []));
</script>

<template>
  <div
    class="absolute z-40 w-80 max-w-[90%] space-y-2 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
    :style="boxStyle"
    @pointerdown.stop
  >
    <div class="flex gap-1" role="tablist" :aria-label="t('modes')">
      <button
        v-for="option in MODES"
        :key="option"
        role="tab"
        :aria-selected="mode === option"
        class="rounded px-2 py-1 text-xs"
        :class="mode === option ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'"
        @click="setMode(option)"
      >
        {{ t(`mode.${option}`) }}
      </button>
    </div>
    <textarea
      ref="textarea"
      v-model="text"
      :rows="mode === 'latex' ? 3 : 2"
      spellcheck="false"
      class="w-full resize-none rounded-md border border-input bg-background p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      :class="mode === 'latex' ? 'font-mono' : ''"
      :aria-label="t(`label.${mode}`)"
      :placeholder="EXAMPLES[mode]"
      @keydown="onKeydown"
    />
    <div v-if="symbols.length" class="flex flex-wrap gap-1">
      <button
        v-for="symbol in symbols"
        :key="symbol.label"
        class="min-w-8 rounded border border-border px-1.5 py-0.5 text-sm hover:bg-accent"
        :title="symbol.id ? t(`symbol.${symbol.id}`) : symbol.before"
        @click="insert(symbol)"
      >
        {{ symbol.label }}
      </button>
    </div>
    <div ref="previewBox" class="flex min-h-14 items-center justify-center overflow-auto rounded-md bg-background p-2 text-foreground">
      <img v-if="preview" :src="preview" :alt="t('preview')" draggable="false">
      <span v-else class="text-xs text-muted-foreground">{{ t('previewEmpty') }}</span>
    </div>
    <p v-if="reason" class="text-xs text-destructive" role="alert">{{ reason }}</p>
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs text-muted-foreground">{{ t(`hint.${mode}`) }}</span>
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
  modes: Schreibweise der Formel
  mode:
    chemistry: Chemie
    math: Mathe & Physik
    latex: LaTeX
  label:
    chemistry: Formel in Chemie-Schreibweise
    math: Formel in Mathe-Schreibweise
    latex: LaTeX-Quelle der Formel
  hint:
    chemistry: Schreib sie, wie sie dasteht. Pfeil mit -> oder dem Knopf.
    math: Hoch mit ^, tief mit _, Bruch mit /, Wurzel mit sqrt( ).
    latex: Für Fortgeschrittene.
  symbol:
    sup: Hochstellen – erst markieren oder danach in die Klammer tippen
    sub: Tiefstellen – erst markieren oder danach in die Klammer tippen
    root: Wurzel – erst markieren oder danach in die Klammer tippen
  preview: Vorschau der Formel
  previewEmpty: Die Vorschau erscheint beim Tippen.
  empty: Eine Formel braucht eine Quelle.
  unclear: Das lässt sich noch nicht als Formel setzen. Prüfe Klammern und Zeichen.
  cancel: Abbrechen
  apply: Übernehmen
en:
  modes: Notation of the formula
  mode:
    chemistry: Chemistry
    math: Maths & Physics
    latex: LaTeX
  label:
    chemistry: Formula in chemistry notation
    math: Formula in maths notation
    latex: LaTeX source of the formula
  hint:
    chemistry: Write it as it stands. Arrow with -> or the button.
    math: Power with ^, index with _, fraction with /, root with sqrt( ).
    latex: For advanced users.
  symbol:
    sup: Superscript – select first or type inside the brackets afterwards
    sub: Subscript – select first or type inside the brackets afterwards
    root: Root – select first or type inside the brackets afterwards
  preview: Preview of the formula
  previewEmpty: The preview appears as you type.
  empty: A formula needs a source.
  unclear: This cannot be set as a formula yet. Check brackets and characters.
  cancel: Cancel
  apply: Apply
</i18n>
