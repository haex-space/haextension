import type { EncryptedMessage, KeyPair } from './crypto'
import {
  createEncryptedMessage,
  decryptMessageEnvelope,
  exportPrivateKey,
  exportPublicKey,
  generateClientId,
  generateKeyPair,
  importPrivateKey,
  importPublicKey,
  toHex,
} from './crypto'
import {
  ExternalConnectionErrorCode,
  ExternalConnectionState,
  type ExternalConnection,
} from '@haex-space/vault-sdk'
import { getExtensionIdentifiers, getWebSocketPort } from '~/logic/settings'

const PROTOCOL_VERSION = 1
const CLIENT_NAME = 'haex-pass Browser Extension'
const STORAGE_KEY_KEYPAIR = 'haex-pass-keypair'

// Re-export SDK types for use in the extension
export { ExternalConnectionErrorCode, ExternalConnectionState, type ExternalConnection }
// Backward compatibility aliases
export type ConnectionState = ExternalConnectionState
export type VaultConnection = ExternalConnection

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

// Protocol message types (matching Rust ProtocolMessage enum)
interface RequestedExtension {
  name: string
  extensionPublicKey: string // Public key of the haex-vault extension (from its manifest)
}

interface ClientInfo {
  clientId: string
  clientName: string
  publicKey: string // Public key of this client (browser extension) for E2E encryption
  requestedExtensions?: RequestedExtension[]
}

interface HandshakeRequest {
  type: 'handshake'
  version: number
  client: ClientInfo
}

interface HandshakeResponse {
  type: 'handshakeResponse'
  version: number
  serverPublicKey: string
  authorized: boolean
  pendingApproval: boolean
}

interface EncryptedEnvelope {
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

interface AuthorizationUpdate {
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

type ProtocolMessage =
  | HandshakeRequest
  | HandshakeResponse
  | EncryptedEnvelope
  | AuthorizationUpdate
  | ErrorMessage
  | PingMessage
  | PongMessage

class VaultConnectionManager {
  private ws: WebSocket | null = null
  private keyPair: KeyPair | null = null
  private serverPublicKey: CryptoKey | null = null
  private clientId: string | null = null
  private publicKeyBase64: string | null = null
  private state: ExternalConnectionState = ExternalConnectionState.DISCONNECTED
  private errorCode: ExternalConnectionErrorCode = ExternalConnectionErrorCode.NONE
  private errorMessage: string | null = null
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private messageHandlers: Set<(message: unknown) => void> = new Set()
  private stateChangeHandlers: Set<(state: VaultConnection) => void> = new Set()
  private initPromise: Promise<void> | null = null

  constructor() {
    // Initialize keypair asynchronously
    this.initPromise = this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      // Try to load existing keypair from storage
      const stored = await this.loadKeypair()
      if (stored) {
        this.keyPair = stored
        console.log('[haex-pass] Loaded existing keypair from storage')
      }
      else {
        // Generate new keypair and save it
        this.keyPair = await generateKeyPair()
        await this.saveKeypair(this.keyPair)
        console.log('[haex-pass] Generated and saved new keypair')
      }

      this.clientId = await generateClientId(this.keyPair.publicKey)
      this.publicKeyBase64 = await exportPublicKey(this.keyPair.publicKey)
      console.log('[haex-pass] Initialized with clientId:', this.clientId)
    }
    catch (err) {
      console.error('[haex-pass] Initialization failed, using fallback:', err)
      // Fallback: generate new keypair without saving (in case storage is broken)
      this.keyPair = await generateKeyPair()
      this.clientId = await generateClientId(this.keyPair.publicKey)
      this.publicKeyBase64 = await exportPublicKey(this.keyPair.publicKey)
      console.log('[haex-pass] Fallback keypair with clientId:', this.clientId)
    }
  }

  private async loadKeypair(): Promise<KeyPair | null> {
    try {
      const result = await browser.storage.local.get(STORAGE_KEY_KEYPAIR)
      const stored = result[STORAGE_KEY_KEYPAIR] as { publicKey?: string, privateKey?: string } | undefined
      if (!stored || !stored.publicKey || !stored.privateKey) {
        return null
      }

      const publicKey = await importPublicKey(stored.publicKey)
      const privateKey = await importPrivateKey(stored.privateKey)
      return { publicKey, privateKey }
    }
    catch (err) {
      console.error('[haex-pass] Failed to load keypair:', err)
      return null
    }
  }

  private async saveKeypair(keyPair: KeyPair): Promise<void> {
    try {
      const publicKey = await exportPublicKey(keyPair.publicKey)
      const privateKey = await exportPrivateKey(keyPair.privateKey)
      await browser.storage.local.set({
        [STORAGE_KEY_KEYPAIR]: { publicKey, privateKey },
      })
    }
    catch (err) {
      console.error('[haex-pass] Failed to save keypair:', err)
    }
  }

  private generateRequestId(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return toHex(bytes)
  }

  private setError(code: ExternalConnectionErrorCode, message: string | null = null) {
    this.errorCode = code
    this.errorMessage = message
  }

  private clearError() {
    this.errorCode = ExternalConnectionErrorCode.NONE
    this.errorMessage = null
  }

  private notifyStateChange() {
    const connection: VaultConnection = {
      state: this.state,
      clientId: this.clientId,
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
    }
    this.stateChangeHandlers.forEach(handler => handler(connection))
  }

  onStateChange(handler: (state: VaultConnection) => void): () => void {
    this.stateChangeHandlers.add(handler)
    // Immediately notify with current state
    handler({
      state: this.state,
      clientId: this.clientId,
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
    })
    return () => this.stateChangeHandlers.delete(handler)
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  async connect(): Promise<void> {
    // Wait for initialization to complete
    await this.initPromise

    // If already connected but not paired, resend handshake to trigger new authorization request
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (this.state !== ExternalConnectionState.PAIRED) {
        console.log('[haex-pass] Already connected, resending handshake for authorization')
        this.sendHandshake()
      }
      return
    }

    this.state = ExternalConnectionState.CONNECTING
    this.clearError()
    this.notifyStateChange()

    // Get port from settings
    const port = await getWebSocketPort()
    const wsUrl = `ws://localhost:${port}`

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('[haex-pass] WebSocket connected')
          this.sendHandshake()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onclose = () => {
          console.log('[haex-pass] WebSocket closed')
          this.state = ExternalConnectionState.DISCONNECTED
          this.setError(ExternalConnectionErrorCode.CONNECTION_CLOSED)
          this.serverPublicKey = null
          this.notifyStateChange()
          // Don't auto-reconnect - user must manually reconnect to avoid
          // repeated authorization requests when using "allow once"
        }

        this.ws.onerror = (err) => {
          console.error('[haex-pass] WebSocket error:', err)
          this.setError(ExternalConnectionErrorCode.CONNECTION_FAILED, 'Connection failed - is haex-vault running?')
          this.state = ExternalConnectionState.DISCONNECTED
          this.notifyStateChange()
          reject(new Error(this.errorMessage || 'Connection failed'))
        }

        // Resolve after a short timeout if connection seems stable
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            resolve()
          }
        }, 100)
      }
      catch (err) {
        this.setError(ExternalConnectionErrorCode.CONNECTION_FAILED, `Failed to connect: ${err}`)
        this.state = ExternalConnectionState.DISCONNECTED
        this.notifyStateChange()
        reject(err)
      }
    })
  }

  private async sendHandshake(): Promise<void> {
    if (!this.ws || !this.clientId || !this.publicKeyBase64)
      return

    // Get extension identifiers (with dev_ prefix if dev mode is enabled)
    const extensionIds = await getExtensionIdentifiers()
    console.log('[haex-pass] Sending handshake with extension identifiers:', extensionIds)

    const handshake: HandshakeRequest = {
      type: 'handshake',
      version: PROTOCOL_VERSION,
      client: {
        clientId: this.clientId,
        clientName: CLIENT_NAME,
        publicKey: this.publicKeyBase64,
        // Request access to haex-pass extension (will be pre-selected in authorization dialog)
        requestedExtensions: [
          { name: extensionIds.name, extensionPublicKey: extensionIds.publicKey },
        ],
      },
    }

    console.log('[haex-pass] Sending handshake')
    this.ws.send(JSON.stringify(handshake))
  }

  private async handleMessage(data: string): Promise<void> {
    try {
      const message = JSON.parse(data) as ProtocolMessage

      switch (message.type) {
        case 'handshakeResponse':
          await this.handleHandshakeResponse(message)
          break

        case 'response':
          await this.handleEncryptedResponse(message)
          break

        case 'authorizationUpdate':
          this.handleAuthorizationUpdate(message)
          break

        case 'error':
          console.error('[haex-pass] Server error:', message.code, message.message)
          this.setError(
            message.code as ExternalConnectionErrorCode,
            message.message,
          )
          this.notifyStateChange()
          break

        case 'pong':
          // Ignore pong responses
          break

        default:
          console.warn('[haex-pass] Unknown message type:', (message as { type: string }).type)
      }
    }
    catch (err) {
      console.error('[haex-pass] Failed to handle message:', err)
    }
  }

  private async handleHandshakeResponse(response: HandshakeResponse): Promise<void> {
    console.log('[haex-pass] Received handshake response:', {
      authorized: response.authorized,
      pendingApproval: response.pendingApproval,
    })

    // Import server's public key
    if (response.serverPublicKey) {
      this.serverPublicKey = await importPublicKey(response.serverPublicKey)
    }

    if (response.authorized) {
      this.state = ExternalConnectionState.PAIRED
      console.log('[haex-pass] Client is authorized')
    }
    else if (response.pendingApproval) {
      this.state = ExternalConnectionState.PENDING_APPROVAL
      console.log('[haex-pass] Waiting for user approval in haex-vault')
    }
    else {
      this.state = ExternalConnectionState.CONNECTED
      console.log('[haex-pass] Connected but not authorized')
    }

    this.notifyStateChange()
  }

  private async handleEncryptedResponse(envelope: EncryptedEnvelope): Promise<void> {
    if (!this.keyPair) {
      console.error('[haex-pass] Cannot decrypt: no keypair')
      return
    }

    // Decrypt the response
    const decrypted = await decryptMessageEnvelope(
      {
        action: envelope.action,
        message: envelope.message,
        iv: envelope.iv,
        clientID: envelope.clientId,
        publicKey: envelope.publicKey,
      } as EncryptedMessage,
      this.keyPair.privateKey,
    )

    if (!decrypted) {
      console.error('[haex-pass] Failed to decrypt response')
      return
    }

    console.log('[haex-pass] Decrypted response:', decrypted)

    // Check if this is a response to a pending request
    const requestId = (decrypted as { requestId?: string }).requestId
    if (requestId && this.pendingRequests.has(requestId)) {
      const pending = this.pendingRequests.get(requestId)!
      clearTimeout(pending.timeout)
      this.pendingRequests.delete(requestId)
      pending.resolve(decrypted)
      return
    }

    // Notify message handlers for unsolicited messages
    this.messageHandlers.forEach(handler => handler(decrypted))
  }

  private handleAuthorizationUpdate(update: AuthorizationUpdate): void {
    if (update.authorized) {
      this.state = ExternalConnectionState.PAIRED
      console.log('[haex-pass] Authorization granted!')
    }
    else {
      this.state = ExternalConnectionState.CONNECTED
      console.log('[haex-pass] Authorization denied')
    }
    this.notifyStateChange()
  }

  async sendRequest<T = unknown>(action: string, payload: object, timeout = 10000): Promise<T> {
    // Wait for initialization
    await this.initPromise

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }

    if (!this.serverPublicKey || !this.keyPair) {
      throw new Error('Handshake not complete')
    }

    if (this.state !== ExternalConnectionState.PAIRED) {
      throw new Error('Not authorized')
    }

    const requestId = this.generateRequestId()
    const payloadWithId = { ...payload, requestId }

    // Get target extension identifiers
    const extensionIds = await getExtensionIdentifiers()
    console.log('[haex-pass] Sending request with extension identifiers:', extensionIds)

    // Create encrypted envelope
    const encrypted = await createEncryptedMessage(
      action,
      payloadWithId,
      this.clientId!,
      this.serverPublicKey,
    )

    // Wrap in protocol message with extension identifiers
    const request: EncryptedEnvelope = {
      type: 'request',
      action: encrypted.action,
      message: encrypted.message,
      iv: encrypted.iv,
      clientId: encrypted.clientID,
      publicKey: encrypted.publicKey,
      extensionPublicKey: extensionIds.publicKey,
      extensionName: extensionIds.name,
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('Request timeout'))
      }, timeout)

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutHandle,
      })

      this.ws!.send(JSON.stringify(request))
    })
  }

  async getItems(url: string, fields: string[]): Promise<unknown> {
    return this.sendRequest('get-items', { url, fields })
  }

  async setItem(entry: object): Promise<unknown> {
    return this.sendRequest('set-item', entry)
  }

  async getTotp(entryId: string): Promise<unknown> {
    return this.sendRequest('get-totp', { entryId })
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.state = ExternalConnectionState.DISCONNECTED
    this.serverPublicKey = null
    this.notifyStateChange()
  }

  getState(): VaultConnection {
    return {
      state: this.state,
      clientId: this.clientId,
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
    }
  }
}

// Singleton instance
export const vaultConnection = new VaultConnectionManager()
