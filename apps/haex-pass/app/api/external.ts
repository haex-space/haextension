/**
 * haex-pass External API Types
 *
 * Diese Typen definieren die API für externe Clients (Browser-Extension, CLI, etc.),
 * die über den haex-vault WebSocket-Bridge mit haex-pass kommunizieren.
 *
 * Verwendung in der Browser-Extension:
 * ```typescript
 * import {
 *   HAEX_PASS_METHODS,
 *   type GetLoginsPayload,
 *   type GetLoginsResponse,
 * } from 'haex-pass/api/external';
 * ```
 */

// =============================================================================
// Method Constants
// =============================================================================

/**
 * Verfügbare Methoden für haex-pass External Requests
 */
export const HAEX_PASS_METHODS = {
  /** Items für eine URL und optionale Feldnamen abrufen */
  GET_ITEMS: "get-items",
  /** TOTP-Code für einen Eintrag abrufen */
  GET_TOTP: "get-totp",
  /** Neues Item speichern */
  SET_ITEM: "set-item",
} as const;

export type HaexPassMethod = (typeof HAEX_PASS_METHODS)[keyof typeof HAEX_PASS_METHODS];

// =============================================================================
// get-items
// =============================================================================

/**
 * Payload für get-items Request
 */
export interface GetItemsPayload {
  /** URL zum Abgleich der Einträge (erforderlich, wird zur Laufzeit validiert) */
  url?: string;
  /**
   * Optionale Liste von Feldnamen zum Filtern.
   * Nur Einträge mit mindestens einem dieser Felder werden zurückgegeben.
   * Gängige Felder: 'username', 'password', 'email', 'otp'
   */
  fields?: string[];
}

/**
 * Ein Item-Eintrag aus get-items
 */
export interface ItemEntry {
  /** Eindeutige Entry-ID (für get-totp verwenden) */
  id: string;
  /** Entry-Titel (z.B. "GitHub Account") */
  title: string;
  /** URL des Eintrags */
  url: string | null;
  /**
   * Verfügbare Felder und deren Werte.
   * Standard-Felder: username, password, otp (wenn TOTP konfiguriert, Wert ist "TOTP")
   * Custom-Felder aus Key-Value-Paaren sind ebenfalls enthalten.
   */
  fields: Record<string, string>;
  /** Ob TOTP für diesen Eintrag konfiguriert ist */
  hasTotp: boolean;
  /**
   * Autofill-Aliase für Feld-Zuordnung.
   * Ermöglicht Matching, wenn das Form-Feld anders heißt als das gespeicherte Feld.
   * z.B. { "username": ["email", "login"], "password": ["pass"] }
   */
  autofillAliases?: Record<string, string[]> | null;
}

/**
 * Response-Daten von get-items
 */
export interface GetItemsResponseData {
  /** Liste der passenden Einträge */
  entries: ItemEntry[];
}

// =============================================================================
// get-totp
// =============================================================================

/**
 * Payload für get-totp Request
 */
export interface GetTotpPayload {
  /** Entry-ID für TOTP-Code (aus get-logins Response, erforderlich, wird zur Laufzeit validiert) */
  entryId?: string;
}

/**
 * Response-Daten von get-totp
 */
export interface GetTotpResponseData {
  /** Aktueller TOTP-Code (6 oder 8 Ziffern je nach Konfiguration) */
  code: string;
  /** Sekunden bis der Code abläuft (typisch 0-30) */
  validFor: number;
}

// =============================================================================
// set-item
// =============================================================================

/**
 * Payload für set-item Request
 */
export interface SetItemPayload {
  /** URL für das Item (für Matching und Auto-Fill) */
  url?: string;
  /** Titel für den Eintrag (wenn nicht angegeben, wird Domain aus URL extrahiert) */
  title?: string;
  /** Benutzername/E-Mail für das Login */
  username?: string;
  /** Passwort für das Login */
  password?: string;
  /** Optionale Gruppen-ID zum Speichern (null = Root/Ungrouped) */
  groupId?: string | null;
}

/**
 * Response-Daten von set-item
 */
export interface SetItemResponseData {
  /** ID des neu erstellten Eintrags */
  entryId: string;
  /** Titel des erstellten Eintrags */
  title: string;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Map von Methoden zu ihren Payload-Typen
 */
export interface HaexPassPayloads {
  [HAEX_PASS_METHODS.GET_ITEMS]: GetItemsPayload;
  [HAEX_PASS_METHODS.GET_TOTP]: GetTotpPayload;
  [HAEX_PASS_METHODS.SET_ITEM]: SetItemPayload;
}

/**
 * Map von Methoden zu ihren Response-Daten-Typen
 */
export interface HaexPassResponses {
  [HAEX_PASS_METHODS.GET_ITEMS]: GetItemsResponseData;
  [HAEX_PASS_METHODS.GET_TOTP]: GetTotpResponseData;
  [HAEX_PASS_METHODS.SET_ITEM]: SetItemResponseData;
}
