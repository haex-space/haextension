import type { EncryptedMessage } from './crypto'

// Protocol v2: the vault requires clients to declare their requested
// permissions in the handshake (`ClientInfo.permissions`); v1 handshakes are
// rejected with PERMISSIONS_DECLARATION_REQUIRED.
const PROTOCOL_VERSION = 2
const CLIENT_NAME = 'haex-pass Browser Extension'

// All requests from this browser extension target the haex-vault core directly,
// not an installed extension. The sentinel values below are recognized by the
// haex-vault external_bridge to route requests to its built-in core handler.
const CORE_TARGET_PUBLIC_KEY = '__core__'
const CORE_TARGET_NAME = 'core'

// Protocol message types (matching Rust ProtocolMessage enum)
interface RequestedExtension {
  name: string
  extensionPublicKey: string // Public key of the haex-vault extension (from its manifest)
  // Declared action names the client wants to call on this extension
  // (protocol v2), or ['*'] for all actions.
  actions?: string[]
}

// One declared core permission (mirrors the vault manifest's PermissionEntry).
interface CorePermissionEntry {
  target: string
  operation?: string
}

// Declared core permissions (protocol v2) — mirrors the vault's
// ClientPermissions shape ({ core: ExtensionPermissions }).
interface ClientPermissions {
  core: {
    passwords?: CorePermissionEntry[]
  }
}

interface ClientInfo {
  clientId: string
  clientName: string
  publicKey: string // Public key of this client (browser extension) for E2E encryption
  requestedExtensions?: RequestedExtension[]
  permissions?: ClientPermissions
}

interface HandshakeRequest {
  type: 'handshake'
  version: number
  client: ClientInfo
}

export interface HandshakeResponse {
  type: 'handshakeResponse'
  version: number
  serverPublicKey: string
  authorized: boolean
  pendingApproval: boolean
}

export interface EncryptedEnvelope {
  type: 'request' | 'response'
  action: string
  message: string // Base64 encrypted payload
  iv: string // Base64 12-byte IV
  clientId: string
  publicKey: string // Ephemeral public key
  // Target extension identifiers (required for requests)
  extensionPublicKey?: string
  extensionName?: string
}

export interface AuthorizationUpdate {
  type: 'authorizationUpdate'
  authorized: boolean
}

interface ErrorMessage {
  type: 'error'
  code: string
  message: string
}

interface PingMessage {
  type: 'ping'
}

interface PongMessage {
  type: 'pong'
}

export type ProtocolMessage
  = | HandshakeRequest
    | HandshakeResponse
    | EncryptedEnvelope
    | AuthorizationUpdate
    | ErrorMessage
    | PingMessage
    | PongMessage

export function createHandshakeRequest(clientId: string, publicKey: string): HandshakeRequest {
  return {
    type: 'handshake',
    version: PROTOCOL_VERSION,
    client: {
      clientId,
      clientName: CLIENT_NAME,
      publicKey,
      // Request core access (will be pre-selected in authorization dialog)
      requestedExtensions: [
        { name: CORE_TARGET_NAME, extensionPublicKey: CORE_TARGET_PUBLIC_KEY },
      ],
      // Protocol v2: declare the core permissions this client needs up
      // front. haex-pass needs full passwords access — read for
      // autofill/TOTP/passkeys, write for saving credentials. The user
      // still has to approve this grant in the authorization dialog.
      permissions: {
        core: {
          passwords: [{ target: '*', operation: 'readWrite' }],
        },
      },
    },
  }
}

export function createRequestEnvelope(encrypted: EncryptedMessage): EncryptedEnvelope {
  // All requests target the haex-vault core, identified by the sentinel pair
  return {
    type: 'request',
    action: encrypted.action,
    message: encrypted.message,
    iv: encrypted.iv,
    clientId: encrypted.clientID,
    publicKey: encrypted.publicKey,
    extensionPublicKey: CORE_TARGET_PUBLIC_KEY,
    extensionName: CORE_TARGET_NAME,
  }
}
