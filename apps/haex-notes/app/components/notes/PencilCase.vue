<script setup lang="ts">
import { Plus, Settings, Trash2, X } from "@lucide/vue";
import type { PenSlot } from "~/database/schemas";

const router = useRouter();
const localePath = useLocalePath();
const { t, locale } = useI18n();
const pencilCase = usePencilCaseStore();

// Pencil case config
const editingSlot = ref<PenSlot | null>(null);
const penTypes = [
  { value: "fineliner", de: "Fineliner", en: "Fineliner" },
  { value: "ballpoint", de: "Kugelschreiber", en: "Ballpoint" },
  { value: "pencil", de: "Bleistift", en: "Pencil" },
  { value: "highlighter", de: "Textmarker", en: "Highlighter" },
  { value: "eraser", de: "Radierer", en: "Eraser" },
] as const;

const openSlotEditor = (slot: PenSlot) => {
  editingSlot.value = { ...slot };
};

const saveSlotEdit = async () => {
  if (!editingSlot.value) return;
  await pencilCase.updateSlot(editingSlot.value.id, editingSlot.value);
  editingSlot.value = null;
};

const cancelSlotEdit = () => {
  editingSlot.value = null;
};
</script>

<template>
  <div class="flex shrink-0 flex-col items-center gap-0.5 border-r border-border bg-background px-1 py-2">
    <button
      v-for="slot in pencilCase.slots"
      :key="slot.id"
      class="flex size-10 items-center justify-center rounded-lg transition-all"
      :class="pencilCase.activeSlotId === slot.id
        ? 'ring-2 ring-primary shadow-md scale-110'
        : 'hover:bg-accent'"
      :title="slot.name"
      @click="pencilCase.selectSlot(slot.id)"
      @dblclick.stop="openSlotEditor(slot)"
    >
      <div
        class="rounded-full border border-border"
        :style="{
          backgroundColor: slot.type === 'eraser' ? '#ffffff' : slot.color,
          width: `${Math.max(8, Math.min(slot.size * 1.5, 28))}px`,
          height: `${Math.max(8, Math.min(slot.size * 1.5, 28))}px`,
          opacity: slot.type === 'highlighter' ? 0.5 : 1,
        }"
      />
    </button>

    <!-- Add slot button -->
    <button
      v-if="pencilCase.slots.length < pencilCase.maxSlots"
      class="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
      @click="async () => { const s = await pencilCase.addSlot(); if (s) openSlotEditor(s); }"
    >
      <Plus class="size-5" />
    </button>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Settings -->
    <button
      class="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
      :title="t('settings')"
      @click="router.push(localePath('/settings'))"
    >
      <Settings class="size-5" />
    </button>
  </div>

  <!-- Slot Editor (overlay panel) -->
  <div
    v-if="editingSlot"
    class="absolute left-16 top-16 z-50 w-64 rounded-xl border border-border bg-popover p-4 shadow-xl"
  >
    <div class="mb-3 flex items-center justify-between">
      <span class="text-sm font-semibold">{{ t('editPen') }}</span>
      <button class="rounded p-1 text-muted-foreground hover:text-foreground" @click="cancelSlotEdit">
        <X class="size-4" />
      </button>
    </div>

    <!-- Name -->
    <div class="mb-3">
      <label class="mb-1 block text-xs text-muted-foreground">{{ t('penName') }}</label>
      <input
        v-model="editingSlot.name"
        class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>

    <!-- Type -->
    <div class="mb-3">
      <label class="mb-1 block text-xs text-muted-foreground">{{ t('penType') }}</label>
      <select
        v-model="editingSlot.type"
        class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option v-for="pt in penTypes" :key="pt.value" :value="pt.value">
          {{ locale === 'de' ? pt.de : pt.en }}
        </option>
      </select>
    </div>

    <!-- Color (not for eraser) -->
    <div v-if="editingSlot.type !== 'eraser'" class="mb-3">
      <label class="mb-1 block text-xs text-muted-foreground">{{ t('penColor') }}</label>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="c in ['#000000', '#1e40af', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2', '#be185d', '#4b5563', '#facc15']"
          :key="c"
          class="size-7 rounded-md border-2 transition-transform hover:scale-110"
          :class="editingSlot.color === c ? 'border-foreground' : 'border-transparent'"
          :style="{ backgroundColor: c }"
          @click="editingSlot.color = c"
        />
      </div>
    </div>

    <!-- Size -->
    <div class="mb-4">
      <label class="mb-1 block text-xs text-muted-foreground">{{ t('penSize') }}: {{ editingSlot.size }}</label>
      <input
        v-model.number="editingSlot.size"
        type="range"
        :min="1"
        :max="32"
        class="w-full"
      />
    </div>

    <!-- Actions -->
    <div class="flex items-center justify-between">
      <button
        class="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
        @click="pencilCase.removeSlot(editingSlot.id); editingSlot = null"
      >
        <Trash2 class="size-3.5" /> {{ t('deletePen') }}
      </button>
      <button
        class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        @click="saveSlotEdit"
      >
        {{ t('save') }}
      </button>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  settings: Einstellungen
  editPen: Stift bearbeiten
  penName: Name
  penType: Typ
  penColor: Farbe
  penSize: Stärke
  deletePen: Löschen
  save: Speichern
en:
  settings: Settings
  editPen: Edit Pen
  penName: Name
  penType: Type
  penColor: Color
  penSize: Size
  deletePen: Delete
  save: Save
</i18n>
