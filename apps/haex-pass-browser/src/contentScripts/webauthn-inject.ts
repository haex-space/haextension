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

// Speichere die originalen WebAuthn-Methoden
const originalCredentials = navigator.credentials
const originalCreate = originalCredentials.create?.bind(originalCredentials)
const originalGet = originalCredentials.get?.bind(originalCredentials)

// Prüfe ob WebAuthn überhaupt verfügbar ist
if (!originalCreate || !originalGet) {
  console.log('[HaexPass WebAuthn] WebAuthn not available on this page')
} else {

// Request-Tracking für asynchrone Responses
const pendingRequests = new Map<string, {
  resolve: (value: Credential | null) => void
  reject: (reason: Error) => void
  type: 'create' | 'get'
  options: CredentialCreationOptions | CredentialRequestOptions
}>()

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

// Überschreibe navigator.credentials.create
navigator.credentials.create = async function(
  options?: CredentialCreationOptions
): Promise<Credential | null> {
  // Keine Options oder keine PublicKey-Anfrage -> Original verwenden
  if (!options || !isPublicKeyCredentialRequest(options)) {
    return originalCreate(options)
  }

  const publicKeyOptions = options.publicKey!
  const requestId = generateRequestId()
  const relyingPartyId = publicKeyOptions.rp?.id || window.location.hostname

  console.log('[HaexPass WebAuthn] Intercepted credentials.create for:', relyingPartyId)

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId)
      console.log('[HaexPass WebAuthn] Request timed out, falling back to browser')
      originalCreate(options).then(resolve).catch(reject)
    }, 60000) // 60 Sekunden Timeout

    pendingRequests.set(requestId, {
      resolve: (credential) => {
        clearTimeout(timeoutId)
        resolve(credential)
      },
      reject: (error) => {
        clearTimeout(timeoutId)
        reject(error)
      },
      type: 'create',
      options,
    })

    // Sende Nachricht an Content-Script (ISOLATED world)
    window.postMessage({
      type: 'HAEX_PASS_WEBAUTHN_CREATE',
      requestId,
      data: convertCreateOptions(publicKeyOptions),
    }, '*')
  })
}

// Überschreibe navigator.credentials.get
navigator.credentials.get = async function(
  options?: CredentialRequestOptions
): Promise<Credential | null> {
  // Keine Options oder keine PublicKey-Anfrage -> Original verwenden
  if (!options || !isPublicKeyCredentialRequest(options)) {
    return originalGet(options)
  }

  const publicKeyOptions = options.publicKey!
  const requestId = generateRequestId()
  const relyingPartyId = publicKeyOptions.rpId || window.location.hostname

  console.log('[HaexPass WebAuthn] Intercepted credentials.get for:', relyingPartyId)

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId)
      console.log('[HaexPass WebAuthn] Request timed out, falling back to browser')
      originalGet(options).then(resolve).catch(reject)
    }, 60000) // 60 Sekunden Timeout

    pendingRequests.set(requestId, {
      resolve: (credential) => {
        clearTimeout(timeoutId)
        resolve(credential)
      },
      reject: (error) => {
        clearTimeout(timeoutId)
        reject(error)
      },
      type: 'get',
      options,
    })

    // Sende Nachricht an Content-Script (ISOLATED world)
    window.postMessage({
      type: 'HAEX_PASS_WEBAUTHN_GET',
      requestId,
      data: convertGetOptions(publicKeyOptions),
    }, '*')
  })
}

// Empfange Responses vom Content-Script
window.addEventListener('message', (event) => {
  // Ignoriere Nachrichten von anderen Origins
  if (event.source !== window) return

  const message = event.data as {
    type: string
    requestId: string
    data?: unknown
    error?: string
  }

  // Nur unsere Response-Nachrichten verarbeiten
  if (!message.type?.startsWith('HAEX_PASS_WEBAUTHN_RESPONSE_')) return

  console.log('[HaexPass WebAuthn] Received response:', message.type, message.requestId)

  const pending = pendingRequests.get(message.requestId)
  if (!pending) {
    console.warn('[HaexPass WebAuthn] No pending request for:', message.requestId)
    return
  }

  pendingRequests.delete(message.requestId)

  // Bei JEDEM Fehler auf Browser-Fallback umschalten
  // Wir können nicht alle möglichen Fehlermeldungen von verschiedenen Seiten vorhersehen,
  // daher: Nur bei explizitem Erfolg haex-pass verwenden, sonst immer Browser-Fallback
  if (message.error) {
    console.log('[HaexPass WebAuthn] Falling back to browser WebAuthn due to error:', message.error)
    if (pending.type === 'create') {
      originalCreate(pending.options as CredentialCreationOptions)
        .then(pending.resolve)
        .catch(pending.reject)
    } else {
      originalGet(pending.options as CredentialRequestOptions)
        .then(pending.resolve)
        .catch(pending.reject)
    }
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
