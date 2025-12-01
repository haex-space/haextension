import {
  haexPasswordsBinaries,
  haexPasswordsItemBinaries,
  haexPasswordsSnapshotBinaries,
} from "../database/schemas";
import { eq, notInArray } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "~/database/schemas";

/**
 * Cleanup-Funktion für verwaiste Binaries (wie KeePass db.cleanup({binaries: true}))
 *
 * Sammelt alle referenzierten Binary-Hashes aus:
 * - haexPasswordsItemBinaries (aktuelle Entry-Attachments)
 * - haexPasswordsSnapshotBinaries (History-Attachments)
 *
 * Löscht alle Binaries aus haexPasswordsBinaries, die nicht mehr referenziert werden.
 *
 * @param db - Drizzle database instance
 * @returns Anzahl der gelöschten Binaries
 */
export async function cleanupOrphanedBinariesAsync(
  db: SqliteRemoteDatabase<typeof schema>
): Promise<number> {
  // 1. Alle referenzierten Hashes aus aktuellen Entries sammeln
  const itemBinaryHashes = await db
    .select({ hash: haexPasswordsItemBinaries.binaryHash })
    .from(haexPasswordsItemBinaries);

  // 2. Alle referenzierten Hashes aus Snapshots sammeln
  const snapshotBinaryHashes = await db
    .select({ hash: haexPasswordsSnapshotBinaries.binaryHash })
    .from(haexPasswordsSnapshotBinaries);

  // 3. Union: Alle verwendeten Hashes
  const referencedHashes = Array.from(
    new Set<string>([
      ...itemBinaryHashes.map((r) => r.hash),
      ...snapshotBinaryHashes.map((r) => r.hash),
    ])
  );

  // 4. Alle Binaries ohne Referenz löschen
  if (referencedHashes.length === 0) {
    // Wenn keine Referenzen existieren, lösche alle Binaries
    const result = await db.delete(haexPasswordsBinaries).returning();
    return result.length;
  }

  // Binaries löschen, die nicht in der Referenced-Liste sind
  const result = await db
    .delete(haexPasswordsBinaries)
    .where(notInArray(haexPasswordsBinaries.hash, referencedHashes))
    .returning();

  return result.length;
}

/**
 * Konvertiert ArrayBuffer zu Base64-String
 *
 * @param arrayBuffer ArrayBuffer mit Binary-Daten
 * @returns Base64-encoded String
 */
export function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Hilfsfunktion: Berechnet SHA-256 Hash für Binary-Data
 *
 * @param data Base64-encoded binary data, Uint8Array oder ArrayBuffer
 * @returns SHA-256 Hash als Hex-String
 */
export async function calculateBinaryHashAsync(
  data: string | Uint8Array | ArrayBuffer
): Promise<string> {
  let bytes: Uint8Array;

  if (typeof data === "string") {
    // Base64 zu Uint8Array (Browser-only, kein Node Buffer)
    const binaryString = atob(data);
    bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
  } else {
    // ArrayBuffer oder Uint8Array zu Uint8Array konvertieren
    bytes = new Uint8Array(data);
  }

  // SHA-256 Hash berechnen - create proper ArrayBuffer to avoid SharedArrayBuffer issues
  const properBuffer = new ArrayBuffer(bytes.byteLength);
  const properView = new Uint8Array(properBuffer);
  properView.set(bytes);

  const hashBuffer = await crypto.subtle.digest("SHA-256", properBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return hashHex;
}

/**
 * Hilfsfunktion: Fügt ein Binary hinzu (dedupliziert via Hash)
 *
 * @param db - Drizzle database instance
 * @param data Base64-encoded binary data
 * @param size Größe in Bytes
 * @param type Type des Binaries ('icon' oder 'attachment')
 * @returns Hash des Binaries
 */
export async function addBinaryAsync(
  db: SqliteRemoteDatabase<typeof schema>,
  data: string,
  size: number,
  type: 'icon' | 'attachment' = 'attachment'
): Promise<string> {
  const hash = await calculateBinaryHashAsync(data);

  // Prüfen ob Binary bereits existiert
  const existing = await db
    .select()
    .from(haexPasswordsBinaries)
    .where(eq(haexPasswordsBinaries.hash, hash))
    .limit(1);

  if (existing.length === 0) {
    // Binary noch nicht vorhanden → einfügen
    await db.insert(haexPasswordsBinaries).values({
      hash,
      data,
      size,
      type,
    });
  }

  return hash;
}

/**
 * Hilfsfunktion: Holt Binary-Daten anhand des Hashes
 *
 * @param db - Drizzle database instance
 * @param hash SHA-256 Hash des Binaries
 * @returns Base64-encoded binary data oder null wenn nicht gefunden
 */
export async function getBinaryDataAsync(
  db: SqliteRemoteDatabase<typeof schema>,
  hash: string
): Promise<string | null> {
  const result = await db
    .select({ data: haexPasswordsBinaries.data })
    .from(haexPasswordsBinaries)
    .where(eq(haexPasswordsBinaries.hash, hash))
    .limit(1);

  return result.length > 0 && result[0] ? result[0].data : null;
}
