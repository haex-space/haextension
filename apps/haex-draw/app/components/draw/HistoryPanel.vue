<script setup lang="ts">
import {
  History,
  Pencil,
  Pen,
  Highlighter,
  Paintbrush,
  PenLine,
  PencilLine,
  PenTool,
  SprayCan,
  Eraser,
  FileIcon,
} from "lucide-vue-next";

const { t } = useI18n();
const canvas = useCanvasStore();

const labelIcons: Record<string, any> = {
  pencil: Pencil,
  pen: Pen,
  marker: Highlighter,
  brush: Paintbrush,
  calligraphy: PenLine,
  sketch: PencilLine,
  "fine-tip": PenTool,
  spray: SprayCan,
  eraser: Eraser,
};

const labelNames: Record<string, { de: string; en: string }> = {
  pencil: { de: "Bleistift", en: "Pencil" },
  pen: { de: "Stift", en: "Pen" },
  marker: { de: "Marker", en: "Marker" },
  brush: { de: "Pinsel", en: "Brush" },
  calligraphy: { de: "Kalligrafie", en: "Calligraphy" },
  sketch: { de: "Skizze", en: "Sketch" },
  "fine-tip": { de: "Fineliner", en: "Fine Tip" },
  spray: { de: "Sprühfarbe", en: "Spray" },
  eraser: { de: "Radierer", en: "Eraser" },
};

const { locale } = useI18n();

const getLabel = (label: string) => {
  const names = labelNames[label];
  if (!names) return label;
  return locale.value === "de" ? names.de : names.en;
};

const getIcon = (label: string) => labelIcons[label] ?? Pencil;

// Scroll to active entry when historyIndex changes
const listEl = useTemplateRef("listEl");
watch(() => canvas.historyIndex, () => {
  nextTick(() => {
    const el = (listEl.value as any)?.$el as HTMLElement | undefined;
    if (!el?.querySelector) return;
    const active = el.querySelector("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  });
});
</script>

<template>
  <div class="flex h-full flex-col border-l border-border bg-background/95 backdrop-blur-sm">
    <!-- Header -->
    <div class="flex items-center gap-2 border-b border-border px-3 py-2">
      <History class="size-4 text-muted-foreground" />
      <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {{ t("title") }}
      </span>
    </div>

    <!-- History List -->
    <ShadcnScrollArea ref="listEl" class="flex-1">
      <div class="flex flex-col-reverse">
        <button
          v-for="(entry, index) in canvas.history"
          :key="entry.stroke.id"
          :data-active="index === canvas.historyIndex"
          class="group flex items-center gap-2 border-b border-border px-3 py-2 text-left text-sm transition-colors"
          :class="[
            index === canvas.historyIndex
              ? 'bg-primary/15 text-foreground'
              : index <= canvas.historyIndex
                ? 'text-foreground hover:bg-accent/50'
                : 'text-muted-foreground/50 hover:bg-accent/30',
          ]"
          @click="canvas.goToHistoryIndex(index)"
        >
          <component
            :is="getIcon(entry.label)"
            class="size-3.5 shrink-0"
            :class="index <= canvas.historyIndex ? '' : 'opacity-40'"
          />
          <span class="flex-1 truncate">{{ getLabel(entry.label) }}</span>
          <span
            class="shrink-0 text-[10px] tabular-nums"
            :class="index <= canvas.historyIndex ? 'text-muted-foreground' : 'text-muted-foreground/40'"
          >
            {{ index + 1 }}
          </span>
        </button>
      </div>

      <!-- Empty state: "Neu" base entry -->
      <button
        class="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm transition-colors"
        :class="canvas.historyIndex === -1
          ? 'bg-primary/15 text-foreground'
          : 'text-muted-foreground hover:bg-accent/50'"
        @click="canvas.goToHistoryIndex(-1)"
      >
        <FileIcon class="size-3.5 shrink-0" />
        <span class="flex-1 truncate">{{ t("new") }}</span>
        <span class="shrink-0 text-[10px] text-muted-foreground">0</span>
      </button>
    </ShadcnScrollArea>
  </div>
</template>

<i18n lang="yaml">
de:
  title: Verlauf
  new: Neu
en:
  title: History
  new: New
</i18n>
