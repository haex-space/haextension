<template>
  <UiDrawerModal
    v-model:open="isOpen"
    :title="t('title')"
    :description="t('selectFile')"
  >
    <template #content>
      <div class="space-y-4">
        <!-- File Upload -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("file") }}</ShadcnLabel>
          <input
            ref="fileInput"
            type="file"
            accept=".csv,.json"
            class="hidden"
            @change="onFileChangeAsync"
          />
          <UiButton
            :icon="File"
            variant="outline"
            class="w-full justify-start"
            @click="fileInput?.click()"
          >
            {{ selectedFileName || t("chooseFile") }}
          </UiButton>
          <p class="text-xs text-muted-foreground">
            {{ t("fileHint") }}
          </p>
        </div>

        <!-- Import Progress -->
        <div v-if="importing" class="space-y-2">
          <ShadcnProgress v-model="progress" />
          <div class="text-sm text-center text-muted-foreground">
            {{ t("importing") }}: {{ progress }}%
          </div>
        </div>

        <!-- Error -->
        <div
          v-if="error"
          class="p-4 bg-destructive/10 text-destructive rounded-lg text-sm"
        >
          {{ error }}
        </div>
      </div>
    </template>

    <template #footer>
      <UiButton :disabled="!canImport" @click="importAsync">
        {{ t("import") }}
      </UiButton>
      <UiButton variant="outline" @click="isOpen = false">
        {{ t("cancel") }}
      </UiButton>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { toast } from "vue-sonner";
import { File } from "@lucide/vue";
import { importBitwardenCsvAsync } from "~/utils/import/bitwardenCsv";
import { importBitwardenJsonAsync } from "~/utils/import/bitwardenJson";

const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useI18n();

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const fileData = ref<string | null>(null);
const fileType = ref<"csv" | "json" | null>(null);
const selectedFileName = ref<string | null>(null);
const importing = ref(false);
const progress = ref(0);
const error = ref<string | null>(null);

const canImport = computed(() => {
  return !!fileData.value && !importing.value;
});

const onFileChangeAsync = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) {
    selectedFileName.value = null;
    fileData.value = null;
    fileType.value = null;
    return;
  }

  selectedFileName.value = file.name;
  error.value = null;

  // Determine file type
  if (file.name.endsWith(".json")) {
    fileType.value = "json";
  } else if (file.name.endsWith(".csv")) {
    fileType.value = "csv";
  } else {
    error.value = t("error.invalidFormat");
    return;
  }

  try {
    fileData.value = await file.text();
  } catch (err) {
    error.value = t("error.parse");
    console.error(err);
  }
};

const importAsync = async () => {
  if (!fileData.value || !fileType.value) {
    error.value = t("error.noFile");
    return;
  }

  importing.value = true;
  progress.value = 0;
  error.value = null;

  try {
    let stats: { folderCount: number; entryCount: number };

    if (fileType.value === "json") {
      stats = await importBitwardenJsonAsync(fileData.value, progress, t);
    } else {
      stats = await importBitwardenCsvAsync(fileData.value, progress);
    }

    toast.success(t("success"), {
      description: t("successDescription", {
        folders: stats.folderCount,
        entries: stats.entryCount,
      }),
    });

    isOpen.value = false;
    fileData.value = null;
    selectedFileName.value = null;
    fileType.value = null;
  } catch (err) {
    console.error("[Bitwarden Import] Error:", err);
    error.value =
      t("error.import") +
      ": " +
      (err instanceof Error ? err.message : String(err));
  } finally {
    importing.value = false;
    progress.value = 0;
  }
};

// Reset state when drawer closes
watch(isOpen, (newValue) => {
  if (!newValue) {
    fileData.value = null;
    selectedFileName.value = null;
    fileType.value = null;
    error.value = null;
    importing.value = false;
    progress.value = 0;
  }
});
</script>

<i18n lang="yaml">
de:
  title: Bitwarden Import
  selectFile: Bitwarden-Export auswählen (.csv oder .json)
  file: Export-Datei
  chooseFile: Datei auswählen
  fileHint: "Exportiere deine Daten aus Bitwarden: Einstellungen → Export Vault"
  import: Importieren
  cancel: Abbrechen
  importing: Importiere
  error:
    parse: Fehler beim Lesen der Datei
    noFile: Keine Datei ausgewählt
    invalidFormat: Ungültiges Dateiformat. Bitte .csv oder .json Datei auswählen.
    encrypted: Verschlüsselte Exporte werden nicht unterstützt. Bitte exportiere ohne Passwort.
    import: Fehler beim Importieren
  success: Import erfolgreich
  successDescription: "{folders} Ordner und {entries} Einträge wurden importiert"

en:
  title: Bitwarden Import
  selectFile: Select Bitwarden export (.csv or .json)
  file: Export File
  chooseFile: Choose file
  fileHint: "Export your data from Bitwarden: Settings → Export Vault"
  import: Import
  cancel: Cancel
  importing: Importing
  error:
    parse: Error reading file
    noFile: No file selected
    invalidFormat: Invalid file format. Please select a .csv or .json file.
    encrypted: Encrypted exports are not supported. Please export without password.
    import: Error importing data
  success: Import successful
  successDescription: "{folders} folders and {entries} entries imported"
</i18n>
