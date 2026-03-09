<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('title')">
    <template #content>
      <div class="space-y-4 p-4">
        <div>
          <label class="text-sm font-medium">{{ t('name') }}</label>
          <input
            ref="nameInput"
            v-model="name"
            class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
            :placeholder="t('namePlaceholder')"
            @keydown.enter="handleCreate"
          />
        </div>

        <div>
          <label class="text-sm font-medium mb-1 block">{{ t('color') }}</label>
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="c in presetColors"
              :key="c"
              :class="[
                'w-8 h-8 rounded-full border-2 transition-transform',
                selectedColor === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
              ]"
              :style="{ backgroundColor: c }"
              @click="selectedColor = c"
            />
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 p-4 border-t border-border">
        <button
          class="text-muted-foreground px-3 py-2"
          @click="isOpen = false"
        >
          {{ t('cancel') }}
        </button>
        <button
          class="bg-primary text-primary-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity"
          :disabled="!name.trim()"
          @click="handleCreate"
        >
          {{ t('create') }}
        </button>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const calendarsStore = useCalendarsStore();

const nameInput = ref<HTMLInputElement | null>(null);
const name = ref("");
const selectedColor = ref("#3b82f6");

const presetColors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#6b7280"];

watch(isOpen, (open) => {
  if (open) {
    name.value = "";
    selectedColor.value = "#3b82f6";
    nextTick(() => nameInput.value?.focus());
  }
});

async function handleCreate() {
  if (!name.value.trim()) return;
  await calendarsStore.createCalendarAsync({
    name: name.value.trim(),
    color: selectedColor.value,
  });
  isOpen.value = false;
}
</script>

<i18n lang="yaml">
de:
  title: Neuer Kalender
  name: Name
  namePlaceholder: Kalendername
  color: Farbe
  cancel: Abbrechen
  create: Erstellen
en:
  title: New Calendar
  name: Name
  namePlaceholder: Calendar name
  color: Color
  cancel: Cancel
  create: Create
</i18n>
