/**
 * WebCrypto-based encryption for browser bridge communication.
 *
 * Uses X25519 for key exchange and AES-256-GCM for encryption — matching the
 * haex-vault external bridge (src-tauri/src/external_bridge/crypto.rs), which
 * migrated from ECDH P-256 to X25519 in commit 80ee80b4.
 *
 * Browser support: Firefox 132+, Chrome/Edge 123+, Safari 17+.
 */

// Cryptographic algorithm constants
const KEX_ALGORITHM = 'X25519'
const AES_ALGORITHM = 'AES-GCM'
const AES_KEY_LENGTH = 256 // bits
const IV_LENGTH = 12
const CLIENT_ID_LENGTH = 16

export interface KeyPair {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

export interface ExportedKeyPair {
  publicKey: string // Base64 raw 32 bytes
  privateKey: string // Base64 PKCS#8 DER
}

export interface EncryptedMessage {
  action: string
  message: string // Base64 encrypted payload
  iv: string // Base64 12-byte IV
  clientID: string
  publicKey: string // Ephemeral public key for this message (raw, base64)
}

/**
 * Generate a new X25519 keypair for key exchange.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: KEX_ALGORITHM },
    true, // extractable so we can persist it
    ['deriveBits'],
  ) as CryptoKeyPair
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  }
}

/**
 * Export a public key as raw 32 bytes (base64). Matches haex-vault's
 * `ServerKeyPair::public_key_base64`.
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key)
  return arrayBufferToBase64(exported)
}

/**
 * Import a public key from raw 32 bytes (base64).
 */
export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(base64Key)
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: KEX_ALGORITHM },
    true,
    [],
  )
}

/**
 * Export a private key as PKCS#8 (base64). X25519 in WebCrypto only exposes
 * the private key via `pkcs8` or `jwk` — not `raw`.
 */
export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('pkcs8', key)
  return arrayBufferToBase64(exported)
}

/**
 * Import a private key from PKCS#8 (base64).
 */
export async function importPrivateKey(base64Key: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(base64Key)
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: KEX_ALGORITHM },
    true,
    ['deriveBits'],
  )
}

/**
 * Derive a shared AES-256-GCM key from X25519 key agreement. haex-vault uses
 * the raw 32-byte shared secret directly as the AES key (no KDF), so we do
 * the same here.
 */
export async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: KEX_ALGORITHM, public: publicKey },
    privateKey,
    AES_KEY_LENGTH,
  )

  return crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypt a message using AES-GCM.
 */
export async function encryptMessage(
  message: string,
  sharedKey: CryptoKey,
): Promise<{ ciphertext: string, iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(message)

  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    sharedKey,
    encoded,
  )

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
  }
}

/**
 * Decrypt a message using AES-GCM.
 */
export async function decryptMessage(
  ciphertextBase64: string,
  ivBase64: string,
  sharedKey: CryptoKey,
): Promise<string | null> {
  try {
    const ciphertext = base64ToArrayBuffer(ciphertextBase64)
    const iv = base64ToArrayBuffer(ivBase64)

    const decrypted = await crypto.subtle.decrypt(
      { name: AES_ALGORITHM, iv },
      sharedKey,
      ciphertext,
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    return null
  }
}

/**
 * Generate a random IV.
 */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH))
}

/**
 * Convert Uint8Array to hex string.
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert hex string to Uint8Array.
 */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

/**
 * Convert ArrayBuffer or Uint8Array to Base64 string.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert Base64 string to ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Generate a client ID by hashing the raw public key (first 16 bytes hex).
 * Using the raw key bytes rather than SPKI keeps the fingerprint stable
 * regardless of how WebCrypto wraps the key.
 */
export async function generateClientId(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', publicKey)
  const hash = await crypto.subtle.digest('SHA-256', exported)
  const hashArray = new Uint8Array(hash)
  return toHex(hashArray.slice(0, CLIENT_ID_LENGTH))
}

/**
 * Create an encrypted message envelope with an ephemeral key for forward
 * secrecy.
 */
export async function createEncryptedMessage(
  action: string,
  payload: object,
  clientID: string,
  serverPublicKey: CryptoKey,
): Promise<EncryptedMessage> {
  const ephemeralKeyPair = await generateKeyPair()
  const ephemeralPublicKeyExported = await exportPublicKey(ephemeralKeyPair.publicKey)

  const sharedKey = await deriveSharedKey(ephemeralKeyPair.privateKey, serverPublicKey)

  const { ciphertext, iv } = await encryptMessage(JSON.stringify(payload), sharedKey)

  return {
    action,
    message: ciphertext,
    iv,
    clientID,
    publicKey: ephemeralPublicKeyExported,
  }
}

/**
 * Decrypt an encrypted message envelope.
 */
export async function decryptMessageEnvelope(
  envelope: EncryptedMessage,
  myPrivateKey: CryptoKey,
): Promise<object | null> {
  try {
    const senderPublicKey = await importPublicKey(envelope.publicKey)

    const sharedKey = await deriveSharedKey(myPrivateKey, senderPublicKey)

    const decrypted = await decryptMessage(envelope.message, envelope.iv, sharedKey)
    if (!decrypted)
      return null

    return JSON.parse(decrypted)
  } catch {
    return null
  }
}
