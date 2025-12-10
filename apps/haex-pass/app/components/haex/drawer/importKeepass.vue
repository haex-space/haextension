<template>
  <UiDrawer v-model:open="isOpen">
    <UiDrawerContent>
      <UiDrawerHeader>
        <UiDrawerTitle>{{ t("title") }}</UiDrawerTitle>
        <UiDrawerDescription>{{ t("selectFile") }}</UiDrawerDescription>
      </UiDrawerHeader>

      <div class="p-4 space-y-4 overflow-y-auto">
        <!-- File Upload -->
        <div class="space-y-2">
          <UiLabel>{{ t("kdbxFile") }}</UiLabel>
          <input
            ref="fileInput"
            type="file"
            accept=".kdbx"
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
        </div>

        <!-- Password Input -->
        <div v-if="fileData" class="space-y-2">
          <UiLabel>{{ t("password") }}</UiLabel>
          <UiInputGroup>
            <UiInputGroupInput
              ref="passwordInput"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :placeholder="t('passwordPlaceholder')"
              autofocus
              @keyup.enter="canImport && importAsync()"
            />
            <UiInputGroupButton
              :icon="showPassword ? EyeOff : Eye"
              variant="ghost"
              @click="showPassword = !showPassword"
            />
          </UiInputGroup>
        </div>

        <!-- Import Progress -->
        <div v-if="importing" class="space-y-2">
          <UiProgress v-model="progress" />
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

      <UiDrawerFooter>
        <UiButton :disabled="!canImport" @click="importAsync">
          {{ t("import") }}
        </UiButton>
        <UiButton variant="outline" @click="isOpen = false">
          {{ t("cancel") }}
        </UiButton>
      </UiDrawerFooter>
    </UiDrawerContent>
  </UiDrawer>
</template>

<script setup lang="ts">
import * as kdbxweb from "kdbxweb";
import { argon2id, argon2i, argon2d } from "hash-wasm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { toast } from "vue-sonner";
import { File, Eye, EyeOff } from "lucide-vue-next";
import { addBinaryAsync } from "~/utils/cleanup";
import {
  haexPasswordsItemDetails,
  haexPasswordsGroupItems,
  haexPasswordsItemKeyValues,
  haexPasswordsItemBinaries,
  haexPasswordsItemSnapshots,
  haexPasswordsSnapshotBinaries,
  type SelectHaexPasswordsItemKeyValues,
} from "~/database/schemas/index";
import type * as schema from "~/database/schemas/index";
import { getIconForKeePassIndex } from "~/utils/keepassIconMapping";
import { trashId } from "~/stores/groupItems/groups";

// Set argon2 implementation for kdbxweb using hash-wasm
// Argon2 types: 0 = Argon2d, 1 = Argon2i, 2 = Argon2id
kdbxweb.CryptoEngine.argon2 = async (
  password: ArrayBuffer,
  salt: ArrayBuffer,
  memory: number,
  iterations: number,
  length: number,
  parallelism: number,
  type: number
) => {
  console.log("[Argon2] Called with:", {
    memory,
    iterations,
    length,
    parallelism,
    type,
  });

  try {
    const params = {
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      parallelism: parallelism,
      iterations: iterations,
      memorySize: memory,
      hashLength: length,
      outputType: "binary" as const,
    };

    console.log("[Argon2] password length:", params.password.length);
    console.log("[Argon2] salt length:", params.salt.length);

    let result: Uint8Array;

    // Select the correct Argon2 variant based on type parameter
    if (type === 0) {
      // Argon2d
      console.log("[Argon2] Using Argon2d");
      result = await argon2d(params);
    } else if (type === 1) {
      // Argon2i
      console.log("[Argon2] Using Argon2i");
      result = await argon2i(params);
    } else {
      // Argon2id (default, type === 2)
      console.log("[Argon2] Using Argon2id");
      result = await argon2id(params);
    }

    console.log("[Argon2] Result length:", result.byteLength);

    // Convert Uint8Array to ArrayBuffer (create a new copy)
    const arrayBuffer = new ArrayBuffer(result.byteLength);
    const view = new Uint8Array(arrayBuffer);
    view.set(result);

    console.log(
      "[Argon2] Returning ArrayBuffer with length:",
      arrayBuffer.byteLength
    );
    return arrayBuffer;
  } catch (error) {
    console.error("[Argon2] Error:", error);
    throw error;
  }
};

const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useI18n();

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const fileData = ref<ArrayBuffer | null>(null);
const selectedFileName = ref<string | null>(null);
const password = ref("");
const showPassword = ref(false);
const importing = ref(false);
const progress = ref(0);
const error = ref<string | null>(null);

// Computed: Can import when file and password are provided
const canImport = computed(() => {
  return !!fileData.value && !!password.value && !importing.value;
});

const onFileChangeAsync = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) {
    selectedFileName.value = null;
    return;
  }

  selectedFileName.value = file.name;

  error.value = null;
  password.value = "";

  try {
    const buffer = await file.arrayBuffer();
    fileData.value = buffer;
    // Password input will auto-focus via autofocus prop
  } catch (err) {
    error.value = t("error.parse");
    console.error(err);
  }
};

const importAsync = async () => {
  if (!fileData.value) {
    error.value = t("error.noFile");
    return;
  }

  if (!password.value) {
    error.value = t("error.noPassword");
    return;
  }

  importing.value = true;
  progress.value = 0;
  error.value = null;

  try {
    const stats = await importKdbxAsync(fileData.value, password.value);

    toast.success(t("success"), {
      description: t("successDescription", {
        groups: stats.groupCount,
        entries: stats.entryCount,
      }),
    });

    isOpen.value = false;
    fileData.value = null;
    password.value = "";
    selectedFileName.value = null;
  } catch (err) {
    console.error("[KeePass Import] Error:", err);
    console.error(
      "[KeePass Import] Error stack:",
      err instanceof Error ? err.stack : undefined
    );
    console.error(
      "[KeePass Import] Error message:",
      err instanceof Error ? err.message : String(err)
    );
    // Log the underlying cause if it's a DrizzleQueryError
    if (err instanceof Error && "cause" in err) {
      console.error("[KeePass Import] Error cause:", err.cause);
    }

    const errorMessage = err instanceof Error ? err.message : String(err);

    if (
      errorMessage.includes("InvalidKey") ||
      errorMessage.includes("password")
    ) {
      error.value = t("error.wrongPassword");
    } else {
      error.value = t("error.import") + ": " + errorMessage;
    }
  } finally {
    importing.value = false;
    progress.value = 0;
  }
};

// Helper function to extract field value from kdbxweb
function getFieldValue(field: kdbxweb.KdbxEntryField | undefined): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (field instanceof kdbxweb.ProtectedValue) return field.getText();
  // Fallback for any other type
  return String(field);
}

// Helper function to convert KeePass hex UUID (32 chars) to standard UUID format (8-4-4-4-12)
function hexToStandardUuid(hex: string): string {
  const lower = hex.toLowerCase();
  return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(
    12,
    16
  )}-${lower.slice(16, 20)}-${lower.slice(20, 32)}`;
}

// Helper function to migrate KeePass references to new format
function migrateKeePassReferences(value: string): string {
  if (!value) return value;

  // KeePass reference patterns and their mappings to new format
  // KeePass uses 32-char hex UUIDs without dashes, we convert them to standard UUID format
  const migrations: Array<{
    pattern: RegExp;
    replacer: (match: string, uuid: string) => string;
  }> = [
    // Title: {REF:T@I:uuid} or {REF:T@E:uuid} -> {REF:TITLE@ITEM:uuid}
    {
      pattern: /\{REF:T@[IE]:([A-F0-9]{32})\}/gi,
      replacer: (_, uuid) => `{REF:TITLE@ITEM:${hexToStandardUuid(uuid)}}`,
    },

    // Username: {REF:U@I:uuid} or {REF:U@E:uuid} -> {REF:USERNAME@ITEM:uuid}
    {
      pattern: /\{REF:U@[IE]:([A-F0-9]{32})\}/gi,
      replacer: (_, uuid) => `{REF:USERNAME@ITEM:${hexToStandardUuid(uuid)}}`,
    },

    // Password: {REF:P@I:uuid} or {REF:P@E:uuid} -> {REF:PASSWORD@ITEM:uuid}
    {
      pattern: /\{REF:P@[IE]:([A-F0-9]{32})\}/gi,
      replacer: (_, uuid) => `{REF:PASSWORD@ITEM:${hexToStandardUuid(uuid)}}`,
    },

    // URL: {REF:A@I:uuid} or {REF:A@E:uuid} -> {REF:URL@ITEM:uuid}
    {
      pattern: /\{REF:A@[IE]:([A-F0-9]{32})\}/gi,
      replacer: (_, uuid) => `{REF:URL@ITEM:${hexToStandardUuid(uuid)}}`,
    },

    // Notes: {REF:N@I:uuid} or {REF:N@E:uuid} -> {REF:NOTE@ITEM:uuid}
    {
      pattern: /\{REF:N@[IE]:([A-F0-9]{32})\}/gi,
      replacer: (_, uuid) => `{REF:NOTE@ITEM:${hexToStandardUuid(uuid)}}`,
    },

    // Group name: {REF:T@G:uuid} -> {REF:NAME@GROUP:uuid}
    {
      pattern: /\{REF:T@G:([A-F0-9]{32})\}/gi,
      replacer: (_, uuid) => `{REF:NAME@GROUP:${hexToStandardUuid(uuid)}}`,
    },

    // Group notes: {REF:N@G:uuid} -> {REF:DESCRIPTION@GROUP:uuid}
    {
      pattern: /\{REF:N@G:([A-F0-9]{32})\}/gi,
      replacer: (_, uuid) =>
        `{REF:DESCRIPTION@GROUP:${hexToStandardUuid(uuid)}}`,
    },
  ];

  let migratedValue = value;
  for (const { pattern, replacer } of migrations) {
    migratedValue = migratedValue.replace(pattern, replacer);
  }

  return migratedValue;
}

// Type for KeePass binary values (can be ProtectedValue or wrapper object)
interface IKdbxBinaryValue {
  value?: kdbxweb.ProtectedValue | ArrayBuffer;
}

// Type for snapshot data stored in JSON (subset of ItemDetails + keyValues)
interface ISnapshotData {
  title: string;
  username: string;
  password: string;
  url: string;
  note: string;
  icon: string | null;
  tags: string | null;
  otpSecret: string | null;
  otpDigits: number | null;
  otpPeriod: number | null;
  otpAlgorithm: string | null;
  keyValues: Array<Pick<SelectHaexPasswordsItemKeyValues, "key" | "value">>;
}

// Type for parsed OTP data from otpauth:// URI
interface IParsedOtp {
  secret: string;
  digits: number;
  period: number;
  algorithm: string;
}

/**
 * Parse otpauth:// URI to extract secret, digits, period, and algorithm
 * Format: otpauth://totp/LABEL?secret=SECRET&digits=6&period=30&algorithm=SHA1
 */
function parseOtpAuthUri(uri: string): IParsedOtp | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "otpauth:") return null;

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

/**
 * Extract OTP data from KeePass entry
 * Checks: otp/OTP field (may be full URI or just secret), TOTP Seed field, or otpauth:// in notes
 */
function extractOtpFromEntry(
  entry: kdbxweb.KdbxEntry,
  notes: string
): IParsedOtp | null {
  // Check otp/OTP field first
  const otpField = entry.fields.get("otp") || entry.fields.get("OTP");
  if (otpField) {
    const otpValue = getFieldValue(otpField);
    if (otpValue) {
      // Check if it's a full otpauth:// URI
      if (otpValue.startsWith("otpauth://")) {
        return parseOtpAuthUri(otpValue);
      }
      // Just a secret - use defaults
      return {
        secret: otpValue.toUpperCase(),
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      };
    }
  }

  // Check TOTP Seed field (KeePass 2.x format)
  const totpSeed =
    entry.fields.get("TOTP Seed") || entry.fields.get("totp-secret");
  if (totpSeed) {
    const seedValue = getFieldValue(totpSeed);
    if (seedValue) {
      // Check for TOTP Settings field (KeePass format: "30;6" for period;digits)
      const totpSettings =
        entry.fields.get("TOTP Settings") || entry.fields.get("totp-settings");
      let digits = 6;
      let period = 30;
      if (totpSettings) {
        const settingsValue = getFieldValue(totpSettings);
        if (settingsValue) {
          const parts = settingsValue.split(";");
          if (parts?.[0]) period = parseInt(parts[0], 10) || 30;
          if (parts?.[1]) digits = parseInt(parts[1], 10) || 6;
        }
      }
      return {
        secret: seedValue.toUpperCase(),
        digits,
        period,
        algorithm: "SHA1",
      };
    }
  }

  // Check notes for otpauth:// URI
  if (notes && typeof notes === "string") {
    const otpMatch = notes.match(/otpauth:\/\/totp\/[^\s]+/i);
    if (otpMatch) {
      return parseOtpAuthUri(otpMatch[0]);
    }
  }

  return null;
}

// Type guard to check if a value has a 'value' property
function hasValueProperty(
  binary: kdbxweb.ProtectedValue | IKdbxBinaryValue | ArrayBuffer
): binary is IKdbxBinaryValue {
  return (
    typeof binary === "object" &&
    binary !== null &&
    "value" in binary &&
    !(binary instanceof kdbxweb.ProtectedValue) &&
    !(binary instanceof ArrayBuffer)
  );
}

// Helper function to extract Uint8Array from various KeePass binary formats
function extractBinaryData(
  binary: kdbxweb.ProtectedValue | IKdbxBinaryValue | ArrayBuffer
): Uint8Array {
  if (binary instanceof kdbxweb.ProtectedValue) {
    return binary.getBinary();
  }

  if (
    hasValueProperty(binary) &&
    binary.value instanceof kdbxweb.ProtectedValue
  ) {
    return binary.value.getBinary();
  }

  // Handle raw ArrayBuffer or object with ArrayBuffer value
  const binaryValue = hasValueProperty(binary)
    ? binary.value || binary
    : binary;
  return new Uint8Array(binaryValue as ArrayBuffer);
}

// Helper function to convert KeePass Base64 UUID to standard UUID format
// KeePass uses Base64-encoded 16-byte UUIDs, we need to convert to standard UUID string
function kdbxUuidToStandardUuid(kdbxUuid: kdbxweb.KdbxUuid): string {
  // kdbxweb.KdbxUuid.id is already a Base64 string representation
  // We need to decode it and convert to standard UUID format (8-4-4-4-12)
  const base64 = kdbxUuid.id;

  // Decode Base64 to bytes
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Convert 16 bytes to standard UUID format
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Format as UUID: 8-4-4-4-12
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Helper function to convert Uint8Array to Base64 (handles large files)
function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binaryString = "";
  const chunkSize = 8192; // Process 8KB at a time to avoid stack overflow
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(
      i,
      Math.min(i + chunkSize, uint8Array.length)
    );
    binaryString += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binaryString);
}

// Helper function to extract and store icon from KeePass
async function extractIconAsync(
  kdbx: kdbxweb.Kdbx,
  item: kdbxweb.KdbxGroup | kdbxweb.KdbxEntry,
  orm: SqliteRemoteDatabase<typeof schema>
): Promise<string | null> {
  let icon: string | null = null;

  // Check for custom icon first
  if (item.customIcon && item.customIcon.id) {
    const customIconData = kdbx.meta.customIcons.get(item.customIcon.id);
    if (customIconData) {
      // Convert ArrayBuffer to Base64
      const uint8Array = new Uint8Array(customIconData.data);
      const base64 = uint8ArrayToBase64(uint8Array);

      // Store as binary with type 'icon' and reference it
      const hash = await addBinaryAsync(orm, base64, uint8Array.length, "icon");
      icon = `binary:${hash}`;
      console.log("[KeePass Import] Custom icon stored:", icon);
    }
  }

  // Fallback to standard icon
  if (!icon && item.icon !== undefined && item.icon !== null) {
    const mappedIcon = getIconForKeePassIndex(item.icon);
    icon = mappedIcon;
    console.log(
      `[KeePass Import] Standard icon mapped: index ${item.icon} → ${icon}`
    );
  }

  if (!icon) {
    console.log("[KeePass Import] No icon found for item");
  }

  return icon;
}

async function importKdbxAsync(
  buffer: ArrayBuffer,
  pwd: string
): Promise<{ groupCount: number; entryCount: number }> {
  console.log("[KeePass Import] Starting import...");
  console.log("[KeePass Import] Buffer size:", buffer.byteLength);
  console.log("[KeePass Import] Password length:", pwd.length);

  const credentials = new kdbxweb.Credentials(
    kdbxweb.ProtectedValue.fromString(pwd)
  );
  console.log("[KeePass Import] Credentials created, loading database...");

  const kdbx = await kdbxweb.Kdbx.load(buffer, credentials);
  console.log("[KeePass Import] Database loaded successfully");

  const { addGroupAsync } = usePasswordGroupStore();
  const haexhubStore = useHaexVaultStore();
  const { orm } = storeToRefs(haexhubStore);

  if (!orm.value) {
    throw new Error("Database not initialized");
  }

  // Group mapping: KeePass UUID → haex Group ID
  const groupMapping = new Map<string, string>();

  // Identify KeePass Recycle Bin UUID (converted to standard UUID format)
  const recycleBinUuid =
    kdbx.meta.recycleBinEnabled && kdbx.meta.recycleBinUuid
      ? kdbxUuidToStandardUuid(kdbx.meta.recycleBinUuid)
      : null;

  console.log(
    "[KeePass Import] Recycle Bin enabled:",
    kdbx.meta.recycleBinEnabled
  );
  console.log("[KeePass Import] Recycle Bin UUID:", recycleBinUuid);

  // Ensure trash folder exists if KeePass has a recycle bin
  if (recycleBinUuid) {
    const { createTrashIfNotExistsAsync } = useGroupItemsDeleteStore();
    await createTrashIfNotExistsAsync();
    console.log("[KeePass Import] Ensured trash folder exists");
  }

  // Collect all groups
  const allGroups: Array<{
    group: kdbxweb.KdbxGroup;
    parentUuid: string | null;
  }> = [];

  function collectGroups(
    group: kdbxweb.KdbxGroup,
    parentUuid: string | null = null
  ) {
    // Skip Root group
    if (group.name !== "Root") {
      allGroups.push({ group, parentUuid });
    }

    for (const subGroup of group.groups) {
      collectGroups(subGroup, kdbxUuidToStandardUuid(group.uuid));
    }
  }

  collectGroups(kdbx.getDefaultGroup());

  const allEntries = Array.from(kdbx.getDefaultGroup().allEntries());
  const totalSteps = allGroups.length + allEntries.length;
  let currentStep = 0;

  // Create groups (parent groups first) - use original KeePass UUIDs
  // Map KeePass Recycle Bin to local trash folder
  for (const { group, parentUuid } of allGroups) {
    const groupUuid = kdbxUuidToStandardUuid(group.uuid);

    // Check if this group is the KeePass Recycle Bin
    const isRecycleBin = recycleBinUuid && groupUuid === recycleBinUuid;

    if (isRecycleBin) {
      // Map KeePass Recycle Bin to local trash folder (don't create a new group)
      console.log(
        "[KeePass Import] Mapping Recycle Bin to local trash:",
        group.name
      );
      groupMapping.set(groupUuid, trashId);
      currentStep++;
      progress.value = Math.round((currentStep / totalSteps) * 100);
      continue;
    }

    // Resolve parent ID using groupMapping
    // If parent was Recycle Bin, it's already mapped to trashId
    // Child folders keep their structure but are now under trashId
    const parentId = parentUuid
      ? groupMapping.get(parentUuid) || parentUuid
      : null;

    // Extract icon from KeePass
    const icon = await extractIconAsync(kdbx, group, orm.value!);

    const newGroup = await addGroupAsync({
      id: groupUuid, // Use converted KeePass UUID
      name: group.name,
      icon,
      parentId,
    });

    groupMapping.set(groupUuid, newGroup.id);
    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Import entries with attachments and history
  for (const entry of allEntries) {
    const parentGroupUuid = entry.parentGroup
      ? kdbxUuidToStandardUuid(entry.parentGroup.uuid)
      : null;
    const groupId = parentGroupUuid
      ? groupMapping.get(parentGroupUuid) || null
      : null;

    // Extract fields and migrate KeePass references
    const title = migrateKeePassReferences(
      getFieldValue(entry.fields.get("Title"))
    );
    const username = migrateKeePassReferences(
      getFieldValue(entry.fields.get("UserName"))
    );
    const password = migrateKeePassReferences(
      getFieldValue(entry.fields.get("Password"))
    );
    const url = migrateKeePassReferences(
      getFieldValue(entry.fields.get("URL"))
    );
    const notes = migrateKeePassReferences(
      getFieldValue(entry.fields.get("Notes"))
    );
    const tags = entry.tags?.join(", ") || null;

    // Extract OTP data (secret, digits, period, algorithm)
    const otpData = extractOtpFromEntry(entry, notes);
    const otpSecret = otpData?.secret || null;
    const otpDigits = otpData?.digits || null;
    const otpPeriod = otpData?.period || null;
    const otpAlgorithm = otpData?.algorithm || null;

    // Custom fields (alle außer Standard-Felder)
    const keyValues: SelectHaexPasswordsItemKeyValues[] = [];
    const standardFields = new Set([
      "Title",
      "UserName",
      "Password",
      "URL",
      "Notes",
    ]);

    for (const [key, value] of entry.fields) {
      if (!standardFields.has(key) && key !== "otp" && key !== "OTP") {
        keyValues.push({
          id: crypto.randomUUID(),
          itemId: null,
          key,
          value: migrateKeePassReferences(getFieldValue(value)),
          updateAt: null,
        });
      }
    }

    // Extract icon from KeePass
    const icon = await extractIconAsync(kdbx, entry, orm.value!);

    console.log("[KeePass Import] Creating entry:", title);
    console.log(
      "[KeePass Import] Entry has",
      entry.history.length,
      "history entries"
    );

    // Create entry manually to have control over snapshot creation
    // Use converted KeePass UUID
    const newEntryId = kdbxUuidToStandardUuid(entry.uuid);

    // Insert item details
    // createdAt is a string field, updateAt is an integer timestamp field (expects Date object)
    // Handle various possible formats from KeePass: Date, number (Unix timestamp), or undefined
    let updateAtDate: Date | null = null;
    if (entry.times.lastModTime) {
      console.log(
        "[KeePass Import] lastModTime type:",
        typeof entry.times.lastModTime,
        entry.times.lastModTime
      );
      if (entry.times.lastModTime instanceof Date) {
        updateAtDate = entry.times.lastModTime;
      } else if (typeof entry.times.lastModTime === "number") {
        // Unix timestamp in seconds, convert to Date
        updateAtDate = new Date(entry.times.lastModTime * 1000);
      } else {
        updateAtDate = new Date(entry.times.lastModTime as unknown as string);
      }
      console.log("[KeePass Import] updateAtDate:", updateAtDate);
    }

    await orm.value!.insert(haexPasswordsItemDetails).values({
      id: newEntryId,
      title,
      username,
      password,
      url,
      note: notes,
      otpSecret,
      otpDigits,
      otpPeriod,
      otpAlgorithm,
      icon,
      color: null,
      tags,
      createdAt: entry.times.creationTime
        ? new Date(entry.times.creationTime).toISOString()
        : null,
      updateAt: updateAtDate,
    });

    // Insert group item relation
    await orm.value!.insert(haexPasswordsGroupItems).values({
      itemId: newEntryId,
      groupId: groupId || null,
    });

    // Insert key values
    if (keyValues.length > 0) {
      await orm.value!.insert(haexPasswordsItemKeyValues).values(
        keyValues.map((kv) => ({
          id: crypto.randomUUID(),
          itemId: newEntryId,
          key: kv.key,
          value: kv.value,
        }))
      );
    }

    console.log("[KeePass Import] Created entry with ID:", newEntryId);

    // Attachments importieren
    for (const [fileName, binary] of entry.binaries) {
      console.log(`[KeePass Import] Processing binary: ${fileName}`);
      console.log(`[KeePass Import] Binary object:`, binary);

      const uint8Array = extractBinaryData(binary);

      console.log(`[KeePass Import] Uint8Array:`, uint8Array);
      console.log(`[KeePass Import] Uint8Array length:`, uint8Array.length);

      // Skip empty binaries
      if (uint8Array.length === 0) {
        console.warn(`[KeePass Import] Skipping empty binary: ${fileName}`);
        continue;
      }

      // Convert to Base64
      const base64 = uint8ArrayToBase64(uint8Array);

      // Binary hinzufügen (dedupliziert via Hash)
      const hash = await addBinaryAsync(orm.value!, base64, uint8Array.length);

      // Entry → Binary Mapping
      await orm.value!.insert(haexPasswordsItemBinaries).values({
        id: crypto.randomUUID(),
        itemId: newEntryId,
        binaryHash: hash,
        fileName,
      });
    }

    // Entry History importieren
    console.log(
      "[KeePass Import] Importing",
      entry.history.length,
      "history entries for:",
      title
    );
    for (let i = 0; i < entry.history.length; i++) {
      const historyEntry = entry.history[i];
      if (!historyEntry) {
        console.warn(
          `[KeePass Import] Skipping undefined history entry ${i + 1}`
        );
        continue;
      }

      console.log(
        `[KeePass Import] Processing history entry ${i + 1}/${
          entry.history.length
        }`
      );

      // Extract icon from history entry
      const historyIcon = await extractIconAsync(
        kdbx,
        historyEntry,
        orm.value!
      );

      // Extract OTP data from history entry
      const historyNotes = getFieldValue(historyEntry.fields.get("Notes"));
      const historyOtpData = extractOtpFromEntry(historyEntry, historyNotes);

      const snapshotData: ISnapshotData = {
        title: getFieldValue(historyEntry.fields.get("Title")),
        username: getFieldValue(historyEntry.fields.get("UserName")),
        password: getFieldValue(historyEntry.fields.get("Password")),
        url: getFieldValue(historyEntry.fields.get("URL")),
        note: historyNotes,
        icon: historyIcon,
        tags: historyEntry.tags?.join(", ") || null,
        otpSecret: historyOtpData?.secret || null,
        otpDigits: historyOtpData?.digits || null,
        otpPeriod: historyOtpData?.period || null,
        otpAlgorithm: historyOtpData?.algorithm || null,
        keyValues: [],
      };

      // Custom fields in Snapshot
      for (const [key, value] of historyEntry.fields) {
        if (!standardFields.has(key)) {
          snapshotData.keyValues.push({
            key,
            value: getFieldValue(value),
          });
        }
      }

      const snapshotId = crypto.randomUUID();

      // Build the values object with proper string type for snapshotData
      const snapshotDataString = JSON.stringify(snapshotData);

      const snapshotValues: schema.InsertHaexPasswordsItemSnapshots = {
        id: snapshotId,
        itemId: newEntryId,
        snapshotData: snapshotDataString,
        createdAt: historyEntry?.times.creationTime
          ? new Date(historyEntry.times.creationTime).toISOString()
          : new Date().toISOString(),
        modifiedAt: historyEntry?.times.lastModTime
          ? new Date(historyEntry.times.lastModTime).toISOString()
          : null,
      };

      console.log(`[KeePass Import] Inserting snapshot ${i + 1}:`, {
        id: snapshotValues.id,
        itemId: snapshotValues.itemId,
        snapshotDataType: typeof snapshotValues.snapshotData,
        snapshotDataLength: snapshotValues.snapshotData.length,
        createdAt: snapshotValues.createdAt,
        modifiedAt: snapshotValues.modifiedAt,
      });

      let snapshot;
      try {
        // Use Drizzle ORM with .returning() - SDK v1.9.0+ supports this correctly
        snapshot = await orm
          .value!.insert(haexPasswordsItemSnapshots)
          .values({
            id: snapshotId,
            itemId: newEntryId,
            snapshotData: snapshotDataString,
            createdAt: snapshotValues.createdAt,
            modifiedAt: snapshotValues.modifiedAt,
          })
          .returning();

        console.log(
          `[KeePass Import] Successfully inserted snapshot ${i + 1}/${
            entry.history.length
          }`
        );
      } catch (err) {
        console.error(
          `[KeePass Import] Failed to insert snapshot ${i + 1}:`,
          err
        );
        throw err;
      }

      // History Attachments
      if (snapshot && snapshot[0]) {
        for (const [fileName, binary] of historyEntry.binaries) {
          const uint8Array = extractBinaryData(binary);

          // Skip empty binaries
          if (uint8Array.length === 0) {
            console.warn(
              `[KeePass Import] Skipping empty history binary: ${fileName}`
            );
            continue;
          }

          // Convert to Base64
          const base64 = uint8ArrayToBase64(uint8Array);

          const hash = await addBinaryAsync(
            orm.value!,
            base64,
            uint8Array.length
          );

          await orm.value!.insert(haexPasswordsSnapshotBinaries).values({
            id: crypto.randomUUID(),
            snapshotId: snapshot[0].id,
            binaryHash: hash,
            fileName,
          });
        }
      }
    }

    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Sync data
  const { syncGroupItemsAsync } = usePasswordGroupStore();
  await syncGroupItemsAsync();

  return {
    groupCount: allGroups.length,
    entryCount: allEntries.length,
  };
}

// Reset state when drawer closes
watch(isOpen, (newValue) => {
  if (!newValue) {
    fileData.value = null;
    selectedFileName.value = null;
    password.value = "";
    error.value = null;
    importing.value = false;
    progress.value = 0;
    showPassword.value = false;
  }
});
</script>

<i18n lang="yaml">
de:
  title: KeePass Import
  selectFile: KeePass-Datei auswählen (.kdbx)
  kdbxFile: KDBX-Datei
  chooseFile: Datei auswählen
  password: Master-Passwort
  passwordPlaceholder: Gib dein KeePass Master-Passwort ein
  import: Importieren
  cancel: Abbrechen
  importing: Importiere
  error:
    parse: Fehler beim Lesen der Datei
    wrongPassword: Falsches Passwort
    noFile: Keine Datei ausgewählt
    noPassword: Bitte Master-Passwort eingeben
    import: Fehler beim Importieren
  success: Import erfolgreich
  successDescription: "{groups} Gruppen und {entries} Einträge wurden importiert"

en:
  title: KeePass Import
  selectFile: Select KeePass file (.kdbx)
  kdbxFile: KDBX File
  chooseFile: Choose file
  password: Master Password
  passwordPlaceholder: Enter your KeePass master password
  import: Import
  cancel: Cancel
  importing: Importing
  error:
    parse: Error reading file
    wrongPassword: Wrong password
    noFile: No file selected
    noPassword: Please enter master password
    import: Error importing data
  success: Import successful
  successDescription: "{groups} groups and {entries} entries imported"
</i18n>
