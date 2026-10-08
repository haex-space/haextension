import * as kdbxweb from "kdbxweb";
import { argon2id, argon2i, argon2d } from "hash-wasm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { addBinaryAsync } from "~/utils/cleanup";
import type * as schema from "~/database/schemas/index";
import { getIconForKeePassIndex } from "~/utils/keepassIconMapping";

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

// Helper function to extract field value from kdbxweb
export function getFieldValue(field: kdbxweb.KdbxEntryField | undefined): string {
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
export function migrateKeePassReferences(value: string): string {
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
export function extractOtpFromEntry(
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
      // Check for TOTP Settings field (KeePass format: "30;6" or "30;6;SHA256" for period;digits;algorithm)
      const totpSettings =
        entry.fields.get("TOTP Settings") || entry.fields.get("totp-settings");
      let digits = 6;
      let period = 30;
      let algorithm = "SHA1";
      if (totpSettings) {
        const settingsValue = getFieldValue(totpSettings);
        if (settingsValue) {
          const parts = settingsValue.split(";");
          if (parts?.[0]) period = parseInt(parts[0], 10) || 30;
          if (parts?.[1]) digits = parseInt(parts[1], 10) || 6;
          if (parts?.[2]) algorithm = parts[2].toUpperCase();
        }
      }
      return {
        secret: seedValue.toUpperCase(),
        digits,
        period,
        algorithm,
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
export function extractBinaryData(
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
export function kdbxUuidToStandardUuid(kdbxUuid: kdbxweb.KdbxUuid): string {
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
export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
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
export async function extractIconAsync(
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
