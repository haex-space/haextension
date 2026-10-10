/**
 * WebAuthn Injection Script
 *
 * Dieses Script läuft im MAIN world (Page-Kontext) und überschreibt
 * die WebAuthn APIs (navigator.credentials.create/get).
 *
 * Die Kommunikation mit dem Extension-Background erfolgt über
 * window.postMessage -> Content-Script (ISOLATED) -> Background.
 *
 * Dieses Script wird bei document_start geladen, um die API
 * vor dem Laden der Seite zu überschreiben.
 */

import { mustUseBrowserNative } from './webauthn-routing'

// Speichere die originalen WebAuthn-Methoden
const originalCredentials = navigator.credentials
const originalCreate = originalCredentials.create?.bind(originalCredentials)
const originalGet = originalCredentials.get?.bind(originalCredentials)

// Prüfe ob WebAuthn überhaupt verfügbar ist
if (!originalCreate || !originalGet) {
  console.log('[HaexPass WebAuthn] WebAuthn not available on this page')
} else {

// Generiere eine eindeutige Request-ID
function generateRequestId(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// ArrayBuffer zu Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Base64 zu ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// Base64 zu Base64URL (für Credential ID)
function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const base64 = arrayBufferToBase64(buffer)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Prüfe ob es sich um eine WebAuthn PublicKeyCredential Anfrage handelt
function isPublicKeyCredentialRequest(
  options: CredentialCreationOptions | CredentialRequestOptions
): boolean {
  return 'publicKey' in options && options.publicKey !== undefined
}

// Konvertiere WebAuthn Create Options für haex-pass
function convertCreateOptions(options: PublicKeyCredentialCreationOptions): Record<string, unknown> {
  return {
    relyingPartyId: options.rp?.id || window.location.hostname,
    relyingPartyName: options.rp?.name || window.location.hostname,
    userHandle: arrayBufferToBase64(options.user.id as ArrayBuffer),
    userName: options.user.name,
    userDisplayName: options.user.displayName || options.user.name,
    challenge: arrayBufferToBase64(options.challenge as ArrayBuffer),
    excludeCredentials: options.excludeCredentials?.map(cred =>
      arrayBufferToBase64(cred.id as ArrayBuffer)
    ) || [],
    // Passkeys sollten discoverable sein, außer wenn explizit discouraged
    // 'required' = muss discoverable sein
    // 'preferred' = sollte discoverable sein (default)
    // 'discouraged' = sollte nicht discoverable sein
    requireResidentKey: options.authenticatorSelection?.residentKey !== 'discouraged' &&
      options.authenticatorSelection?.requireResidentKey !== false,
    userVerification: options.authenticatorSelection?.userVerification || 'preferred',
  }
}

// Konvertiere WebAuthn Get Options für haex-pass
function convertGetOptions(options: PublicKeyCredentialRequestOptions): Record<string, unknown> {
  return {
    relyingPartyId: options.rpId || window.location.hostname,
    challenge: arrayBufferToBase64(options.challenge as ArrayBuffer),
    allowCredentials: options.allowCredentials?.map(cred => ({
      id: arrayBufferToBase64(cred.id as ArrayBuffer),
      type: cred.type,
      transports: cred.transports,
    })),
    userVerification: options.userVerification || 'preferred',
  }
}

// Erstelle ein PublicKeyCredential aus der haex-pass Create Response
function createPublicKeyCredentialFromCreateResponse(
  response: {
    credentialId: string
    publicKey: string
    publicKeyCose: string
    attestationObject: string
    clientDataJson: string
    transports: string[]
  }
): PublicKeyCredential {
  const credentialIdBuffer = base64ToArrayBuffer(response.credentialId)
  const attestationObjectBuffer = base64ToArrayBuffer(response.attestationObject)
  const clientDataJsonBuffer = base64ToArrayBuffer(response.clientDataJson)

  // Erstelle AuthenticatorAttestationResponse
  const attestationResponse = {
    clientDataJSON: clientDataJsonBuffer,
    attestationObject: attestationObjectBuffer,
    getTransports: () => response.transports as AuthenticatorTransport[],
    getPublicKey: () => base64ToArrayBuffer(response.publicKey),
    getPublicKeyAlgorithm: () => -7, // ES256
    getAuthenticatorData: () => attestationObjectBuffer,
  }

  // Erstelle das PublicKeyCredential-Objekt
  const credential = {
    id: arrayBufferToBase64url(credentialIdBuffer),
    rawId: credentialIdBuffer,
    type: 'public-key' as const,
    response: attestationResponse,
    authenticatorAttachment: 'platform' as AuthenticatorAttachment,
    getClientExtensionResults: () => ({}),
  }

  return credential as unknown as PublicKeyCredential
}

// Erstelle ein PublicKeyCredential aus der haex-pass Get Response
function createPublicKeyCredentialFromGetResponse(
  response: {
    credentialId: string
    authenticatorData: string
    signature: string
    clientDataJson: string
    userHandle?: string
  }
): PublicKeyCredential {
  const credentialIdBuffer = base64ToArrayBuffer(response.credentialId)
  const authenticatorDataBuffer = base64ToArrayBuffer(response.authenticatorData)
  const signatureBuffer = base64ToArrayBuffer(response.signature)
  const clientDataJsonBuffer = base64ToArrayBuffer(response.clientDataJson)
  const userHandleBuffer = response.userHandle ? base64ToArrayBuffer(response.userHandle) : null

  // Erstelle AuthenticatorAssertionResponse
  const assertionResponse = {
    clientDataJSON: clientDataJsonBuffer,
    authenticatorData: authenticatorDataBuffer,
    signature: signatureBuffer,
    userHandle: userHandleBuffer,
  }

  // Erstelle das PublicKeyCredential-Objekt
  const credential = {
    id: arrayBufferToBase64url(credentialIdBuffer),
    rawId: credentialIdBuffer,
    type: 'public-key' as const,
    response: assertionResponse,
    authenticatorAttachment: 'platform' as AuthenticatorAttachment,
    getClientExtensionResults: () => ({}),
  }

  return credential as unknown as PublicKeyCredential
}

type RequestKind = 'create' | 'get'
type WebAuthnOptions = CredentialCreationOptions | CredentialRequestOptions

// The bridge acknowledges a request the moment it receives it. Without that
// ack the content script is not listening (not loaded yet, or orphaned after
// an extension update) and the request goes to the browser instead of hanging.
const BRIDGE_ACK_TIMEOUT_MS = 2000
// Safety net once the bridge has the request: it covers the consent prompt
// and the vault round-trip, which waits up to 130 s for the user to confirm in
// the vault app. If we hit it the bridge is broken.
const BRIDGE_RESPONSE_TIMEOUT_MS = 300000

interface PendingRequest {
  kind: RequestKind
  options: WebAuthnOptions
  resolve: (value: Credential | null) => void
  reject: (reason: unknown) => void
  timer: ReturnType<typeof setTimeout>
  onAbort: () => void
}

const pendingRequests = new Map<string, PendingRequest>()

function callBrowser(kind: RequestKind, options?: WebAuthnOptions): Promise<Credential | null> {
  return kind === 'create'
    ? originalCreate!(options as CredentialCreationOptions | undefined)
    : originalGet!(options as CredentialRequestOptions | undefined)
}

/** Remove a request from the pending set and detach its timer and abort listener. */
function settle(requestId: string): PendingRequest | undefined {
  const pending = pendingRequests.get(requestId)
  if (!pending)
    return undefined
  pendingRequests.delete(requestId)
  clearTimeout(pending.timer)
  pending.options.signal?.removeEventListener('abort', pending.onAbort)
  return pending
}

function fallBackToBrowser(requestId: string, reason: string) {
  const pending = settle(requestId)
  if (!pending)
    return
  console.log('[HaexPass WebAuthn] Falling back to browser WebAuthn:', reason)
  callBrowser(pending.kind, pending.options).then(pending.resolve, pending.reject)
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

function convertOptions(kind: RequestKind, options: WebAuthnOptions): Record<string, unknown> {
  return kind === 'create'
    ? convertCreateOptions((options as CredentialCreationOptions).publicKey!)
    : convertGetOptions((options as CredentialRequestOptions).publicKey!)
}

function intercept(kind: RequestKind, options?: WebAuthnOptions): Promise<Credential | null> {
  if (!options || !isPublicKeyCredentialRequest(options) || mustUseBrowserNative(kind, options))
    return callBrowser(kind, options)

  const signal = options.signal
  if (signal?.aborted)
    return Promise.reject(abortReason(signal))

  let data: Record<string, unknown>
  try {
    data = convertOptions(kind, options)
  } catch (err) {
    console.warn('[HaexPass WebAuthn] Could not read request options, using browser:', err)
    return callBrowser(kind, options)
  }

  const requestId = generateRequestId()
  console.log(`[HaexPass WebAuthn] Intercepted credentials.${kind} for:`, data.relyingPartyId)

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      if (!settle(requestId))
        return
      // Lets the bridge close a consent prompt nobody needs any more.
      window.postMessage({ type: 'HAEX_PASS_WEBAUTHN_ABORT', requestId }, '*')
      reject(abortReason(signal!))
    }
    pendingRequests.set(requestId, {
      kind,
      options,
      resolve,
      reject,
      onAbort,
      timer: setTimeout(() => fallBackToBrowser(requestId, 'bridge did not acknowledge'), BRIDGE_ACK_TIMEOUT_MS),
    })
    signal?.addEventListener('abort', onAbort, { once: true })

    window.postMessage({
      type: kind === 'create' ? 'HAEX_PASS_WEBAUTHN_CREATE' : 'HAEX_PASS_WEBAUTHN_GET',
      requestId,
      data,
    }, '*')
  })
}

navigator.credentials.create = (options?: CredentialCreationOptions) => intercept('create', options)
navigator.credentials.get = (options?: CredentialRequestOptions) => intercept('get', options)

function handleAck(requestId: string) {
  const pending = pendingRequests.get(requestId)
  if (!pending)
    return
  clearTimeout(pending.timer)
  pending.timer = setTimeout(() => fallBackToBrowser(requestId, 'bridge did not respond in time'), BRIDGE_RESPONSE_TIMEOUT_MS)
}

// Empfange Acks und Responses vom Content-Script
window.addEventListener('message', (event) => {
  // Ignoriere Nachrichten von anderen Origins
  if (event.source !== window) return

  const message = event.data as {
    type: string
    requestId: string
    data?: unknown
    error?: string
  }

  if (message.type === 'HAEX_PASS_WEBAUTHN_ACK') {
    handleAck(message.requestId)
    return
  }

  // Nur unsere Response-Nachrichten verarbeiten
  if (!message.type?.startsWith('HAEX_PASS_WEBAUTHN_RESPONSE_')) return

  // Bei JEDEM Fehler auf Browser-Fallback umschalten
  // Wir können nicht alle möglichen Fehlermeldungen von verschiedenen Seiten vorhersehen,
  // daher: Nur bei explizitem Erfolg haex-pass verwenden, sonst immer Browser-Fallback
  if (message.error) {
    fallBackToBrowser(message.requestId, message.error)
    return
  }

  const pending = settle(message.requestId)
  if (!pending) {
    console.warn('[HaexPass WebAuthn] No pending request for:', message.requestId)
    return
  }

  // Erfolgreiche Response verarbeiten
  try {
    if (message.type === 'HAEX_PASS_WEBAUTHN_RESPONSE_CREATE') {
      const credential = createPublicKeyCredentialFromCreateResponse(
        message.data as {
          credentialId: string
          publicKey: string
          publicKeyCose: string
          attestationObject: string
          clientDataJson: string
          transports: string[]
        }
      )
      pending.resolve(credential)
    } else if (message.type === 'HAEX_PASS_WEBAUTHN_RESPONSE_GET') {
      const credential = createPublicKeyCredentialFromGetResponse(
        message.data as {
          credentialId: string
          authenticatorData: string
          signature: string
          clientDataJson: string
          userHandle?: string
        }
      )
      pending.resolve(credential)
    }
  } catch (err) {
    console.error('[HaexPass WebAuthn] Error processing response:', err)
    pending.reject(new DOMException('Failed to process credential response', 'UnknownError'))
  }
})

console.log('[HaexPass WebAuthn] WebAuthn APIs intercepted')

} // end of if (originalCreate && originalGet)
