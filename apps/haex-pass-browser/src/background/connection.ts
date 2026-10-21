import type { ExternalConnection } from '@haex-space/vault-sdk'
import type { EncryptedMessage, KeyPair } from './crypto'
import type { AuthorizationUpdate, EncryptedEnvelope, HandshakeResponse, ProtocolMessage } from './protocol'
import {

  ExternalConnectionErrorCode,
  ExternalConnectionState,
} from '@haex-space/vault-sdk'
import { HAEX_PASS_METHODS } from '~/logic/haexPassApi'
import { getWebSocketPort } from '~/logic/settings'
import { ConnectionStatus } from './connectionStatus'
import {
  createEncryptedMessage,
  decryptMessageEnvelope,
  exportPublicKey,
  generateClientId,
  generateKeyPair,
  importPublicKey,
  toHex,
} from './crypto'
import { loadKeypair, saveAndVerifyKeypair } from './keypairStorage'
import { createHandshakeRequest, createRequestEnvelope } from './protocol'

// 25 s is comfortably below the typical 30 s MV3 service-worker idle timeout
// and below most stateful firewalls' connection-track timeouts.
const PING_INTERVAL_MS = 25000

// Requests the vault may hold open while it asks the user: holzi shows a
// presence confirmation for every passkey (it expires after 120 s, 049 FR-030)
// and may ask for a wider grant before saving an entry (049 FR-015). The extra
// seconds let a last-moment answer still arrive.
const USER_CONFIRMATION_TIMEOUT_MS = 130000

// Re-export SDK types for use in the extension
export { type ExternalConnection, ExternalConnectionErrorCode, ExternalConnectionState }
// Backward compatibility aliases
export type ConnectionState = ExternalConnectionState
export type VaultConnection = ExternalConnection

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

class VaultConnectionManager {
  private ws: WebSocket | null = null
  private keyPair: KeyPair | null = null
  private serverPublicKey: CryptoKey | null = null
  private clientId: string | null = null
  private publicKeyBase64: string | null = null
  private readonly status = new ConnectionStatus(() => this.clientId)
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private messageHandlers: Set<(message: unknown) => void> = new Set()
  private initPromise: Promise<void> | null = null
  // Cached in-flight connect() so concurrent callers (popup + content scripts
  // racing on get-items) reuse one WebSocket instead of opening orphaned ones.
  private connectPromise: Promise<void> | null = null
  // Keep-alive timer that pings haex-vault every PING_INTERVAL_MS. Keeps the
  // MV3 service worker alive AND prevents idle WS timeouts.
  private pingInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Initialize keypair asynchronously
    this.initPromise = this.initialize()
  }

  private async initialize(): Promise<void> {
    // Always try storage first — a stable clientId across service-worker
    // restarts is what makes haex-vault's permanent authorization useful.
    const stored = await loadKeypair()
    if (stored) {
      this.keyPair = stored
      console.log('[haex-pass] Loaded existing keypair from storage')
    } else {
      this.keyPair = await generateKeyPair()
      // Persist BEFORE deriving the clientId, so a save failure aborts init
      // instead of producing an ephemeral identity.
      await saveAndVerifyKeypair(this.keyPair)
      console.log('[haex-pass] Generated and saved new keypair')
    }

    this.clientId = await generateClientId(this.keyPair.publicKey)
    this.publicKeyBase64 = await exportPublicKey(this.keyPair.publicKey)
    console.log('[haex-pass] Initialized with clientId:', this.clientId)
  }

  private generateRequestId(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return toHex(bytes)
  }

  onStateChange(handler: (state: VaultConnection) => void): () => void {
    return this.status.subscribe(handler)
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  async connect(): Promise<void> {
    // Idempotent: concurrent callers share the same in-flight attempt.
    // Without this, two parallel sendRequest()s would each open their own
    // WebSocket and orphan all but the last one — leaving zombie sockets
    // open on haex-vault and a race between competing handshakes.
    if (this.connectPromise)
      return this.connectPromise

    // Fast path: already up and paired, no work to do.
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.status.state === ExternalConnectionState.PAIRED) {
      return
    }

    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private async doConnect(): Promise<void> {
    // Wait for keypair initialization to complete
    await this.initPromise

    // If already connected but not paired, resend handshake to trigger new authorization request
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (this.status.state !== ExternalConnectionState.PAIRED) {
        console.log('[haex-pass] Already connected, resending handshake for authorization')
        this.sendHandshake()
      }
      return
    }

    this.status.state = ExternalConnectionState.CONNECTING
    this.status.clearError()
    this.status.notify()

    // Get port from settings
    const port = await getWebSocketPort()
    const wsUrl = `ws://localhost:${port}`

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl)
        this.ws = ws

        // The promise settles on the first of open, close or error. Every
        // handler settles it, also for a socket that was replaced meanwhile:
        // the cached connectPromise would otherwise never clear.
        ws.onopen = () => {
          // Defend against an old WS firing onopen after we already started
          // a newer one: only act if this instance is still the live one.
          if (this.ws !== ws) {
            try {
              ws.close()
            } catch {
              /* ignore */
            }
            reject(new Error('Connection was replaced'))
            return
          }
          console.log('[haex-pass] WebSocket connected')
          this.sendHandshake()
          resolve()
        }

        ws.onmessage = (event) => {
          if (this.ws !== ws)
            return
          this.handleMessage(event.data)
        }

        ws.onclose = () => {
          reject(new Error('Connection closed'))
          if (this.ws !== ws)
            return
          console.log('[haex-pass] WebSocket closed')
          this.status.state = ExternalConnectionState.DISCONNECTED
          this.status.setError(ExternalConnectionErrorCode.CONNECTION_CLOSED)
          this.serverPublicKey = null
          this.stopPing()
          this.rejectPendingRequests('Connection closed')
          this.status.notify()
        }

        ws.onerror = (err) => {
          if (this.ws !== ws) {
            reject(new Error('Connection failed'))
            return
          }
          console.error('[haex-pass] WebSocket error:', err)
          this.status.setError(ExternalConnectionErrorCode.CONNECTION_FAILED, 'Connection failed - is HaexVault running?')
          this.status.state = ExternalConnectionState.DISCONNECTED
          this.stopPing()
          this.rejectPendingRequests('Connection failed')
          this.status.notify()
          reject(new Error(this.status.errorMessage || 'Connection failed'))
        }
      } catch (err) {
        this.status.setError(ExternalConnectionErrorCode.CONNECTION_FAILED, `Failed to connect: ${err}`)
        this.status.state = ExternalConnectionState.DISCONNECTED
        this.status.notify()
        reject(err)
      }
    })
  }

  private startPing() {
    if (this.pingInterval)
      return
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }))
        } catch (err) {
          console.error('[haex-pass] Ping failed:', err)
        }
      }
    }, PING_INTERVAL_MS)
  }

  /** No answer can arrive on a closed socket; fail now instead of at each request's timeout. */
  private rejectPendingRequests(reason: string) {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(reason))
    }
    this.pendingRequests.clear()
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private async sendHandshake(): Promise<void> {
    if (!this.ws || !this.clientId || !this.publicKeyBase64)
      return

    const handshake = createHandshakeRequest(this.clientId, this.publicKeyBase64)

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
          this.status.setError(
            message.code as ExternalConnectionErrorCode,
            message.message,
          )
          this.status.notify()
          break

        case 'pong':
          // Ignore pong responses
          break

        default:
          console.warn('[haex-pass] Unknown message type:', (message as { type: string }).type)
      }
    } catch (err) {
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
      this.status.state = ExternalConnectionState.PAIRED
      console.log('[haex-pass] Client is authorized')
      this.startPing()
    } else if (response.pendingApproval) {
      this.status.state = ExternalConnectionState.PENDING_APPROVAL
      console.log('[haex-pass] Waiting for user approval in haex-vault')
    } else {
      this.status.state = ExternalConnectionState.CONNECTED
      console.log('[haex-pass] Connected but not authorized')
    }

    this.status.notify()
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
      this.status.state = ExternalConnectionState.PAIRED
      console.log('[haex-pass] Authorization granted!')
      this.startPing()
    } else {
      this.status.state = ExternalConnectionState.CONNECTED
      console.log('[haex-pass] Authorization denied')
    }
    this.status.notify()
  }

  async sendRequest<T = unknown>(action: string, payload: object, timeout = 10000): Promise<T> {
    // Wait for keypair initialization
    await this.initPromise

    // If the service worker just woke up, the WebSocket may not be connected
    // yet — trigger a connect (idempotent if already connected). Then wait
    // for the handshake to actually finish before sending the encrypted
    // request, otherwise we'd race the handshake response and throw.
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.status.state !== ExternalConnectionState.PAIRED) {
      await this.connect()
      // connect() resolves once the WS is OPEN, not once the handshake is
      // through. Wait specifically for PAIRED with a budget that's shorter
      // than the per-request timeout so a stuck pending approval doesn't
      // swallow the request silently.
      const handshakeBudget = Math.min(Math.max(timeout - 1000, 1000), timeout)
      await this.status.waitForPaired(handshakeBudget)
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }

    if (!this.serverPublicKey || !this.keyPair) {
      throw new Error('Handshake not complete')
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

    const request = createRequestEnvelope(encrypted)

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
    return this.sendRequest(HAEX_PASS_METHODS.GET_ITEMS, { url, fields })
  }

  async createItem(entry: object): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.CREATE_ITEM, entry, USER_CONFIRMATION_TIMEOUT_MS)
  }

  async getTotp(entryId: string): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.GET_TOTP, { entryId })
  }

  async getPasswordConfig(): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.GET_PASSWORD_CONFIG, {})
  }

  async getPasswordPresets(): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.GET_PASSWORD_PRESETS, {})
  }

  async createPasskey(payload: {
    relyingPartyId: string
    relyingPartyName: string
    userHandle: string
    userName: string
    userDisplayName?: string
    challenge: string
    excludeCredentials?: string[]
    requireResidentKey?: boolean
    userVerification?: 'required' | 'preferred' | 'discouraged'
    origin: string
  }): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.PASSKEY_CREATE, payload, USER_CONFIRMATION_TIMEOUT_MS)
  }

  async getPasskey(payload: {
    relyingPartyId: string
    challenge: string
    allowCredentials?: Array<{
      id: string
      type: 'public-key'
      transports?: string[]
    }>
    userVerification?: 'required' | 'preferred' | 'discouraged'
    origin: string
  }): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.PASSKEY_GET, payload, USER_CONFIRMATION_TIMEOUT_MS)
  }

  async listPasskeys(payload: {
    relyingPartyId?: string
    itemId?: string
    discoverableOnly?: boolean
  }, timeout?: number): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.PASSKEY_LIST, payload, timeout)
  }

  disconnect() {
    this.stopPing()
    this.rejectPendingRequests('Disconnected')
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.status.state = ExternalConnectionState.DISCONNECTED
    this.serverPublicKey = null
    this.status.notify()
  }

  getState(): VaultConnection {
    return this.status.snapshot()
  }
}

// Singleton instance
export const vaultConnection = new VaultConnectionManager()
