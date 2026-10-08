import { eq, and } from "drizzle-orm";
import * as schema from "~/database/schemas";
import type { ExternalRequest, ExternalResponse } from "@haex-space/vault-sdk";
import {
  generatePasskeyPairAsync,
  exportKeyPairAsync,
  importPrivateKeyAsync,
  signWithPasskeyAsync,
  arrayBufferToBase64,
  COSE_ALGORITHM,
} from "@haex-space/vault-sdk";
import type {
  PasskeyCreatePayload,
  PasskeyCreateResponseData,
  PasskeyGetPayload,
  PasskeyGetResponseData,
  PasskeyListPayload,
  PasskeyListResponseData,
  PasskeyEntry,
} from "~/api/external";
import {
  buildAttestationObjectAsync,
  buildAuthenticatorDataAsync,
  buildClientDataJson,
} from "./webauthn";

export function usePasskeyRequestHandlers() {
  const haexVaultStore = useHaexVaultStore();

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
    handlePasskeyCreate,
    handlePasskeyGet,
    handlePasskeyList,
  };
}
