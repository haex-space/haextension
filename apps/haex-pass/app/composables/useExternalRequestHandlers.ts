/**
 * External Request Handlers for browser extension communication
 *
 * Handles requests from external clients (browser extensions, CLI, etc.)
 * via the haex-vault WebSocket bridge.
 */

import { like, eq, or, and } from "drizzle-orm";
import { TOTP } from "otpauth";
import * as schema from "~/database/schemas";
import { addBinaryAsync } from "~/utils/cleanup";
import type { ExternalRequest, ExternalResponse } from "@haex-space/vault-sdk";
import {
  generatePasskeyPairAsync,
  exportKeyPairAsync,
  importPrivateKeyAsync,
  signWithPasskeyAsync,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  COSE_ALGORITHM,
} from "@haex-space/vault-sdk";
import {
  HAEX_PASS_METHODS,
  type GetItemsPayload,
  type GetTotpPayload,
  type SetItemPayload,
  type ItemEntry,
  type GetItemsResponseData,
  type GetTotpResponseData,
  type SetItemResponseData,
  type GetPasswordConfigResponseData,
  type GetPasswordPresetsResponseData,
  type PasswordPreset,
  type PasskeyCreatePayload,
  type PasskeyCreateResponseData,
  type PasskeyGetPayload,
  type PasskeyGetResponseData,
  type PasskeyListPayload,
  type PasskeyListResponseData,
  type PasskeyEntry,
} from "~/api/external";

export function useExternalRequestHandlers() {
  const haexVaultStore = useHaexVaultStore();

  /**
   * Register all external request handlers
   * Should be called once during app initialization
   */
  const registerHandlers = () => {
    const client = haexVaultStore.client;

    // Handler: get-items
    // Returns matching entries for a given URL and field names
    client.onExternalRequest(HAEX_PASS_METHODS.GET_ITEMS, async (request) => {
      return handleGetItems(request);
    });

    // Handler: get-totp
    // Returns TOTP code for a given entry
    client.onExternalRequest(HAEX_PASS_METHODS.GET_TOTP, async (request) => {
      return handleGetTotp(request);
    });

    // Handler: set-item
    // Saves new credentials from browser extension
    client.onExternalRequest(HAEX_PASS_METHODS.SET_ITEM, async (request) => {
      return handleSetItem(request);
    });

    // Handler: get-password-config
    // Returns default password generator configuration
    client.onExternalRequest(HAEX_PASS_METHODS.GET_PASSWORD_CONFIG, async (request) => {
      return handleGetPasswordConfig(request);
    });

    // Handler: get-password-presets
    // Returns all password generator presets
    client.onExternalRequest(HAEX_PASS_METHODS.GET_PASSWORD_PRESETS, async (request) => {
      return handleGetPasswordPresets(request);
    });

    // Handler: passkey-create
    // Creates a new passkey (WebAuthn registration)
    client.onExternalRequest(HAEX_PASS_METHODS.PASSKEY_CREATE, async (request) => {
      return handlePasskeyCreate(request);
    });

    // Handler: passkey-get
    // Authenticates with a passkey (WebAuthn authentication)
    client.onExternalRequest(HAEX_PASS_METHODS.PASSKEY_GET, async (request) => {
      return handlePasskeyGet(request);
    });

    // Handler: passkey-list
    // Lists passkeys for a relying party
    client.onExternalRequest(HAEX_PASS_METHODS.PASSKEY_LIST, async (request) => {
      return handlePasskeyList(request);
    });

    console.log("[haex-pass] External request handlers registered");
  };

  /**
   * Handle get-items request
   * Finds entries matching the URL and returns them with their custom fields
   */
  const handleGetItems = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const { url, fields } = request.payload as GetItemsPayload;

    console.log("[haex-pass] handleGetItems called with:", { url, fields });

    if (!url) {
      return {
        requestId: request.requestId,
        success: false,
        error: "Missing required field: url",
      };
    }

    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        console.log("[haex-pass] Database not initialized!");
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Extract domain from URL for matching
      let domain: string;
      try {
        const urlObj = new URL(url);
        domain = urlObj.hostname;
      } catch {
        domain = url;
      }

      console.log("[haex-pass] Searching for domain:", domain);

      // Find entries with matching URL
      const entries = await orm
        .select({
          id: schema.haexPasswordsItemDetails.id,
          title: schema.haexPasswordsItemDetails.title,
          username: schema.haexPasswordsItemDetails.username,
          password: schema.haexPasswordsItemDetails.password,
          url: schema.haexPasswordsItemDetails.url,
          otpSecret: schema.haexPasswordsItemDetails.otpSecret,
          autofillAliases: schema.haexPasswordsItemDetails.autofillAliases,
        })
        .from(schema.haexPasswordsItemDetails)
        .where(
          or(
            like(schema.haexPasswordsItemDetails.url, `%${domain}%`),
            eq(schema.haexPasswordsItemDetails.url, url)
          )
        );

      console.log("[haex-pass] Found entries:", entries.length, entries.map(e => ({ id: e.id, title: e.title, url: e.url })));

      // Get custom fields for each entry
      const entriesWithFields = await Promise.all(
        entries.map(async (entry) => {
          const keyValues = await orm
            .select({
              key: schema.haexPasswordsItemKeyValues.key,
              value: schema.haexPasswordsItemKeyValues.value,
            })
            .from(schema.haexPasswordsItemKeyValues)
            .where(eq(schema.haexPasswordsItemKeyValues.itemId, entry.id));

          // Build fields object with standard + custom fields
          const entryFields: Record<string, string> = {};

          // Add standard fields if they exist
          if (entry.username) entryFields.username = entry.username;
          if (entry.password) entryFields.password = entry.password;
          if (entry.otpSecret) entryFields.otp = "TOTP"; // Indicate TOTP is available

          // Add custom key-value fields
          keyValues.forEach((kv) => {
            if (kv.key && kv.value) {
              entryFields[kv.key] = kv.value;
            }
          });

          return {
            id: entry.id,
            title: entry.title || "Untitled",
            url: entry.url,
            fields: entryFields,
            hasTotp: !!entry.otpSecret,
            autofillAliases: entry.autofillAliases,
          } satisfies ItemEntry;
        })
      );

      // Filter entries to only include those with at least one requested field
      const filteredEntries = fields && fields.length > 0
        ? entriesWithFields.filter((entry) =>
            fields.some((field) => field in entry.fields)
          )
        : entriesWithFields;

      const responseData: GetItemsResponseData = {
        entries: filteredEntries,
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] get-items error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle get-totp request
   * Generates and returns the current TOTP code for an entry
   */
  const handleGetTotp = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const { entryId } = request.payload as GetTotpPayload;

    if (!entryId) {
      return {
        requestId: request.requestId,
        success: false,
        error: "Missing required field: entryId",
      };
    }

    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Get entry with OTP settings
      const [entry] = await orm
        .select({
          otpSecret: schema.haexPasswordsItemDetails.otpSecret,
          otpDigits: schema.haexPasswordsItemDetails.otpDigits,
          otpPeriod: schema.haexPasswordsItemDetails.otpPeriod,
          otpAlgorithm: schema.haexPasswordsItemDetails.otpAlgorithm,
        })
        .from(schema.haexPasswordsItemDetails)
        .where(eq(schema.haexPasswordsItemDetails.id, entryId))
        .limit(1);

      if (!entry || !entry.otpSecret) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Entry not found or no TOTP configured",
        };
      }

      // Use stored settings with defaults
      const digits = entry.otpDigits ?? 6;
      const period = entry.otpPeriod ?? 30;
      const algorithm = entry.otpAlgorithm ?? "SHA1";

      // Generate TOTP code using otpauth library (same as otp.vue component)
      const totp = new TOTP({
        secret: entry.otpSecret.trim(),
        digits,
        period,
        algorithm,
      });
      const totpCode = totp.generate();

      const responseData: GetTotpResponseData = {
        code: totpCode,
        validFor: period - (Math.floor(Date.now() / 1000) % period), // Seconds until code expires
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] get-totp error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle set-item request
   * Saves new credentials from browser extension
   */
  const handleSetItem = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const { url, title, username, password, groupId, otpSecret, otpDigits, otpPeriod, otpAlgorithm, iconBase64 } = request.payload as SetItemPayload;

    // At minimum, we need a URL or title to create an entry
    if (!url && !title) {
      return {
        requestId: request.requestId,
        success: false,
        error: "Missing required field: url or title",
      };
    }

    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Extract domain for title if not provided
      let entryTitle = title;
      if (!entryTitle && url) {
        try {
          const urlObj = new URL(url);
          entryTitle = urlObj.hostname;
        } catch {
          entryTitle = url;
        }
      }

      // Create new entry
      const newEntryId = crypto.randomUUID();

      // Process icon if provided (Base64 -> binary storage with hash reference)
      let iconRef: string | null = null;
      if (iconBase64) {
        try {
          // Decode base64 to get size
          const binaryString = atob(iconBase64);
          const size = binaryString.length;
          // Store binary and get hash reference
          const hash = await addBinaryAsync(orm, iconBase64, size, "icon");
          iconRef = `binary:${hash}`;
        } catch (error) {
          console.error("[haex-pass] Failed to process icon:", error);
          // Continue without icon if processing fails
        }
      }

      await orm.insert(schema.haexPasswordsItemDetails).values({
        id: newEntryId,
        title: entryTitle || null,
        username: username || null,
        password: password || null,
        url: url || null,
        note: null,
        otpSecret: otpSecret || null,
        otpDigits: otpDigits || null,
        otpPeriod: otpPeriod || null,
        otpAlgorithm: otpAlgorithm || null,
        icon: iconRef,
        color: null,
      });

      // Create group item relation
      await orm.insert(schema.haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Create initial snapshot
      const snapshotData = {
        title: entryTitle,
        username: username || null,
        password: password || null,
        url: url || null,
        note: null,
        tags: null,
        otpSecret: otpSecret || null,
        otpDigits: otpDigits || null,
        otpPeriod: otpPeriod || null,
        otpAlgorithm: otpAlgorithm || null,
        icon: iconRef,
        keyValues: [],
        attachments: [],
      };

      await orm.insert(schema.haexPasswordsItemSnapshots).values({
        id: crypto.randomUUID(),
        itemId: newEntryId,
        snapshotData: JSON.stringify(snapshotData),
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      });

      // Sync items to update UI
      const { syncGroupItemsAsync } = usePasswordGroupStore();
      await syncGroupItemsAsync();

      const responseData: SetItemResponseData = {
        entryId: newEntryId,
        title: entryTitle || "",
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] set-item error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle get-password-config request
   * Returns the default password generator preset configuration
   */
  const handleGetPasswordConfig = async (request: ExternalRequest): Promise<ExternalResponse> => {
    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Get default preset
      const [defaultPreset] = await orm
        .select()
        .from(schema.haexPasswordsGeneratorPresets)
        .where(eq(schema.haexPasswordsGeneratorPresets.isDefault, true))
        .limit(1);

      let responseData: GetPasswordConfigResponseData;

      if (defaultPreset) {
        responseData = {
          config: {
            length: defaultPreset.length,
            uppercase: defaultPreset.uppercase,
            lowercase: defaultPreset.lowercase,
            numbers: defaultPreset.numbers,
            symbols: defaultPreset.symbols,
            excludeChars: defaultPreset.excludeChars || null,
            usePattern: defaultPreset.usePattern,
            pattern: defaultPreset.pattern || null,
          },
          presetName: defaultPreset.name,
        };
      } else {
        // No default preset configured - return null config
        responseData = {
          config: null,
          presetName: null,
        };
      }

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] get-password-config error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle get-password-presets request
   * Returns all password generator presets
   */
  const handleGetPasswordPresets = async (request: ExternalRequest): Promise<ExternalResponse> => {
    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Get all presets
      const presets = await orm
        .select()
        .from(schema.haexPasswordsGeneratorPresets);

      const responseData: GetPasswordPresetsResponseData = {
        presets: presets.map((preset): PasswordPreset => ({
          id: preset.id,
          name: preset.name,
          isDefault: preset.isDefault,
          config: {
            length: preset.length,
            uppercase: preset.uppercase,
            lowercase: preset.lowercase,
            numbers: preset.numbers,
            symbols: preset.symbols,
            excludeChars: preset.excludeChars || null,
            usePattern: preset.usePattern,
            pattern: preset.pattern || null,
          },
        })),
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] get-password-presets error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle passkey-create request
   * Creates a new passkey for WebAuthn registration
   */
  const handlePasskeyCreate = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const payload = request.payload as unknown as PasskeyCreatePayload;

    // Validate required fields
    if (!payload.relyingPartyId || !payload.userHandle || !payload.userName || !payload.challenge) {
      return {
        requestId: request.requestId,
        success: false,
        error: "Missing required fields: relyingPartyId, userHandle, userName, challenge",
      };
    }

    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Check if credential already exists for this user and relying party
      if (payload.excludeCredentials && payload.excludeCredentials.length > 0) {
        for (const excludedId of payload.excludeCredentials) {
          const [existing] = await orm
            .select()
            .from(schema.haexPasswordsPasskeys)
            .where(eq(schema.haexPasswordsPasskeys.credentialId, excludedId))
            .limit(1);

          if (existing) {
            return {
              requestId: request.requestId,
              success: false,
              error: "Credential already registered",
            };
          }
        }
      }

      // Generate new key pair
      const keyPair = await generatePasskeyPairAsync();
      const exportedKeys = await exportKeyPairAsync(keyPair);

      // Generate credential ID
      const credentialIdBytes = crypto.getRandomValues(new Uint8Array(32));
      const credentialId = arrayBufferToBase64(credentialIdBytes);

      // Create passkey entry in database
      const passkeyId = crypto.randomUUID();
      await orm.insert(schema.haexPasswordsPasskeys).values({
        id: passkeyId,
        itemId: payload.itemId || null,
        credentialId,
        relyingPartyId: payload.relyingPartyId,
        relyingPartyName: payload.relyingPartyName || null,
        userHandle: payload.userHandle,
        userName: payload.userName,
        userDisplayName: payload.userDisplayName || null,
        privateKey: exportedKeys.privateKeyBase64,
        publicKey: exportedKeys.publicKeyBase64,
        algorithm: COSE_ALGORITHM.ES256,
        signCount: 0,
        isDiscoverable: payload.requireResidentKey ?? true,
      });

      // Build attestation object
      const attestationObject = await buildAttestationObjectAsync(
        payload.relyingPartyId,
        credentialIdBytes,
        exportedKeys.publicKeyCoseBase64
      );

      // Build client data JSON
      const clientDataJson = buildClientDataJson(
        "webauthn.create",
        payload.challenge,
        `https://${payload.relyingPartyId}`
      );

      const responseData: PasskeyCreateResponseData = {
        credentialId,
        publicKey: exportedKeys.publicKeyBase64,
        publicKeyCose: exportedKeys.publicKeyCoseBase64,
        attestationObject: arrayBufferToBase64(attestationObject),
        clientDataJson: arrayBufferToBase64(new TextEncoder().encode(clientDataJson)),
        passkeyId,
        transports: ["internal", "hybrid"],
      };

      console.log("[haex-pass] Passkey created:", {
        passkeyId,
        relyingPartyId: payload.relyingPartyId,
        userName: payload.userName,
      });

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] passkey-create error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle passkey-get request
   * Authenticates with a passkey for WebAuthn authentication
   */
  const handlePasskeyGet = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const payload = request.payload as unknown as PasskeyGetPayload;

    if (!payload.relyingPartyId || !payload.challenge) {
      return {
        requestId: request.requestId,
        success: false,
        error: "Missing required fields: relyingPartyId, challenge",
      };
    }

    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Find matching passkey(s)
      let passkey;

      if (payload.allowCredentials && payload.allowCredentials.length > 0) {
        // Use specific credential ID
        for (const allowed of payload.allowCredentials) {
          const [found] = await orm
            .select()
            .from(schema.haexPasswordsPasskeys)
            .where(
              and(
                eq(schema.haexPasswordsPasskeys.credentialId, allowed.id),
                eq(schema.haexPasswordsPasskeys.relyingPartyId, payload.relyingPartyId)
              )
            )
            .limit(1);

          if (found) {
            passkey = found;
            break;
          }
        }
      } else {
        // Use discoverable credentials for this relying party
        const [found] = await orm
          .select()
          .from(schema.haexPasswordsPasskeys)
          .where(
            and(
              eq(schema.haexPasswordsPasskeys.relyingPartyId, payload.relyingPartyId),
              eq(schema.haexPasswordsPasskeys.isDiscoverable, true)
            )
          )
          .limit(1);

        passkey = found;
      }

      if (!passkey) {
        return {
          requestId: request.requestId,
          success: false,
          error: "No matching passkey found",
        };
      }

      // Import private key and sign
      const privateKey = await importPrivateKeyAsync(passkey.privateKey);

      // Build authenticator data
      const newSignCount = passkey.signCount + 1;
      const authenticatorData = await buildAuthenticatorDataAsync(
        payload.relyingPartyId,
        newSignCount,
        false // Not creating a new credential
      );

      // Build client data JSON
      const clientDataJson = buildClientDataJson(
        "webauthn.get",
        payload.challenge,
        `https://${payload.relyingPartyId}`
      );
      const clientDataJsonBytes = new TextEncoder().encode(clientDataJson);
      const clientDataHash = await crypto.subtle.digest("SHA-256", clientDataJsonBytes);

      // Sign authenticatorData || clientDataHash
      const signatureData = new Uint8Array(authenticatorData.byteLength + clientDataHash.byteLength);
      signatureData.set(new Uint8Array(authenticatorData), 0);
      signatureData.set(new Uint8Array(clientDataHash), authenticatorData.byteLength);

      const signature = await signWithPasskeyAsync(privateKey, signatureData);

      // Update sign count in database
      await orm
        .update(schema.haexPasswordsPasskeys)
        .set({
          signCount: newSignCount,
          lastUsedAt: new Date().toISOString(),
        })
        .where(eq(schema.haexPasswordsPasskeys.id, passkey.id));

      const responseData: PasskeyGetResponseData = {
        credentialId: passkey.credentialId,
        authenticatorData: arrayBufferToBase64(authenticatorData),
        signature: arrayBufferToBase64(signature),
        clientDataJson: arrayBufferToBase64(clientDataJsonBytes),
        userHandle: passkey.isDiscoverable ? passkey.userHandle : undefined,
        passkeyId: passkey.id,
      };

      console.log("[haex-pass] Passkey authentication:", {
        passkeyId: passkey.id,
        relyingPartyId: payload.relyingPartyId,
        signCount: newSignCount,
      });

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] passkey-get error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle passkey-list request
   * Returns passkeys matching the filter criteria
   */
  const handlePasskeyList = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const payload = request.payload as PasskeyListPayload;

    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Build query based on filters
      let query = orm.select().from(schema.haexPasswordsPasskeys);

      // Apply filters
      const conditions = [];
      if (payload.relyingPartyId) {
        conditions.push(eq(schema.haexPasswordsPasskeys.relyingPartyId, payload.relyingPartyId));
      }
      if (payload.itemId) {
        conditions.push(eq(schema.haexPasswordsPasskeys.itemId, payload.itemId));
      }
      if (payload.discoverableOnly) {
        conditions.push(eq(schema.haexPasswordsPasskeys.isDiscoverable, true));
      }

      const passkeys = conditions.length > 0
        ? await query.where(and(...conditions))
        : await query;

      const responseData: PasskeyListResponseData = {
        passkeys: passkeys.map((p): PasskeyEntry => ({
          id: p.id,
          credentialId: p.credentialId,
          relyingPartyId: p.relyingPartyId,
          relyingPartyName: p.relyingPartyName,
          userName: p.userName,
          userDisplayName: p.userDisplayName,
          nickname: p.nickname,
          createdAt: p.createdAt,
          lastUsedAt: p.lastUsedAt,
          isDiscoverable: p.isDiscoverable,
          itemId: p.itemId,
        })),
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] passkey-list error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  return {
    registerHandlers,
  };
}

// =============================================================================
// WebAuthn Helper Functions
// =============================================================================

/**
 * Build client data JSON for WebAuthn
 */
function buildClientDataJson(
  type: "webauthn.create" | "webauthn.get",
  challenge: string,
  origin: string
): string {
  return JSON.stringify({
    type,
    challenge,
    origin,
    crossOrigin: false,
  });
}

/**
 * Build authenticator data for WebAuthn
 */
async function buildAuthenticatorDataAsync(
  relyingPartyId: string,
  signCount: number,
  attestedCredentialData: boolean
): Promise<ArrayBuffer> {
  // RP ID hash (32 bytes)
  const encoder = new TextEncoder();
  const rpIdBytes = encoder.encode(relyingPartyId);
  const rpIdHash = new Uint8Array(await crypto.subtle.digest("SHA-256", rpIdBytes));

  // Flags (1 byte)
  // Bit 0: User Present (UP)
  // Bit 2: User Verified (UV)
  // Bit 6: Attested credential data (AT)
  let flags = 0x01; // UP flag
  flags |= 0x04; // UV flag (user verified)
  if (attestedCredentialData) {
    flags |= 0x40; // AT flag
  }

  // Sign count (4 bytes, big-endian)
  const signCountBytes = new Uint8Array(4);
  signCountBytes[0] = (signCount >> 24) & 0xff;
  signCountBytes[1] = (signCount >> 16) & 0xff;
  signCountBytes[2] = (signCount >> 8) & 0xff;
  signCountBytes[3] = signCount & 0xff;

  // Combine: rpIdHash (32) + flags (1) + signCount (4) = 37 bytes
  const authenticatorData = new Uint8Array(37);
  authenticatorData.set(rpIdHash, 0);
  authenticatorData[32] = flags;
  authenticatorData.set(signCountBytes, 33);

  return authenticatorData.buffer;
}

/**
 * Build attestation object for WebAuthn registration
 */
async function buildAttestationObjectAsync(
  relyingPartyId: string,
  credentialId: Uint8Array,
  publicKeyCoseBase64: string
): Promise<ArrayBuffer> {
  const publicKeyCose = base64ToArrayBuffer(publicKeyCoseBase64);

  // Compute RP ID hash
  const rpIdHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(relyingPartyId))
  );

  // Flags: UP (0x01) + UV (0x04) + AT (0x40) = 0x45
  const flags = 0x45;

  // AAGUID (16 bytes of zeros for software authenticator)
  const aaguid = new Uint8Array(16);

  // Credential ID length (2 bytes, big-endian)
  const credIdLength = new Uint8Array(2);
  credIdLength[0] = (credentialId.length >> 8) & 0xff;
  credIdLength[1] = credentialId.length & 0xff;

  // Build attested credential data
  const attestedCredentialData = new Uint8Array(
    16 + 2 + credentialId.length + publicKeyCose.length
  );
  attestedCredentialData.set(aaguid, 0);
  attestedCredentialData.set(credIdLength, 16);
  attestedCredentialData.set(credentialId, 18);
  attestedCredentialData.set(publicKeyCose, 18 + credentialId.length);

  // Build authenticator data (37 bytes base + attested credential data)
  const authenticatorData = new Uint8Array(37 + attestedCredentialData.length);
  authenticatorData.set(rpIdHash, 0);
  authenticatorData[32] = flags;
  // signCount = 0 (4 bytes at positions 33-36, already zeros)
  authenticatorData.set(attestedCredentialData, 37);

  // Build minimal CBOR attestation object
  // { "fmt": "none", "attStmt": {}, "authData": authenticatorData }
  const attestationObject = buildCborAttestationObject(authenticatorData);

  return attestationObject;
}

/**
 * Build CBOR-encoded attestation object
 * Simplified implementation for "none" attestation format
 */
function buildCborAttestationObject(authData: Uint8Array): ArrayBuffer {
  // CBOR encoding of:
  // { "fmt": "none", "attStmt": {}, "authData": <bytes> }

  const parts: number[] = [];

  // Map with 3 items
  parts.push(0xa3);

  // "fmt" key (text string, 3 chars)
  parts.push(0x63); // text(3)
  parts.push(0x66, 0x6d, 0x74); // "fmt"

  // "none" value (text string, 4 chars)
  parts.push(0x64); // text(4)
  parts.push(0x6e, 0x6f, 0x6e, 0x65); // "none"

  // "attStmt" key (text string, 7 chars)
  parts.push(0x67); // text(7)
  parts.push(0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74); // "attStmt"

  // Empty map value
  parts.push(0xa0); // map(0)

  // "authData" key (text string, 8 chars)
  parts.push(0x68); // text(8)
  parts.push(0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61); // "authData"

  // authData value (byte string)
  if (authData.length < 24) {
    parts.push(0x40 + authData.length);
  } else if (authData.length < 256) {
    parts.push(0x58, authData.length);
  } else {
    parts.push(0x59, (authData.length >> 8) & 0xff, authData.length & 0xff);
  }
  for (let i = 0; i < authData.length; i++) {
    parts.push(authData[i]!);
  }

  return new Uint8Array(parts).buffer;
}
