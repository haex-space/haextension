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

// Bitwarden JSON format
interface BitwardenJsonExport {
  encrypted?: boolean;
  folders?: Array<{
    id: string;
    name: string;
  }>;
  items?: Array<{
    id: string;
    organizationId?: string | null;
    folderId?: string | null;
    type: number; // 1 = Login, 2 = SecureNote, 3 = Card, 4 = Identity
    reprompt: number;
    name: string;
    notes?: string | null;
    favorite: boolean;
    login?: {
      uris?: Array<{
        match?: number | null;
        uri: string;
      }>;
      username?: string | null;
      password?: string | null;
      totp?: string | null;
    };
    card?: {
      cardholderName?: string | null;
      brand?: string | null;
      number?: string | null;
      expMonth?: string | null;
      expYear?: string | null;
      code?: string | null;
    };
    identity?: {
      title?: string | null;
      firstName?: string | null;
      middleName?: string | null;
      lastName?: string | null;
      address1?: string | null;
      address2?: string | null;
      address3?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
      company?: string | null;
      email?: string | null;
      phone?: string | null;
      ssn?: string | null;
      username?: string | null;
      passportNumber?: string | null;
      licenseNumber?: string | null;
    };
    secureNote?: {
      type: number;
    };
    fields?: Array<{
      name: string;
      value: string;
      type: number; // 0 = Text, 1 = Hidden, 2 = Boolean
      linkedId?: number | null;
    }>;
    collectionIds?: string[] | null;
  }>;
}

// Bitwarden CSV columns
interface BitwardenCsvRow {
  folder: string;
  favorite: string;
  type: string;
  name: string;
  notes: string;
  fields: string;
  reprompt: string;
  login_uri: string;
  login_username: string;
  login_password: string;
  login_totp: string;
}

function parseCSV(csvText: string): BitwardenCsvRow[] {
  const lines = csvText.split("\n");
  if (lines.length < 2) return [];

  // Parse header
  const header = parseCSVLine(lines[0] || "");
  const rows: BitwardenCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};

    header.forEach((col, idx) => {
      row[col] = values[idx] || "";
    });

    rows.push(row as unknown as BitwardenCsvRow);
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

// Parse OTP data from Bitwarden TOTP field
interface ParsedOtp {
  secret: string;
  digits: number;
  period: number;
  algorithm: string;
}

function parseOtpData(totp: string | null | undefined): ParsedOtp | null {
  if (!totp) return null;

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
    secret: totp.toUpperCase(),
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  };
}

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
      stats = await importBitwardenJsonAsync(fileData.value);
    } else {
      stats = await importBitwardenCsvAsync(fileData.value);
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

async function importBitwardenJsonAsync(
  jsonText: string
): Promise<{ folderCount: number; entryCount: number }> {
  const data: BitwardenJsonExport = JSON.parse(jsonText);

  if (data.encrypted) {
    throw new Error(t("error.encrypted"));
  }

  const { addGroupAsync } = usePasswordGroupStore();
  const haexVaultStore = useHaexVaultStore();
  const { orm } = storeToRefs(haexVaultStore);
  const tagStore = useTagStore();

  if (!orm.value) {
    throw new Error("Database not initialized");
  }

  // Create folder mapping
  const folderMapping = new Map<string, string>();
  const folders = data.folders || [];
  const items = data.items || [];

  const totalSteps = folders.length + items.length;
  let currentStep = 0;

  // Import folders
  for (const folder of folders) {
    const newGroup = await addGroupAsync({
      id: crypto.randomUUID(),
      name: folder.name,
      icon: "folder",
      parentId: null,
    });
    folderMapping.set(folder.id, newGroup.id);
    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Import items
  for (const item of items) {
    const groupId = item.folderId ? folderMapping.get(item.folderId) : null;
    const newEntryId = crypto.randomUUID();

    // Handle different item types
    if (item.type === 1) {
      // Login type
      const url = item.login?.uris?.[0]?.uri || "";
      const otpData = parseOtpData(item.login?.totp);

      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: item.name,
        username: item.login?.username || "",
        password: item.login?.password || "",
        url,
        note: item.notes || "",
        otpSecret: otpData?.secret || null,
        otpDigits: otpData?.digits || null,
        otpPeriod: otpData?.period || null,
        otpAlgorithm: otpData?.algorithm || null,
        icon: item.favorite ? "star" : null,
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Import custom fields
      if (item.fields && item.fields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          item.fields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.name,
            value: field.value,
          }))
        );
      }

      // Import additional URIs as custom fields
      if (item.login?.uris && item.login.uris.length > 1) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          item.login.uris.slice(1).map((uri, idx) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: `URL ${idx + 2}`,
            value: uri.uri,
          }))
        );
      }
    } else if (item.type === 2) {
      // SecureNote type
      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: item.name,
        username: "",
        password: "",
        url: "",
        note: item.notes || "",
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: item.favorite ? "star" : "file-text",
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      // Add secure-note tag
      await tagStore.addTagToItemAsync(newEntryId, "secure-note");

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Import custom fields
      if (item.fields && item.fields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          item.fields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.name,
            value: field.value,
          }))
        );
      }
    } else if (item.type === 3) {
      // Card type
      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: item.name,
        username: item.card?.cardholderName || "",
        password: item.card?.number || "",
        url: "",
        note: item.notes || "",
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: item.favorite ? "star" : "credit-card",
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      // Add credit-card tag
      await tagStore.addTagToItemAsync(newEntryId, "credit-card");

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Store card details as custom fields
      const cardFields: Array<{ key: string; value: string }> = [];
      if (item.card?.brand) cardFields.push({ key: "Brand", value: item.card.brand });
      if (item.card?.number) cardFields.push({ key: "Card Number", value: item.card.number });
      if (item.card?.expMonth) cardFields.push({ key: "Expiration Month", value: item.card.expMonth });
      if (item.card?.expYear) cardFields.push({ key: "Expiration Year", value: item.card.expYear });
      if (item.card?.code) cardFields.push({ key: "CVV", value: item.card.code });

      if (cardFields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          cardFields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.key,
            value: field.value,
          }))
        );
      }

      // Import additional custom fields
      if (item.fields && item.fields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          item.fields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.name,
            value: field.value,
          }))
        );
      }
    } else if (item.type === 4) {
      // Identity type
      const fullName = [
        item.identity?.firstName,
        item.identity?.middleName,
        item.identity?.lastName,
      ]
        .filter(Boolean)
        .join(" ");

      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: item.name,
        username: item.identity?.username || item.identity?.email || "",
        password: "",
        url: "",
        note: item.notes || "",
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: item.favorite ? "star" : "user",
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      // Add identity tag
      await tagStore.addTagToItemAsync(newEntryId, "identity");

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Store identity details as custom fields
      const identityFields: Array<{ key: string; value: string }> = [];
      if (item.identity?.title) identityFields.push({ key: "Title", value: item.identity.title });
      if (fullName) identityFields.push({ key: "Full Name", value: fullName });
      if (item.identity?.firstName) identityFields.push({ key: "First Name", value: item.identity.firstName });
      if (item.identity?.middleName) identityFields.push({ key: "Middle Name", value: item.identity.middleName });
      if (item.identity?.lastName) identityFields.push({ key: "Last Name", value: item.identity.lastName });
      if (item.identity?.email) identityFields.push({ key: "Email", value: item.identity.email });
      if (item.identity?.phone) identityFields.push({ key: "Phone", value: item.identity.phone });
      if (item.identity?.company) identityFields.push({ key: "Company", value: item.identity.company });
      if (item.identity?.ssn) identityFields.push({ key: "SSN", value: item.identity.ssn });
      if (item.identity?.passportNumber) identityFields.push({ key: "Passport Number", value: item.identity.passportNumber });
      if (item.identity?.licenseNumber) identityFields.push({ key: "License Number", value: item.identity.licenseNumber });

      // Address fields
      const addressParts = [
        item.identity?.address1,
        item.identity?.address2,
        item.identity?.address3,
      ].filter(Boolean);
      if (addressParts.length > 0) identityFields.push({ key: "Address", value: addressParts.join("\n") });
      if (item.identity?.city) identityFields.push({ key: "City", value: item.identity.city });
      if (item.identity?.state) identityFields.push({ key: "State", value: item.identity.state });
      if (item.identity?.postalCode) identityFields.push({ key: "Postal Code", value: item.identity.postalCode });
      if (item.identity?.country) identityFields.push({ key: "Country", value: item.identity.country });

      if (identityFields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          identityFields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.key,
            value: field.value,
          }))
        );
      }

      // Import additional custom fields
      if (item.fields && item.fields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          item.fields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.name,
            value: field.value,
          }))
        );
      }
    }

    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Sync data
  const { syncGroupItemsAsync } = usePasswordGroupStore();
  await syncGroupItemsAsync();

  return {
    folderCount: folders.length,
    entryCount: items.length,
  };
}

async function importBitwardenCsvAsync(
  csvText: string
): Promise<{ folderCount: number; entryCount: number }> {
  const rows = parseCSV(csvText);

  const { addGroupAsync } = usePasswordGroupStore();
  const haexVaultStore = useHaexVaultStore();
  const { orm } = storeToRefs(haexVaultStore);
  const tagStore = useTagStore();

  if (!orm.value) {
    throw new Error("Database not initialized");
  }

  // Collect unique folders
  const folderNames = new Set<string>();
  for (const row of rows) {
    if (row.folder && row.folder.trim()) {
      folderNames.add(row.folder.trim());
    }
  }

  const folderMapping = new Map<string, string>();
  const totalSteps = folderNames.size + rows.length;
  let currentStep = 0;

  // Create folders
  for (const folderName of folderNames) {
    const newGroup = await addGroupAsync({
      id: crypto.randomUUID(),
      name: folderName,
      icon: "folder",
      parentId: null,
    });
    folderMapping.set(folderName, newGroup.id);
    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Import entries
  let entryCount = 0;
  for (const row of rows) {
    const groupId = row.folder ? folderMapping.get(row.folder.trim()) : null;
    const newEntryId = crypto.randomUUID();
    const itemType = (row.type || "login").toLowerCase();

    if (itemType === "login") {
      // Login type
      const otpData = parseOtpData(row.login_totp);

      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: row.name || "",
        username: row.login_username || "",
        password: row.login_password || "",
        url: row.login_uri || "",
        note: row.notes || "",
        otpSecret: otpData?.secret || null,
        otpDigits: otpData?.digits || null,
        otpPeriod: otpData?.period || null,
        otpAlgorithm: otpData?.algorithm || null,
        icon: row.favorite === "1" ? "star" : null,
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Parse and import custom fields
      if (row.fields && row.fields.trim()) {
        const customFields = parseCustomFields(row.fields);
        if (customFields.length > 0) {
          await orm.value.insert(haexPasswordsItemKeyValues).values(
            customFields.map((field) => ({
              id: crypto.randomUUID(),
              itemId: newEntryId,
              key: field.name,
              value: field.value,
            }))
          );
        }
      }
    } else if (itemType === "note" || itemType === "securenote") {
      // SecureNote type
      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: row.name || "Secure Note",
        username: "",
        password: "",
        url: "",
        note: row.notes || "",
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: row.favorite === "1" ? "star" : "file-text",
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      // Add secure-note tag
      await tagStore.addTagToItemAsync(newEntryId, "secure-note");

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Parse and import custom fields
      if (row.fields && row.fields.trim()) {
        const customFields = parseCustomFields(row.fields);
        if (customFields.length > 0) {
          await orm.value.insert(haexPasswordsItemKeyValues).values(
            customFields.map((field) => ({
              id: crypto.randomUUID(),
              itemId: newEntryId,
              key: field.name,
              value: field.value,
            }))
          );
        }
      }
    } else if (itemType === "card") {
      // Card type - CSV export has limited card data
      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: row.name || "Credit Card",
        username: "",
        password: "",
        url: "",
        note: row.notes || "",
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: row.favorite === "1" ? "star" : "credit-card",
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      // Add credit-card tag
      await tagStore.addTagToItemAsync(newEntryId, "credit-card");

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Parse and import custom fields (card details are stored here in CSV)
      if (row.fields && row.fields.trim()) {
        const customFields = parseCustomFields(row.fields);
        if (customFields.length > 0) {
          await orm.value.insert(haexPasswordsItemKeyValues).values(
            customFields.map((field) => ({
              id: crypto.randomUUID(),
              itemId: newEntryId,
              key: field.name,
              value: field.value,
            }))
          );
        }
      }
    } else if (itemType === "identity") {
      // Identity type - CSV export has limited identity data
      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: row.name || "Identity",
        username: "",
        password: "",
        url: "",
        note: row.notes || "",
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: row.favorite === "1" ? "star" : "user",
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      // Add identity tag
      await tagStore.addTagToItemAsync(newEntryId, "identity");

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Parse and import custom fields (identity details are stored here in CSV)
      if (row.fields && row.fields.trim()) {
        const customFields = parseCustomFields(row.fields);
        if (customFields.length > 0) {
          await orm.value.insert(haexPasswordsItemKeyValues).values(
            customFields.map((field) => ({
              id: crypto.randomUUID(),
              itemId: newEntryId,
              key: field.name,
              value: field.value,
            }))
          );
        }
      }
    } else {
      // Unknown type - skip
      currentStep++;
      progress.value = Math.round((currentStep / totalSteps) * 100);
      continue;
    }

    entryCount++;
    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Sync data
  const { syncGroupItemsAsync } = usePasswordGroupStore();
  await syncGroupItemsAsync();

  return {
    folderCount: folderNames.size,
    entryCount,
  };
}

function parseCustomFields(
  fieldsStr: string
): Array<{ name: string; value: string }> {
  // Bitwarden CSV format for fields: "fieldName: fieldValue\nfieldName2: fieldValue2"
  const result: Array<{ name: string; value: string }> = [];
  const lines = fieldsStr.split("\n");

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      result.push({
        name: line.substring(0, colonIdx).trim(),
        value: line.substring(colonIdx + 1).trim(),
      });
    }
  }

  return result;
}

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
