import type { EncryptedMessage, KeyPair } from './crypto'
import {
  createEncryptedMessage,
  decryptMessageEnvelope,
  exportPublicKey,
  generateClientId,
  generateKeyPair,
  importPublicKey,
  toHex,
} from './crypto'

const WEBSOCKET_PORT = 19455
const WEBSOCKET_URL = `ws://localhost:${WEBSOCKET_PORT}`
const PROTOCOL_VERSION = 1
const CLIENT_NAME = 'haex-pass Browser Extension'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'pending_approval' | 'paired'

export interface VaultConnection {
  state: ConnectionState
  clientId: string | null
  error: string | null
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

// Protocol message types (matching Rust ProtocolMessage enum)
interface ClientInfo {
  clientId: string
  clientName: string
  publicKey: string
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
  private state: ConnectionState = 'disconnected'
  private error: string | null = null
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private messageHandlers: Set<(message: unknown) => void> = new Set()
  private stateChangeHandlers: Set<(state: VaultConnection) => void> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private initPromise: Promise<void> | null = null

  constructor() {
    // Initialize keypair asynchronously
    this.initPromise = this.initialize()
  }

  private async initialize(): Promise<void> {
    this.keyPair = await generateKeyPair()
    this.clientId = await generateClientId(this.keyPair.publicKey)
    this.publicKeyBase64 = await exportPublicKey(this.keyPair.publicKey)
  }

  private generateRequestId(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return toHex(bytes)
  }

  private notifyStateChange() {
    const connection: VaultConnection = {
      state: this.state,
      clientId: this.clientId,
      error: this.error,
    }
    this.stateChangeHandlers.forEach(handler => handler(connection))
  }

  onStateChange(handler: (state: VaultConnection) => void): () => void {
    this.stateChangeHandlers.add(handler)
    // Immediately notify with current state
    handler({
      state: this.state,
      clientId: this.clientId,
      error: this.error,
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

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    this.state = 'connecting'
    this.error = null
    this.notifyStateChange()

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(WEBSOCKET_URL)

        this.ws.onopen = () => {
          console.log('[haex-pass] WebSocket connected')
          this.reconnectAttempts = 0
          this.sendHandshake()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onclose = () => {
          console.log('[haex-pass] WebSocket closed')
          this.state = 'disconnected'
          this.serverPublicKey = null
          this.notifyStateChange()
          this.scheduleReconnect()
        }

        this.ws.onerror = (err) => {
          console.error('[haex-pass] WebSocket error:', err)
          this.error = 'Connection failed - is haex-vault running?'
          this.state = 'disconnected'
          this.notifyStateChange()
          reject(new Error(this.error))
        }

        // Resolve after a short timeout if connection seems stable
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            resolve()
          }
        }, 100)
      }
      catch (err) {
        this.error = `Failed to connect: ${err}`
        this.state = 'disconnected'
        this.notifyStateChange()
        reject(err)
      }
    })
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[haex-pass] Max reconnect attempts reached')
      return
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000)
    console.log(`[haex-pass] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++
      this.connect().catch(() => {
        // Error already handled in connect()
      })
    }, delay)
  }

  private sendHandshake(): void {
    if (!this.ws || !this.clientId || !this.publicKeyBase64)
      return

    const handshake: HandshakeRequest = {
      type: 'handshake',
      version: PROTOCOL_VERSION,
      client: {
        clientId: this.clientId,
        clientName: CLIENT_NAME,
        publicKey: this.publicKeyBase64,
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
          this.error = message.message
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
      this.state = 'paired'
      console.log('[haex-pass] Client is authorized')
    }
    else if (response.pendingApproval) {
      this.state = 'pending_approval'
      console.log('[haex-pass] Waiting for user approval in haex-vault')
    }
    else {
      this.state = 'connected'
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
      this.state = 'paired'
      console.log('[haex-pass] Authorization granted!')
    }
    else {
      this.state = 'connected'
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

    if (this.state !== 'paired') {
      throw new Error('Not authorized')
    }

    const requestId = this.generateRequestId()
    const payloadWithId = { ...payload, requestId }

    // Create encrypted envelope
    const encrypted = await createEncryptedMessage(
      action,
      payloadWithId,
      this.clientId!,
      this.serverPublicKey,
    )

    // Wrap in protocol message
    const request: EncryptedEnvelope = {
      type: 'request',
      action: encrypted.action,
      message: encrypted.message,
      iv: encrypted.iv,
      clientId: encrypted.clientID,
      publicKey: encrypted.publicKey,
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

  async getLogins(url: string, fields: string[]): Promise<unknown> {
    return this.sendRequest('get-logins', { url, fields })
  }

  async setLogin(entry: object): Promise<unknown> {
    return this.sendRequest('set-login', entry)
  }

  async getTotp(entryId: string): Promise<unknown> {
    return this.sendRequest('get-totp', { entryId })
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.state = 'disconnected'
    this.serverPublicKey = null
    this.notifyStateChange()
  }

  getState(): VaultConnection {
    return {
      state: this.state,
      clientId: this.clientId,
      error: this.error,
    }
  }
}

// Singleton instance
export const vaultConnection = new VaultConnectionManager()
