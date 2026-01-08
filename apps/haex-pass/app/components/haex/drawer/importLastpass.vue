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
            accept=".csv"
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
import { File } from "lucide-vue-next";
import {
  haexPasswordsItemDetails,
  haexPasswordsGroupItems,
  haexPasswordsItemKeyValues,
} from "~/database/schemas/index";

const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useI18n();

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const fileData = ref<string | null>(null);
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
    return;
  }

  selectedFileName.value = file.name;
  error.value = null;

  if (!file.name.endsWith(".csv")) {
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

// LastPass CSV columns
interface LastPassCsvRow {
  url: string;
  username: string;
  password: string;
  totp: string;
  extra: string;
  name: string;
  grouping: string;
  fav: string;
}

function parseCSV(csvText: string): LastPassCsvRow[] {
  const lines = csvText.split("\n");
  if (lines.length < 2) return [];

  // Parse header
  const header = parseCSVLine(lines[0] || "");
  const rows: LastPassCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};

    header.forEach((col, idx) => {
      row[col.toLowerCase()] = values[idx] || "";
    });

    rows.push(row as unknown as LastPassCsvRow);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

// Parse OTP data from LastPass TOTP field
interface ParsedOtp {
  secret: string;
  digits: number;
  period: number;
  algorithm: string;
}

function parseOtpData(totp: string | null | undefined): ParsedOtp | null {
  if (!totp || !totp.trim()) return null;

  // Check if it's an otpauth:// URI
  if (totp.startsWith("otpauth://")) {
    try {
      const url = new URL(totp);
      const secret = url.searchParams.get("secret");
      if (!secret) return null;

      return {
        secret: secret.toUpperCase(),
        digits: parseInt(url.searchParams.get("digits") || "6", 10),
        period: parseInt(url.searchParams.get("period") || "30", 10),
        algorithm: (url.searchParams.get("algorithm") || "SHA1").toUpperCase(),
      };
    } catch {
      return null;
    }
  }

  // Plain secret
  return {
    secret: totp.toUpperCase().replace(/\s/g, ""),
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  };
}

const importAsync = async () => {
  if (!fileData.value) {
    error.value = t("error.noFile");
    return;
  }

  importing.value = true;
  progress.value = 0;
  error.value = null;

  try {
    const stats = await importLastPassCsvAsync(fileData.value);

    toast.success(t("success"), {
      description: t("successDescription", {
        folders: stats.folderCount,
        entries: stats.entryCount,
      }),
    });

    isOpen.value = false;
    fileData.value = null;
    selectedFileName.value = null;
  } catch (err) {
    console.error("[LastPass Import] Error:", err);
    error.value =
      t("error.import") +
      ": " +
      (err instanceof Error ? err.message : String(err));
  } finally {
    importing.value = false;
    progress.value = 0;
  }
};

async function importLastPassCsvAsync(
  csvText: string
): Promise<{ folderCount: number; entryCount: number }> {
  const rows = parseCSV(csvText);

  const { addGroupAsync } = usePasswordGroupStore();
  const haexVaultStore = useHaexVaultStore();
  const { orm } = storeToRefs(haexVaultStore);

  if (!orm.value) {
    throw new Error("Database not initialized");
  }

  // LastPass uses nested folder paths like "Folder/Subfolder"
  // We need to create the hierarchy
  const folderMapping = new Map<string, string>();
  const uniqueFolderPaths = new Set<string>();

  for (const row of rows) {
    if (row.grouping && row.grouping.trim()) {
      uniqueFolderPaths.add(row.grouping.trim());
    }
  }

  // Sort folder paths by depth to create parents first
  const sortedPaths = Array.from(uniqueFolderPaths).sort((a, b) => {
    return a.split("/").length - b.split("/").length;
  });

  const totalSteps = sortedPaths.length + rows.length;
  let currentStep = 0;

  // Create folder hierarchy
  for (const folderPath of sortedPaths) {
    const parts = folderPath.split("/");
    let currentPath = "";
    let parentId: string | null = null;

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!folderMapping.has(currentPath)) {
        const newGroup = await addGroupAsync({
          id: crypto.randomUUID(),
          name: part,
          icon: "folder",
          parentId,
        });
        folderMapping.set(currentPath, newGroup.id);
      }

      parentId = folderMapping.get(currentPath) || null;
    }

    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Import entries
  let entryCount = 0;
  for (const row of rows) {
    // Skip http://sn entries (LastPass secure notes metadata)
    if (row.url === "http://sn") {
      // This is a secure note - import as note entry
      const groupId = row.grouping
        ? folderMapping.get(row.grouping.trim())
        : null;
      const newEntryId = crypto.randomUUID();

      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: row.name || "Secure Note",
        username: "",
        password: "",
        url: "",
        note: row.extra || "",
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: "file-text",
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      entryCount++;
      currentStep++;
      progress.value = Math.round((currentStep / totalSteps) * 100);
      continue;
    }

    const groupId = row.grouping
      ? folderMapping.get(row.grouping.trim())
      : null;
    const otpData = parseOtpData(row.totp);

    const newEntryId = crypto.randomUUID();

    await orm.value.insert(haexPasswordsItemDetails).values({
      id: newEntryId,
      title: row.name || "",
      username: row.username || "",
      password: row.password || "",
      url: row.url || "",
      note: row.extra || "",
      otpSecret: otpData?.secret || null,
      otpDigits: otpData?.digits || null,
      otpPeriod: otpData?.period || null,
      otpAlgorithm: otpData?.algorithm || null,
      icon: row.fav === "1" ? "star" : null,
      color: null,
      createdAt: new Date().toISOString(),
      updateAt: new Date(),
    });

    await orm.value.insert(haexPasswordsGroupItems).values({
      itemId: newEntryId,
      groupId: groupId || null,
    });

    // Parse extra field for potential key-value pairs
    // LastPass sometimes stores additional data in the extra field
    const extraKeyValues = parseExtraField(row.extra);
    if (extraKeyValues.length > 0) {
      await orm.value.insert(haexPasswordsItemKeyValues).values(
        extraKeyValues.map((field) => ({
          id: crypto.randomUUID(),
          itemId: newEntryId,
          key: field.name,
          value: field.value,
        }))
      );
    }

    entryCount++;
    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Sync data
  const { syncGroupItemsAsync } = usePasswordGroupStore();
  await syncGroupItemsAsync();

  // Calculate unique folder count (not path count)
  const uniqueFolderCount = new Set(folderMapping.values()).size;

  return {
    folderCount: uniqueFolderCount,
    entryCount,
  };
}

function parseExtraField(
  extra: string
): Array<{ name: string; value: string }> {
  // LastPass extra field may contain structured data like:
  // "NoteType:Server\nHostname:example.com\nUsername:admin"
  // Only parse if it looks like key:value pairs
  if (!extra || !extra.includes(":")) return [];

  const lines = extra.split("\n");
  const result: Array<{ name: string; value: string }> = [];

  // Check if this looks like structured data (multiple key:value lines)
  const keyValueLines = lines.filter((line) => {
    const colonIdx = line.indexOf(":");
    return colonIdx > 0 && colonIdx < 30; // Key should be reasonably short
  });

  // Only parse as key-value if most lines match the pattern
  if (keyValueLines.length >= 2 && keyValueLines.length >= lines.length * 0.5) {
    for (const line of keyValueLines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();
        // Skip NoteType as it's metadata
        if (key !== "NoteType" && value) {
          result.push({ name: key, value });
        }
      }
    }
  }

  return result;
}

// Reset state when drawer closes
watch(isOpen, (newValue) => {
  if (!newValue) {
    fileData.value = null;
    selectedFileName.value = null;
    error.value = null;
    importing.value = false;
    progress.value = 0;
  }
});
</script>

<i18n lang="yaml">
de:
  title: LastPass Import
  selectFile: LastPass-Export auswählen (.csv)
  file: Export-Datei
  chooseFile: Datei auswählen
  fileHint: "Exportiere deine Daten aus LastPass: Kontooptionen → Erweitert → Exportieren"
  import: Importieren
  cancel: Abbrechen
  importing: Importiere
  error:
    parse: Fehler beim Lesen der Datei
    noFile: Keine Datei ausgewählt
    invalidFormat: Ungültiges Dateiformat. Bitte .csv Datei auswählen.
    import: Fehler beim Importieren
  success: Import erfolgreich
  successDescription: "{folders} Ordner und {entries} Einträge wurden importiert"

en:
  title: LastPass Import
  selectFile: Select LastPass export (.csv)
  file: Export File
  chooseFile: Choose file
  fileHint: "Export your data from LastPass: Account Options → Advanced → Export"
  import: Import
  cancel: Cancel
  importing: Importing
  error:
    parse: Error reading file
    noFile: No file selected
    invalidFormat: Invalid file format. Please select a .csv file.
    import: Error importing data
  success: Import successful
  successDescription: "{folders} folders and {entries} entries imported"
</i18n>
