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
  /** Logins für eine URL und optionale Feldnamen abrufen */
  GET_LOGINS: "get-logins",
  /** TOTP-Code für einen Eintrag abrufen */
  GET_TOTP: "get-totp",
  /** Neue Login-Daten speichern */
  SET_LOGIN: "set-login",
} as const;

export type HaexPassMethod = (typeof HAEX_PASS_METHODS)[keyof typeof HAEX_PASS_METHODS];

// =============================================================================
// get-logins
// =============================================================================

/**
 * Payload für get-logins Request
 */
export interface GetLoginsPayload {
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
 * Ein Login-Eintrag aus get-logins
 */
export interface LoginEntry {
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
}

/**
 * Response-Daten von get-logins
 */
export interface GetLoginsResponseData {
  /** Liste der passenden Einträge */
  entries: LoginEntry[];
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
// set-login
// =============================================================================

/**
 * Payload für set-login Request
 */
export interface SetLoginPayload {
  /** URL für das Login (für Matching und Auto-Fill) */
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
 * Response-Daten von set-login
 */
export interface SetLoginResponseData {
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
  [HAEX_PASS_METHODS.GET_LOGINS]: GetLoginsPayload;
  [HAEX_PASS_METHODS.GET_TOTP]: GetTotpPayload;
  [HAEX_PASS_METHODS.SET_LOGIN]: SetLoginPayload;
}

/**
 * Map von Methoden zu ihren Response-Daten-Typen
 */
export interface HaexPassResponses {
  [HAEX_PASS_METHODS.GET_LOGINS]: GetLoginsResponseData;
  [HAEX_PASS_METHODS.GET_TOTP]: GetTotpResponseData;
  [HAEX_PASS_METHODS.SET_LOGIN]: SetLoginResponseData;
}
