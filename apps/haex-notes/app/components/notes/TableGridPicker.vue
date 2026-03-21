<script setup lang="ts">
const emit = defineEmits<{
  select: [rows: number, cols: number];
  cancel: [];
}>();

const { t } = useI18n();

const maxRows = 8;
const maxCols = 8;
const hoverRow = ref(0);
const hoverCol = ref(0);

const cells = computed(() => {
  const result: { r: number; c: number }[] = [];
  for (let r = 1; r <= maxRows; r++) {
    for (let c = 1; c <= maxCols; c++) {
      result.push({ r, c });
    }
  }
  return result;
});

const onCellHover = (r: number, c: number) => {
  hoverRow.value = r;
  hoverCol.value = c;
};

const onCellClick = () => {
  if (hoverRow.value > 0 && hoverCol.value > 0) {
    emit("select", hoverRow.value, hoverCol.value);
  }
};
</script>

<template>
  <div class="flex flex-col items-center gap-2 p-3">
    <span class="text-xs text-muted-foreground">
      {{ hoverRow > 0 ? `${hoverRow} × ${hoverCol}` : t("pickSize") }}
    </span>

    <div
      class="grid gap-0.5"
      :style="{ gridTemplateColumns: `repeat(${maxCols}, 1fr)` }"
      @mouseleave="hoverRow = 0; hoverCol = 0"
    >
      <button
        v-for="cell in cells"
        :key="`${cell.r}-${cell.c}`"
        class="size-7 rounded-sm border transition-colors"
        :class="cell.r <= hoverRow && cell.c <= hoverCol
          ? 'border-primary bg-primary/20'
          : 'border-border bg-background hover:border-primary/30'"
        @mouseenter="onCellHover(cell.r, cell.c)"
        @touchstart.prevent="onCellHover(cell.r, cell.c)"
        @click="onCellClick"
      />
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  pickSize: Tabellengröße wählen
en:
  pickSize: Pick table size
</i18n>
