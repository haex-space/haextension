import type { Ref } from "vue";
import {
  haexPasswordsItemDetails,
  haexPasswordsGroupItems,
  haexPasswordsItemKeyValues,
} from "~/database/schemas/index";
import { parseOtpData } from "./bitwardenOtp";

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

export async function importBitwardenCsvAsync(
  csvText: string,
  progress: Ref<number>
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
