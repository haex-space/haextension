/**
 * WebAuthn Bridge
 *
 * Dieses Modul verbindet das WebAuthn-Inject Script (MAIN world) mit dem
 * Background-Script. Es empfängt WebAuthn-Anfragen vom MAIN-Script
 * über window.postMessage und leitet sie an haex-pass weiter.
 *
 * Das WebAuthn-Inject Script wird vom Manifest automatisch bei document_start
 * im MAIN world geladen.
 */

import { sendMessage } from 'webext-bridge/content-script'

// Message Types
interface WebAuthnCreateRequest {
  type: 'HAEX_PASS_WEBAUTHN_CREATE'
  requestId: string
  data: {
    relyingPartyId: string
    relyingPartyName: string
    userHandle: string
    userName: string
    userDisplayName?: string
    challenge: string
    excludeCredentials?: string[]
    requireResidentKey?: boolean
    userVerification?: 'required' | 'preferred' | 'discouraged'
  }
}

interface WebAuthnGetRequest {
  type: 'HAEX_PASS_WEBAUTHN_GET'
  requestId: string
  data: {
    relyingPartyId: string
    challenge: string
    allowCredentials?: Array<{
      id: string
      type: 'public-key'
      transports?: string[]
    }>
    userVerification?: 'required' | 'preferred' | 'discouraged'
  }
}

type WebAuthnRequest = WebAuthnCreateRequest | WebAuthnGetRequest

// Sende Response zurück an das MAIN-Script
function sendResponse(requestId: string, type: 'create' | 'get', data?: unknown, error?: string) {
  const responseType = type === 'create'
    ? 'HAEX_PASS_WEBAUTHN_RESPONSE_CREATE'
    : 'HAEX_PASS_WEBAUTHN_RESPONSE_GET'

  window.postMessage({
    type: responseType,
    requestId,
    data,
    error,
  }, '*')
}

// Verarbeite WebAuthn Create Request
async function handleWebAuthnCreate(request: WebAuthnCreateRequest) {
  console.log('[HaexPass Bridge] Processing create request:', request.requestId)

  try {
    // Sende an Background-Script
    const response = await sendMessage('passkey-create', request.data, 'background')

    console.log('[HaexPass Bridge] Create response:', response)

    if (response && (response as { success: boolean }).success) {
      const haexResponse = response as { success: boolean, data?: unknown }
      sendResponse(request.requestId, 'create', haexResponse.data)
    } else {
      const errorResponse = response as { error?: string }
      sendResponse(request.requestId, 'create', undefined, errorResponse.error || 'Unknown error')
    }
  } catch (err) {
    console.error('[HaexPass Bridge] Create error:', err)
    sendResponse(request.requestId, 'create', undefined, 'NO_HAEX_PASS_CONNECTION')
  }
}

// Verarbeite WebAuthn Get Request
async function handleWebAuthnGet(request: WebAuthnGetRequest) {
  console.log('[HaexPass Bridge] Processing get request:', request.requestId)

  try {
    // Sende an Background-Script
    const response = await sendMessage('passkey-get', request.data, 'background')

    console.log('[HaexPass Bridge] Get response:', response)

    if (response && (response as { success: boolean }).success) {
      const haexResponse = response as { success: boolean, data?: unknown }
      sendResponse(request.requestId, 'get', haexResponse.data)
    } else {
      const errorResponse = response as { error?: string }
      sendResponse(request.requestId, 'get', undefined, errorResponse.error || 'Unknown error')
    }
  } catch (err) {
    console.error('[HaexPass Bridge] Get error:', err)
    sendResponse(request.requestId, 'get', undefined, 'NO_HAEX_PASS_CONNECTION')
  }
}

// Empfange Nachrichten vom MAIN-Script
function handleMessage(event: MessageEvent) {
  // Ignoriere Nachrichten von anderen Origins
  if (event.source !== window) return

  const message = event.data as WebAuthnRequest

  // Nur unsere Nachrichten verarbeiten
  if (!message.type?.startsWith('HAEX_PASS_WEBAUTHN_')) return
  if (message.type.includes('RESPONSE')) return // Ignoriere Responses

  console.log('[HaexPass Bridge] Received request:', message.type, message.requestId)

  if (message.type === 'HAEX_PASS_WEBAUTHN_CREATE') {
    handleWebAuthnCreate(message as WebAuthnCreateRequest)
  } else if (message.type === 'HAEX_PASS_WEBAUTHN_GET') {
    handleWebAuthnGet(message as WebAuthnGetRequest)
  }
}

// Initialisiere die WebAuthn Bridge
export function initWebAuthnBridge() {
  console.log('[HaexPass Bridge] Initializing WebAuthn bridge')

  // Registriere Message Handler für Kommunikation mit dem MAIN-Script
  window.addEventListener('message', handleMessage)
}
