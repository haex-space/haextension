import { base64ToArrayBuffer } from "@haex-space/vault-sdk";

// =============================================================================
// WebAuthn Helper Functions
// =============================================================================

/**
 * Build client data JSON for WebAuthn
 */
export function buildClientDataJson(
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
export async function buildAuthenticatorDataAsync(
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
export async function buildAttestationObjectAsync(
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
