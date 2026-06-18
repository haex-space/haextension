<template>
  <div class="space-y-3">
    <!-- Type list -->
    <div
      v-for="type in eventTypes.types"
      :key="type.id"
      class="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted"
    >
      <span
        class="w-4 h-4 mt-0.5 rounded-full shrink-0"
        :style="{ backgroundColor: type.color }"
      />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">{{ type.name }}</p>
        <p v-if="previewFor(type)" class="text-xs text-muted-foreground truncate">
          {{ previewFor(type) }}
        </p>
      </div>
      <button
        class="p-1.5 rounded-md hover:bg-background transition-colors shrink-0"
        :title="t('edit')"
        @click="openEdit(type)"
      >
        <Pencil class="w-4 h-4" />
      </button>
      <button
        class="p-1.5 rounded-md hover:bg-background transition-colors text-destructive shrink-0"
        :title="t('delete')"
        @click="confirmDelete(type)"
      >
        <Trash2 class="w-4 h-4" />
      </button>
    </div>

    <p v-if="eventTypes.types.length === 0" class="text-sm text-muted-foreground">
      {{ t("empty") }}
    </p>

    <button
      class="flex items-center gap-2 w-full justify-center bg-muted hover:bg-muted/80 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
      @click="openNew"
    >
      <Plus class="w-4 h-4" />
      {{ t("add") }}
    </button>

    <!-- Create / edit form -->
    <UiDrawerModal v-model:open="showForm" :title="editingId ? t('form.editTitle') : t('form.newTitle')">
      <template #content>
        <div class="space-y-4 p-4">
          <div>
            <label class="text-sm font-medium">{{ t("form.name") }}</label>
            <input
              v-model="form.name"
              class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
              :placeholder="t('form.namePlaceholder')"
            >
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">{{ t("form.color") }}</label>
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="c in presetColors"
                :key="c"
                type="button"
                :class="[
                  'w-8 h-8 rounded-full border-2 transition-transform',
                  form.color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
                ]"
                :style="{ backgroundColor: c }"
                @click="form.color = c"
              />
            </div>
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">{{ t("form.reminders") }}</label>
            <CalendarRemindersEditor v-model="form.reminderOffsets" />
          </div>

          <div>
            <CalendarRecurrenceEditor v-model="form.defaultRrule" />
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <button class="text-muted-foreground px-3 py-2" @click="showForm = false">
            {{ t("form.cancel") }}
          </button>
          <button
            class="bg-primary text-primary-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            :disabled="!form.name.trim()"
            @click="save"
          >
            {{ t("form.save") }}
          </button>
        </div>
      </template>
    </UiDrawerModal>

    <!-- Delete confirmation -->
    <ShadcnAlertDialog v-model:open="showDeleteConfirm">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>{{ t("deleteConfirm.title") }}</ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>
            {{ t("deleteConfirm.description", { count: affectedCount }) }}
          </ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>{{ t("deleteConfirm.abort") }}</ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction @click="executeDelete">{{ t("deleteConfirm.confirm") }}</ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>
  </div>
</template>

<script setup lang="ts">
import { Pencil, Plus, Trash2 } from "lucide-vue-next";
import { formatRemindersShort } from "~/lib/reminders";
import { rruleFrequency } from "~/lib/rrule";
import type { SelectEventType } from "~/stores/eventTypes";

const { t } = useI18n();
const eventTypes = useEventTypesStore();

const presetColors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#6b7280"];

const showForm = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  name: "",
  color: presetColors[0]!,
  defaultRrule: null as string | null,
  reminderOffsets: [] as number[],
});

onMounted(() => {
  eventTypes.loadTypesAsync();
});

function previewFor(type: SelectEventType): string {
  const parts: string[] = [];
  const reminders = eventTypes.getTypeReminders(type.id);
  if (reminders.length) parts.push(`🔔 ${formatRemindersShort(reminders)}`);
  const freq = rruleFrequency(type.defaultRrule);
  if (freq) parts.push(`🔁 ${t(`freq.${freq}`)}`);
  return parts.join(" · ");
}

function openNew() {
  editingId.value = null;
  form.name = "";
  form.color = presetColors[0]!;
  form.defaultRrule = null;
  form.reminderOffsets = [];
  showForm.value = true;
}

function openEdit(type: SelectEventType) {
  editingId.value = type.id;
  form.name = type.name;
  form.color = type.color;
  form.defaultRrule = type.defaultRrule;
  form.reminderOffsets = [...eventTypes.getTypeReminders(type.id)];
  showForm.value = true;
}

async function save() {
  if (!form.name.trim()) return;
  const payload = {
    name: form.name.trim(),
    color: form.color,
    defaultRrule: form.defaultRrule,
    reminderOffsets: form.reminderOffsets,
  };
  if (editingId.value) {
    await eventTypes.updateTypeAsync(editingId.value, payload);
  } else {
    await eventTypes.createTypeAsync(payload);
  }
  showForm.value = false;
}

// --- Delete ---
const showDeleteConfirm = ref(false);
const deleteId = ref<string | null>(null);
const affectedCount = ref(0);

async function confirmDelete(type: SelectEventType) {
  deleteId.value = type.id;
  affectedCount.value = await eventTypes.countEventsForTypeAsync(type.id);
  showDeleteConfirm.value = true;
}

async function executeDelete() {
  if (!deleteId.value) return;
  await eventTypes.deleteTypeAsync(deleteId.value);
  deleteId.value = null;
  showDeleteConfirm.value = false;
}
</script>

<i18n lang="yaml">
de:
  add: Termin-Art hinzufügen
  edit: Bearbeiten
  delete: Löschen
  empty: Noch keine Termin-Arten angelegt.
  freq:
    daily: täglich
    weekly: wöchentlich
    monthly: monatlich
    yearly: jährlich
  form:
    newTitle: Neue Termin-Art
    editTitle: Termin-Art bearbeiten
    name: Name
    namePlaceholder: z.B. Geburtstag
    color: Farbe
    reminders: Erinnerungen
    cancel: Abbrechen
    save: Speichern
  deleteConfirm:
    title: Termin-Art löschen?
    description: "{count} Termin(e) verwenden diese Art und fallen auf \"keine Art\" zurück. Eigene Anpassungen bleiben erhalten."
    abort: Abbrechen
    confirm: Löschen
en:
  add: Add event type
  edit: Edit
  delete: Delete
  empty: No event types yet.
  freq:
    daily: daily
    weekly: weekly
    monthly: monthly
    yearly: yearly
  form:
    newTitle: New event type
    editTitle: Edit event type
    name: Name
    namePlaceholder: e.g. Birthday
    color: Color
    reminders: Reminders
    cancel: Cancel
    save: Save
  deleteConfirm:
    title: Delete event type?
    description: "{count} event(s) use this type and will fall back to \"no type\". Their own overrides are kept."
    abort: Cancel
    confirm: Delete
</i18n>
