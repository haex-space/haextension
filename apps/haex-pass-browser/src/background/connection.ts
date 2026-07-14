import type { ExternalConnection } from '@haex-space/vault-sdk'
import type { EncryptedMessage, KeyPair } from './crypto'
import { HAEX_PASS_METHODS } from '@haex-pass/api'
import {

  ExternalConnectionErrorCode,
  ExternalConnectionState,
} from '@haex-space/vault-sdk'
import { getWebSocketPort } from '~/logic/settings'
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

// Protocol v2: the vault requires clients to declare their requested
// permissions in the handshake (`ClientInfo.permissions`); v1 handshakes are
// rejected with PERMISSIONS_DECLARATION_REQUIRED.
const PROTOCOL_VERSION = 2
const CLIENT_NAME = 'haex-pass Browser Extension'
const STORAGE_KEY_KEYPAIR = 'haex-pass-keypair'
// 25 s is comfortably below the typical 30 s MV3 service-worker idle timeout
// and below most stateful firewalls' connection-track timeouts.
const PING_INTERVAL_MS = 25000

// All requests from this browser extension target the haex-vault core directly,
// not an installed extension. The sentinel values below are recognized by the
// haex-vault external_bridge to route requests to its built-in core handler.
const CORE_TARGET_PUBLIC_KEY = '__core__'
const CORE_TARGET_NAME = 'core'

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

type ProtocolMessage
  = | HandshakeRequest
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
    const stored = await this.loadKeypair()
    if (stored) {
      this.keyPair = stored
      console.log('[haex-pass] Loaded existing keypair from storage')
    } else {
      this.keyPair = await generateKeyPair()
      // Persist BEFORE deriving the clientId, so a save failure aborts init
      // instead of producing an ephemeral identity.
      await this.saveAndVerifyKeypair(this.keyPair)
      console.log('[haex-pass] Generated and saved new keypair')
    }

    this.clientId = await generateClientId(this.keyPair.publicKey)
    this.publicKeyBase64 = await exportPublicKey(this.keyPair.publicKey)
    console.log('[haex-pass] Initialized with clientId:', this.clientId)
  }

  private async loadKeypair(): Promise<KeyPair | null> {
    let stored: { publicKey?: string, privateKey?: string } | undefined
    try {
      const result = await browser.storage.local.get(STORAGE_KEY_KEYPAIR)
      stored = result[STORAGE_KEY_KEYPAIR] as { publicKey?: string, privateKey?: string } | undefined
    } catch (err) {
      console.error('[haex-pass] storage.local.get failed:', err)
      return null
    }

    if (!stored) {
      console.log('[haex-pass] storage.local has no keypair entry')
      return null
    }
    if (!stored.publicKey || !stored.privateKey) {
      console.warn('[haex-pass] storage.local entry is incomplete:', { hasPub: !!stored.publicKey, hasPriv: !!stored.privateKey })
      return null
    }

    try {
      const publicKey = await importPublicKey(stored.publicKey)
      const privateKey = await importPrivateKey(stored.privateKey)
      return { publicKey, privateKey }
    } catch (err) {
      // Stored bytes are unusable (format change, corruption). Drop them so
      // the caller generates and persists a fresh keypair instead of looping.
      console.error('[haex-pass] Stored keypair is unusable, clearing:', err)
      try {
        await browser.storage.local.remove(STORAGE_KEY_KEYPAIR)
      } catch (removeErr) {
        console.error('[haex-pass] storage.local.remove failed:', removeErr)
      }
      return null
    }
  }

  private async saveAndVerifyKeypair(keyPair: KeyPair): Promise<void> {
    const publicKey = await exportPublicKey(keyPair.publicKey)
    const privateKey = await exportPrivateKey(keyPair.privateKey)
    await browser.storage.local.set({
      [STORAGE_KEY_KEYPAIR]: { publicKey, privateKey },
    })

    // Full round-trip check: re-read from storage AND re-import as CryptoKeys.
    // String-equality on the base64 alone wouldn't catch an export/import
    // mismatch that would later make loadKeypair() return null on every
    // service-worker restart.
    const reloaded = await this.loadKeypair()
    if (!reloaded) {
      throw new Error('keypair save verification failed — storage.local does not return what we wrote')
    }
    const reloadedPublic = await exportPublicKey(reloaded.publicKey)
    if (reloadedPublic !== publicKey) {
      throw new Error('keypair save verification failed — re-imported public key differs from saved one')
    }
  }

  /**
   * Wait until the WebSocket handshake completed and the client is paired
   * (either via permanent or session authorization). Resolves the moment
   * state transitions to PAIRED, rejects on terminal failure states or after
   * the timeout elapses.
   *
   * Without this, content scripts that fire a request right after a service
   * worker wakeup race ahead of the handshake response and get
   * "Handshake not complete".
   */
  private async waitForPaired(timeoutMs: number): Promise<void> {
    if (this.state === ExternalConnectionState.PAIRED)
      return

    await new Promise<void>((resolve, reject) => {
      let unsubscribe: () => void = () => {}
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for handshake/authorization (state=${this.state})`))
      }, timeoutMs)

      unsubscribe = this.onStateChange((state) => {
        if (state.state === ExternalConnectionState.PAIRED) {
          clearTimeout(timer)
          unsubscribe()
          resolve()
        } else if (state.state === ExternalConnectionState.DISCONNECTED) {
          clearTimeout(timer)
          unsubscribe()
          reject(new Error(`Disconnected while waiting for pairing (error=${state.errorMessage ?? state.errorCode})`))
        }
      })
    })
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
    // Idempotent: concurrent callers share the same in-flight attempt.
    // Without this, two parallel sendRequest()s would each open their own
    // WebSocket and orphan all but the last one — leaving zombie sockets
    // open on haex-vault and a race between competing handshakes.
    if (this.connectPromise)
      return this.connectPromise

    // Fast path: already up and paired, no work to do.
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.state === ExternalConnectionState.PAIRED) {
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
        const ws = new WebSocket(wsUrl)
        this.ws = ws

        ws.onopen = () => {
          // Defend against an old WS firing onopen after we already started
          // a newer one: only act if this instance is still the live one.
          if (this.ws !== ws) {
            try {
              ws.close()
            } catch {
              /* ignore */
            }
            return
          }
          console.log('[haex-pass] WebSocket connected')
          this.sendHandshake()
        }

        ws.onmessage = (event) => {
          if (this.ws !== ws)
            return
          this.handleMessage(event.data)
        }

        ws.onclose = () => {
          if (this.ws !== ws)
            return
          console.log('[haex-pass] WebSocket closed')
          this.state = ExternalConnectionState.DISCONNECTED
          this.setError(ExternalConnectionErrorCode.CONNECTION_CLOSED)
          this.serverPublicKey = null
          this.stopPing()
          this.notifyStateChange()
        }

        ws.onerror = (err) => {
          if (this.ws !== ws)
            return
          console.error('[haex-pass] WebSocket error:', err)
          this.setError(ExternalConnectionErrorCode.CONNECTION_FAILED, 'Connection failed - is haex-vault running?')
          this.state = ExternalConnectionState.DISCONNECTED
          this.stopPing()
          this.notifyStateChange()
          reject(new Error(this.errorMessage || 'Connection failed'))
        }

        // Resolve after a short timeout if connection seems stable
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            resolve()
          }
        }, 100)
      } catch (err) {
        this.setError(ExternalConnectionErrorCode.CONNECTION_FAILED, `Failed to connect: ${err}`)
        this.state = ExternalConnectionState.DISCONNECTED
        this.notifyStateChange()
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

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private async sendHandshake(): Promise<void> {
    if (!this.ws || !this.clientId || !this.publicKeyBase64)
      return

    const handshake: HandshakeRequest = {
      type: 'handshake',
      version: PROTOCOL_VERSION,
      client: {
        clientId: this.clientId,
        clientName: CLIENT_NAME,
        publicKey: this.publicKeyBase64,
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
      this.state = ExternalConnectionState.PAIRED
      console.log('[haex-pass] Client is authorized')
      this.startPing()
    } else if (response.pendingApproval) {
      this.state = ExternalConnectionState.PENDING_APPROVAL
      console.log('[haex-pass] Waiting for user approval in haex-vault')
    } else {
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
      this.startPing()
    } else {
      this.state = ExternalConnectionState.CONNECTED
      console.log('[haex-pass] Authorization denied')
    }
    this.notifyStateChange()
  }

  async sendRequest<T = unknown>(action: string, payload: object, timeout = 10000): Promise<T> {
    // Wait for keypair initialization
    await this.initPromise

    // If the service worker just woke up, the WebSocket may not be connected
    // yet — trigger a connect (idempotent if already connected). Then wait
    // for the handshake to actually finish before sending the encrypted
    // request, otherwise we'd race the handshake response and throw.
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.state !== ExternalConnectionState.PAIRED) {
      await this.connect()
      // connect() resolves once the WS is OPEN, not once the handshake is
      // through. Wait specifically for PAIRED with a budget that's shorter
      // than the per-request timeout so a stuck pending approval doesn't
      // swallow the request silently.
      const handshakeBudget = Math.min(Math.max(timeout - 1000, 1000), timeout)
      await this.waitForPaired(handshakeBudget)
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

    // All requests target the haex-vault core, identified by the sentinel pair
    const request: EncryptedEnvelope = {
      type: 'request',
      action: encrypted.action,
      message: encrypted.message,
      iv: encrypted.iv,
      clientId: encrypted.clientID,
      publicKey: encrypted.publicKey,
      extensionPublicKey: CORE_TARGET_PUBLIC_KEY,
      extensionName: CORE_TARGET_NAME,
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
    return this.sendRequest(HAEX_PASS_METHODS.GET_ITEMS, { url, fields })
  }

  async createItem(entry: object): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.CREATE_ITEM, entry)
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
  }): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.PASSKEY_CREATE, payload)
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
  }): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.PASSKEY_GET, payload)
  }

  async listPasskeys(payload: {
    relyingPartyId?: string
    itemId?: string
    discoverableOnly?: boolean
  }): Promise<unknown> {
    return this.sendRequest(HAEX_PASS_METHODS.PASSKEY_LIST, payload)
  }

  disconnect() {
    this.stopPing()
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
