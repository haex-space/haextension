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
  /** Passwort-Generator-Konfiguration abrufen */
  GET_PASSWORD_CONFIG: "get-password-config",
  /** Alle Passwort-Generator-Presets abrufen */
  GET_PASSWORD_PRESETS: "get-password-presets",
  /** Neuen Passkey erstellen (WebAuthn Registration) */
  PASSKEY_CREATE: "passkey-create",
  /** Mit Passkey authentifizieren (WebAuthn Authentication) */
  PASSKEY_GET: "passkey-get",
  /** Passkeys für eine Relying Party abrufen */
  PASSKEY_LIST: "passkey-list",
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
// get-password-config
// =============================================================================

/**
 * Payload für get-password-config Request (keine Parameter erforderlich)
 */
export interface GetPasswordConfigPayload {
  // Keine Parameter erforderlich
}

/**
 * Passwort-Generator-Konfiguration
 */
export interface PasswordConfig {
  /** Passwortlänge (4-128) */
  length: number;
  /** Großbuchstaben verwenden (A-Z) */
  uppercase: boolean;
  /** Kleinbuchstaben verwenden (a-z) */
  lowercase: boolean;
  /** Zahlen verwenden (0-9) */
  numbers: boolean;
  /** Sonderzeichen verwenden (!@#$%...) */
  symbols: boolean;
  /** Auszuschließende Zeichen */
  excludeChars: string | null;
  /** Pattern-Modus verwenden */
  usePattern: boolean;
  /** Pattern-String (wenn usePattern true) */
  pattern: string | null;
}

/**
 * Response-Daten von get-password-config
 */
export interface GetPasswordConfigResponseData {
  /** Passwort-Generator-Konfiguration (null wenn kein Default-Preset vorhanden) */
  config: PasswordConfig | null;
  /** Name des Presets (falls vorhanden) */
  presetName: string | null;
}

// =============================================================================
// get-password-presets
// =============================================================================

/**
 * Ein Passwort-Generator-Preset
 */
export interface PasswordPreset {
  /** Eindeutige Preset-ID */
  id: string;
  /** Name des Presets */
  name: string;
  /** Ob dies das Standard-Preset ist */
  isDefault: boolean;
  /** Passwort-Generator-Konfiguration */
  config: PasswordConfig;
}

/**
 * Response-Daten von get-password-presets
 */
export interface GetPasswordPresetsResponseData {
  /** Liste aller Presets */
  presets: PasswordPreset[];
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
  [HAEX_PASS_METHODS.GET_PASSWORD_CONFIG]: GetPasswordConfigPayload;
  [HAEX_PASS_METHODS.GET_PASSWORD_PRESETS]: Record<string, never>;
  [HAEX_PASS_METHODS.PASSKEY_CREATE]: PasskeyCreatePayload;
  [HAEX_PASS_METHODS.PASSKEY_GET]: PasskeyGetPayload;
  [HAEX_PASS_METHODS.PASSKEY_LIST]: PasskeyListPayload;
}

/**
 * Map von Methoden zu ihren Response-Daten-Typen
 */
export interface HaexPassResponses {
  [HAEX_PASS_METHODS.GET_ITEMS]: GetItemsResponseData;
  [HAEX_PASS_METHODS.GET_TOTP]: GetTotpResponseData;
  [HAEX_PASS_METHODS.SET_ITEM]: SetItemResponseData;
  [HAEX_PASS_METHODS.GET_PASSWORD_CONFIG]: GetPasswordConfigResponseData;
  [HAEX_PASS_METHODS.GET_PASSWORD_PRESETS]: GetPasswordPresetsResponseData;
  [HAEX_PASS_METHODS.PASSKEY_CREATE]: PasskeyCreateResponseData;
  [HAEX_PASS_METHODS.PASSKEY_GET]: PasskeyGetResponseData;
  [HAEX_PASS_METHODS.PASSKEY_LIST]: PasskeyListResponseData;
}

// =============================================================================
// passkey-create (WebAuthn Registration)
// =============================================================================

/**
 * Payload für passkey-create Request
 * Enthält die WebAuthn PublicKeyCredentialCreationOptions
 */
export interface PasskeyCreatePayload {
  /** Relying Party ID (z.B. "github.com") */
  relyingPartyId: string;
  /** Relying Party Name (z.B. "GitHub") */
  relyingPartyName: string;
  /** Base64-encoded User Handle (von der Relying Party bereitgestellt) */
  userHandle: string;
  /** Username (z.B. E-Mail-Adresse) */
  userName: string;
  /** Anzeigename des Users */
  userDisplayName?: string;
  /** Base64-encoded Challenge */
  challenge: string;
  /** Credential IDs, die ausgeschlossen werden sollen (bereits registrierte Passkeys) */
  excludeCredentials?: string[];
  /** Ob ein Discoverable Credential (Resident Key) erstellt werden soll */
  requireResidentKey?: boolean;
  /** User Verification Anforderung */
  userVerification?: "required" | "preferred" | "discouraged";
  /** Optionale Item-ID zum Verknüpfen des Passkeys */
  itemId?: string;
}

/**
 * Response-Daten von passkey-create
 * Enthält die Attestation Response für die Relying Party
 */
export interface PasskeyCreateResponseData {
  /** Base64-encoded Credential ID */
  credentialId: string;
  /** Base64-encoded Public Key (SPKI Format) */
  publicKey: string;
  /** Base64-encoded Public Key (COSE Format für WebAuthn) */
  publicKeyCose: string;
  /** Base64-encoded Attestation Object */
  attestationObject: string;
  /** Base64-encoded Client Data JSON */
  clientDataJson: string;
  /** Interne Passkey-ID in haex-pass */
  passkeyId: string;
  /** Supported transports */
  transports: string[];
}

// =============================================================================
// passkey-get (WebAuthn Authentication)
// =============================================================================

/**
 * Payload für passkey-get Request
 * Enthält die WebAuthn PublicKeyCredentialRequestOptions
 */
export interface PasskeyGetPayload {
  /** Relying Party ID (z.B. "github.com") */
  relyingPartyId: string;
  /** Base64-encoded Challenge */
  challenge: string;
  /** Erlaubte Credential IDs (leer = alle Discoverable Credentials für diese RP) */
  allowCredentials?: Array<{
    id: string;
    type: "public-key";
    transports?: string[];
  }>;
  /** User Verification Anforderung */
  userVerification?: "required" | "preferred" | "discouraged";
}

/**
 * Response-Daten von passkey-get
 * Enthält die Assertion Response für die Relying Party
 */
export interface PasskeyGetResponseData {
  /** Base64-encoded Credential ID */
  credentialId: string;
  /** Base64-encoded Authenticator Data */
  authenticatorData: string;
  /** Base64-encoded Signature */
  signature: string;
  /** Base64-encoded Client Data JSON */
  clientDataJson: string;
  /** Base64-encoded User Handle (für Discoverable Credentials) */
  userHandle?: string;
  /** Interne Passkey-ID in haex-pass */
  passkeyId: string;
}

// =============================================================================
// passkey-list
// =============================================================================

/**
 * Payload für passkey-list Request
 */
export interface PasskeyListPayload {
  /** Optional: Filter nach Relying Party ID */
  relyingPartyId?: string;
  /** Optional: Filter nach verknüpfter Item-ID */
  itemId?: string;
  /** Nur Discoverable Credentials zurückgeben */
  discoverableOnly?: boolean;
}

/**
 * Ein Passkey-Eintrag aus passkey-list
 */
export interface PasskeyEntry {
  /** Interne Passkey-ID */
  id: string;
  /** Base64-encoded Credential ID */
  credentialId: string;
  /** Relying Party ID */
  relyingPartyId: string;
  /** Relying Party Name */
  relyingPartyName: string | null;
  /** Username */
  userName: string | null;
  /** Anzeigename */
  userDisplayName: string | null;
  /** Benutzerdefinierter Name */
  nickname: string | null;
  /** Erstellungsdatum (ISO) */
  createdAt: string | null;
  /** Letztes Verwendungsdatum (ISO) */
  lastUsedAt: string | null;
  /** Ob es ein Discoverable Credential ist */
  isDiscoverable: boolean;
  /** Verknüpfte Item-ID (falls vorhanden) */
  itemId: string | null;
}

/**
 * Response-Daten von passkey-list
 */
export interface PasskeyListResponseData {
  /** Liste der Passkeys */
  passkeys: PasskeyEntry[];
}
