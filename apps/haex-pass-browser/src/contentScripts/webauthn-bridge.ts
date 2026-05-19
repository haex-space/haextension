/**
 * WebAuthn Bridge
 *
 * Verbindet das WebAuthn-Inject Script (MAIN world) mit dem Background-Script
 * und entscheidet pro Relying-Party, ob die Anfrage über haex-vault läuft
 * oder an die Browser-native WebAuthn-Implementierung durchgereicht wird.
 *
 * Entscheidungsfluss bei einer Anfrage:
 *   1. Lookup gespeicherter User-Wahl für die rp.id.
 *   2. Bei Treffer: Anfrage entsprechend routen.
 *   3. Bei Miss: Consent-Prompt im Page-Overlay anzeigen, Wahl + optional
 *      "merken" abwarten, anschließend routen.
 */

import type { PasskeyHandler } from '~/logic/settings'
import { sendMessage } from 'webext-bridge/content-script'
import { getPasskeyPref, setPasskeyPref } from '~/logic/settings'
import { requestPasskeyConsent } from './passkey-consent'

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

// Sentinel error consumed by webauthn-inject.ts to trigger the
// originalCreate/originalGet fallback path. Anything else is treated as a
// real failure and surfaced to the page.
const USE_BROWSER_NATIVE = 'USE_BROWSER_NATIVE'

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

/**
 * Determine who should handle this WebAuthn call. Returns the stored choice
 * if any, otherwise shows the consent prompt and returns the user's pick.
 * If the user cancels the prompt, returns null and the caller should report
 * a failure (rather than falling back silently).
 */
async function resolveHandler(
  rpId: string,
  rpDisplayName: string,
  kind: 'create' | 'get',
): Promise<PasskeyHandler | null> {
  const existing = await getPasskeyPref(rpId)
  if (existing)
    return existing

  const decision = await requestPasskeyConsent({
    rpId,
    rpDisplayName,
    kind,
  })
  if (!decision)
    return null

  if (decision.remember) {
    await setPasskeyPref(rpId, decision.choice).catch((err) => {
      console.warn('[HaexPass Bridge] Failed to persist passkey preference:', err)
    })
  }
  return decision.choice
}

async function handleWebAuthnCreate(request: WebAuthnCreateRequest) {
  const { relyingPartyId, relyingPartyName } = request.data

  const handler = await resolveHandler(relyingPartyId, relyingPartyName || relyingPartyId, 'create')
  if (handler === null) {
    sendResponse(request.requestId, 'create', undefined, 'User cancelled passkey handler selection')
    return
  }
  if (handler === 'browser') {
    sendResponse(request.requestId, 'create', undefined, USE_BROWSER_NATIVE)
    return
  }

  try {
    const response = await sendMessage('passkey-create', request.data, 'background')
    if (response && (response as { success: boolean }).success) {
      sendResponse(request.requestId, 'create', (response as { data?: unknown }).data)
    } else {
      const errorResponse = response as { error?: string }
      sendResponse(request.requestId, 'create', undefined, errorResponse.error || 'Unknown error')
    }
  } catch (err) {
    console.error('[HaexPass Bridge] Create error:', err)
    sendResponse(request.requestId, 'create', undefined, 'NO_HAEX_PASS_CONNECTION')
  }
}

async function handleWebAuthnGet(request: WebAuthnGetRequest) {
  const { relyingPartyId } = request.data

  const handler = await resolveHandler(relyingPartyId, relyingPartyId, 'get')
  if (handler === null) {
    sendResponse(request.requestId, 'get', undefined, 'User cancelled passkey handler selection')
    return
  }
  if (handler === 'browser') {
    sendResponse(request.requestId, 'get', undefined, USE_BROWSER_NATIVE)
    return
  }

  try {
    const response = await sendMessage('passkey-get', request.data, 'background')
    if (response && (response as { success: boolean }).success) {
      sendResponse(request.requestId, 'get', (response as { data?: unknown }).data)
    } else {
      const errorResponse = response as { error?: string }
      sendResponse(request.requestId, 'get', undefined, errorResponse.error || 'Unknown error')
    }
  } catch (err) {
    console.error('[HaexPass Bridge] Get error:', err)
    sendResponse(request.requestId, 'get', undefined, 'NO_HAEX_PASS_CONNECTION')
  }
}

function handleMessage(event: MessageEvent) {
  if (event.source !== window)
    return

  const message = event.data as WebAuthnRequest
  if (!message.type?.startsWith('HAEX_PASS_WEBAUTHN_'))
    return
  if (message.type.includes('RESPONSE'))
    return

  if (message.type === 'HAEX_PASS_WEBAUTHN_CREATE') {
    void handleWebAuthnCreate(message as WebAuthnCreateRequest)
  } else if (message.type === 'HAEX_PASS_WEBAUTHN_GET') {
    void handleWebAuthnGet(message as WebAuthnGetRequest)
  }
}

export function initWebAuthnBridge() {
  window.addEventListener('message', handleMessage)
}
